// Small backend for the lead intake case study.
// Jobs: check form input, block spam, hand clean data to n8n, and serve the
// read-only report data. It never writes lead data itself. n8n does that.
import express from 'express';
import pg from 'pg';
import { z } from 'zod';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const {
  PORT = 3000,
  DATABASE_URL,
  N8N_INTAKE_URL,
  N8N_SUMMARY_URL,
  WEBHOOK_SECRET,
  TEST_TOKEN = '',
} = process.env;

for (const [k, v] of Object.entries({ DATABASE_URL, N8N_INTAKE_URL, N8N_SUMMARY_URL, WEBHOOK_SECRET })) {
  if (!v) throw new Error(`Missing env ${k}`);
}

const db = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

// Apache sets this from the real visitor IP (Cloudflare-aware). It overwrites
// anything the visitor sends, so it can't be spoofed from outside.
const clientIp = (req) => req.get('x-leadcase-client-ip') || req.socket.remoteAddress || 'unknown';

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
const isTestRequest = (req) => Boolean(TEST_TOKEN) && safeEqual(req.get('x-test-token') || '', TEST_TOKEN);

// ---- rate limit: 5 submissions per 10 minutes per IP (in memory) ----------
const WINDOW_MS = 10 * 60 * 1000, MAX_HITS = 5;
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > MAX_HITS;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) if (list.every((t) => now - t >= WINDOW_MS)) hits.delete(ip);
}, 60_000).unref();

// ---- input rules ------------------------------------------------------------
const interestsField = z
  .union([z.array(z.string()), z.string()])
  .transform((v) => (Array.isArray(v) ? v.join(',') : v))
  .pipe(z.string().max(1000));

const LeadInput = z.object({
  full_name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().max(254).email('That email address does not look right'),
  comment: z.string().max(2000).default(''),
  interests: interestsField.default(''),
  utm_source: z.string().trim().max(100).default(''),
  request_id: z.string().uuid().optional(),
  website: z.string().optional(), // honeypot: real people never fill this in
});

// ---- routes -----------------------------------------------------------------
app.post('/api/leads', async (req, res) => {
  const test = isTestRequest(req);
  if (!test && rateLimited(clientIp(req))) {
    return res.status(429).json({ error: 'Too many submissions. Please wait a few minutes.' });
  }

  const parsed = LeadInput.safeParse(req.body ?? {});
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message]));
    return res.status(400).json({ error: 'Please fix the highlighted fields.', fields });
  }
  const input = parsed.data;

  // Bots fill every field. Pretend it worked so they learn nothing.
  if (input.website) return res.status(202).json({ status: 'received' });

  const payload = {
    request_id: input.request_id || randomUUID(),
    full_name: input.full_name,
    email: input.email,
    comment: input.comment,
    interests: input.interests,
    utm_source: input.utm_source,
    is_test: test,
  };

  try {
    const r = await fetch(N8N_INTAKE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-leadcase-secret': WEBHOOK_SECRET },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45_000),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('intake failed', r.status, body);
      return res.status(502).json({ error: 'We could not process that right now. Please try again in a minute.' });
    }
    return res.json(body);
  } catch (err) {
    console.error('intake unreachable', err.message);
    return res.status(503).json({ error: 'We could not process that right now. Please try again in a minute.' });
  }
});

app.get('/api/logs', async (req, res) => {
  const email = String(req.query.email || '').trim().slice(0, 254);
  const interest = String(req.query.interest || '').trim().slice(0, 100);
  const like = (s) => `%${s.replace(/[\\%_]/g, (c) => '\\' + c)}%`;

  // Interest filter on Leads Log = "leads who picked that interest".
  const leadsLog = await db.query(
    `SELECT l.email, l.type, l.interests_count, l.status, l.email_sent_at, l.created_at, l.is_test
       FROM leads_log l
      WHERE ($1 = '' OR l.email ILIKE $2)
        AND ($3 = '' OR EXISTS (SELECT 1 FROM interest_log i
                                 WHERE i.email = l.email AND i.interest ILIKE $4))
      ORDER BY l.created_at DESC
      LIMIT 500`,
    [email, like(email), interest, like(interest)],
  );
  const interestLog = await db.query(
    `SELECT i.email, i.interest, i.created_at, i.is_test
       FROM interest_log i
      WHERE ($1 = '' OR i.email ILIKE $2)
        AND ($3 = '' OR i.interest ILIKE $4)
      ORDER BY i.created_at DESC, i.email, i.interest
      LIMIT 2000`,
    [email, like(email), interest, like(interest)],
  );
  const interests = await db.query(`SELECT DISTINCT interest FROM interest_log ORDER BY interest`);
  res.json({
    leads_log: leadsLog.rows,
    interest_log: interestLog.rows,
    interests: interests.rows.map((r) => r.interest),
  });
});

// The summary is made by n8n (it holds the AI key). Cache it until the logs change.
let summaryCache = { key: null, body: null };
app.get('/api/summary', async (_req, res) => {
  const { rows } = await db.query(
    `SELECT (SELECT count(*) FROM leads_log) AS a,
            (SELECT max(updated_at) FROM leads_log) AS b,
            (SELECT count(*) FROM interest_log) AS c`,
  );
  const key = JSON.stringify(rows[0]);
  if (summaryCache.key === key) return res.json({ ...summaryCache.body, cached: true });
  try {
    const r = await fetch(N8N_SUMMARY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-leadcase-secret': WEBHOOK_SECRET },
      body: '{}',
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) throw new Error(`summary ${r.status}`);
    const body = await r.json();
    summaryCache = { key, body };
    res.json(body);
  } catch (err) {
    console.error('summary failed', err.message);
    res.status(502).json({ error: 'Summary is unavailable right now.' });
  }
});

app.get('/api/health', async (_req, res) => {
  const { rows } = await db.query(`
    SELECT
      (SELECT count(*)::int FROM leads)                                        AS submissions,
      (SELECT count(*)::int FROM leads WHERE status = 'processed')             AS processed,
      (SELECT count(*)::int FROM leads WHERE status = 'skipped_duplicate')     AS skipped_duplicates,
      (SELECT count(*)::int FROM leads WHERE status = 'failed')                AS failed,
      (SELECT count(*)::int FROM alerts WHERE resolved_at IS NULL)             AS open_alerts,
      (SELECT max(received_at) FROM leads)                                     AS last_submission_at,
      (SELECT beat_at FROM heartbeats WHERE name = 'watchdog')                 AS watchdog_last_run_at`);
  const h = rows[0];
  const watchdogStale = !h.watchdog_last_run_at || Date.now() - new Date(h.watchdog_last_run_at) > 20 * 60 * 1000;
  res.json({ ...h, watchdog_stale: watchdogStale });
});

// ---- web app ----------------------------------------------------------------
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'web', 'dist');
app.use(express.static(dist, { maxAge: '1h', index: false }));
app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

app.listen(PORT, () => console.log(`leadcase app on :${PORT}`));
