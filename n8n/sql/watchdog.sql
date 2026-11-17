-- Watchdog: one statement that finds every current problem, opens alerts for
-- new ones, resolves alerts whose problem is gone, and records a heartbeat.
-- $1 = is the Gmail connection working (boolean).
WITH cur (kind, subject_key, details) AS (
  -- Claimed but never finished (crashed between steps).
  SELECT 'stuck_processing', email::text,
         jsonb_build_object('note', 'processing since ' || to_char(updated_at, 'YYYY-MM-DD HH24:MI'))
    FROM leads_log WHERE status = 'processing' AND updated_at < now() - interval '5 minutes'
  UNION ALL
  -- Failed and not retried yet.
  SELECT 'lead_failed', email::text, jsonb_build_object('note', 'lead ' || lead_id)
    FROM leads_log WHERE status = 'failed'
  UNION ALL
  -- Received but the run died before it decided anything.
  SELECT 'received_not_processed', 'lead ' || id, jsonb_build_object('note', email::text)
    FROM leads WHERE status = 'received' AND received_at < now() - interval '5 minutes'
  UNION ALL
  -- Leads Log says N interests but Interest Log has a different number.
  SELECT 'count_mismatch', g.email::text,
         jsonb_build_object('note', 'Leads Log says ' || g.interests_count || ', Interest Log has ' || coalesce(c.n, 0))
    FROM leads_log g
    LEFT JOIN (SELECT email, count(*) AS n FROM interest_log GROUP BY email) c ON c.email = g.email
   WHERE g.status = 'done' AND g.interests_count <> coalesce(c.n, 0)
  UNION ALL
  -- Marked done but there is no record of the email going out.
  SELECT 'missing_email', email::text, '{}'::jsonb
    FROM leads_log WHERE status = 'done' AND email_sent_at IS NULL
  UNION ALL
  -- The duplicate check should make this impossible. If it ever happens, say so.
  SELECT 'duplicate_slipped', email::text, jsonb_build_object('note', count(*) || ' processed submissions')
    FROM leads WHERE status = 'processed' GROUP BY email HAVING count(*) > 1
  UNION ALL
  -- In Postgres but still not in the Google Sheet after 15 minutes.
  SELECT 'sheet_not_synced', 'lead ' || id, jsonb_build_object('note', email::text)
    FROM leads WHERE NOT sheet_synced AND status <> 'received' AND received_at < now() - interval '15 minutes'
  UNION ALL
  SELECT 'gmail_down', 'gmail', jsonb_build_object('note', 'could not read the Gmail profile')
   WHERE NOT $1::boolean
),
opened AS (
  INSERT INTO alerts (kind, subject_key, details)
  SELECT kind, subject_key, details FROM cur
  ON CONFLICT (kind, subject_key) WHERE resolved_at IS NULL DO NOTHING
  RETURNING id, kind, subject_key, details
),
resolved AS (
  UPDATE alerts a SET resolved_at = now()
   WHERE a.resolved_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM cur WHERE cur.kind = a.kind AND cur.subject_key = a.subject_key)
  RETURNING id, kind, subject_key, details, notified_at
),
beat AS (
  INSERT INTO heartbeats (name, beat_at, details)
  VALUES ('watchdog', now(), jsonb_build_object('problems', (SELECT count(*) FROM cur)))
  ON CONFLICT (name) DO UPDATE SET beat_at = now(), details = EXCLUDED.details
  RETURNING 1
)
SELECT
  (SELECT coalesce(json_agg(o), '[]'::json) FROM opened o) AS opened,
  -- Open alerts we never managed to email (e.g. Gmail was down): try again.
  (SELECT coalesce(json_agg(p), '[]'::json) FROM (
     SELECT id, kind, subject_key, details FROM alerts
      WHERE resolved_at IS NULL AND notified_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM resolved r WHERE r.id = alerts.id)) p) AS pending,
  -- Only send "all clear" for problems somebody was actually told about.
  (SELECT coalesce(json_agg(r), '[]'::json) FROM resolved r WHERE r.notified_at IS NOT NULL) AS resolved,
  (SELECT coalesce(json_agg(email), '[]'::json) FROM alert_recipients WHERE active) AS recipients,
  (SELECT coalesce(json_agg(id), '[]'::json) FROM leads
    WHERE NOT sheet_synced AND status <> 'received'
      AND received_at < now() - interval '5 minutes' AND received_at > now() - interval '1 day') AS resync_ids,
  (SELECT count(*) FROM beat) AS heartbeat;
