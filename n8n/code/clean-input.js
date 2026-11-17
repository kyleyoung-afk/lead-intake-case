// Clean input (Code node, run once for all items).
// Turns the raw form payload into the values every later step relies on.
// Every rule below exists because of something in the sample data.
const body = $input.first().json.body || {};

const str = (v) => (v == null ? '' : String(v));
const squash = (s) => str(s).replace(/\s+/g, ' ').trim();

// Email: "John@Example.com " and "john@example.com" are the same person.
const email = str(body.email).trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error(`Invalid email reached n8n: "${email}"`);
}

// Interests: the sample has "Api" and "API" for the same thing, and
// people type commas, semicolons, slashes or new lines.
const CANON = { api: 'API', apis: 'API', doc: 'Docs', docs: 'Docs', documentation: 'Docs',
  support: 'Support', training: 'Training', trainings: 'Training' };
const titleCase = (s) => s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
const seen = new Set();
const interests = [];
for (const raw of str(body.interests).split(/[,;\/|\n]+/)) {
  const cleaned = squash(raw).replace(/^[-*•]\s*/, '').slice(0, 50);
  if (!cleaned) continue;
  const key = cleaned.toLowerCase();
  const name = CANON[key] || titleCase(cleaned);
  if (seen.has(name.toLowerCase())) continue;
  seen.add(name.toLowerCase());
  interests.push(name);
  if (interests.length >= 20) break;
}

// Urgent: the sample writes "urgent:" and "urgent -", so match the word,
// any case, any punctuation. "Not urgent" is a real thing people write,
// and sending them the urgent email would be wrong, so it counts as welcome.
const comment = str(body.comment).trim().slice(0, 2000);
const mentionsUrgent = /\burgent(ly)?\b/i.test(comment);
const negated = /\b(not|isn'?t|no|non)[\s-]+(that\s+|very\s+|super\s+)?urgent/i.test(comment);
const type = mentionsUrgent && !negated ? 'urgent' : 'welcome';

const utm = squash(body.utm_source).toLowerCase().slice(0, 100) || 'direct';

return [{
  json: {
    request_id: str(body.request_id),
    full_name: squash(body.full_name).slice(0, 120),
    email,
    email_raw: str(body.email).slice(0, 254),
    comment,
    interests_raw: str(body.interests).slice(0, 1000),
    interests,
    interests_count: interests.length,
    utm_source: utm,
    type,
    urgent_reason: mentionsUrgent ? (negated ? 'says not urgent' : 'contains "urgent"') : 'no "urgent" in comment',
    is_test: body.is_test === true,
  },
}];
