-- Lead intake case study: database schema.
-- Postgres is the source of truth. The Google Sheet is a mirror for humans.

CREATE EXTENSION IF NOT EXISTS citext;

-- Every form submission, including duplicates. Never deleted, never deduped.
CREATE TABLE IF NOT EXISTS leads (
  id            bigserial PRIMARY KEY,
  request_id    uuid        NOT NULL UNIQUE,          -- idempotency key from the app
  received_at   timestamptz NOT NULL DEFAULT now(),
  full_name     text        NOT NULL,
  email         citext      NOT NULL,                 -- normalized (trimmed, lowercased)
  email_raw     text        NOT NULL,                 -- exactly what was typed
  comment       text        NOT NULL DEFAULT '',
  interests_raw text        NOT NULL DEFAULT '',
  utm_source    text        NOT NULL DEFAULT 'direct',
  is_test       boolean     NOT NULL DEFAULT false,
  status        text        NOT NULL DEFAULT 'received'
                CHECK (status IN ('received','processed','skipped_duplicate','failed')),
  status_note   text,
  sheet_synced  boolean     NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS leads_email_idx ON leads (email);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads (status, received_at);

-- One row per processed email. The primary key is what makes "skip if already
-- processed" safe even when two submits arrive at the same moment.
CREATE TABLE IF NOT EXISTS leads_log (
  email           citext      PRIMARY KEY,
  lead_id         bigint      NOT NULL REFERENCES leads(id),
  type            text        CHECK (type IN ('urgent','welcome')),
  interests_count int         CHECK (interests_count >= 0),
  status          text        NOT NULL DEFAULT 'processing'
                  CHECK (status IN ('processing','done','failed')),
  email_sent_at   timestamptz,
  email_message_id text,
  is_test         boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One row per interest per lead.
CREATE TABLE IF NOT EXISTS interest_log (
  id         bigserial   PRIMARY KEY,
  lead_id    bigint      NOT NULL REFERENCES leads(id),
  email      citext      NOT NULL,
  interest   text        NOT NULL,
  is_test    boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, interest)
);
CREATE INDEX IF NOT EXISTS interest_log_interest_idx ON interest_log (interest);

-- Who hears about problems. Edit this table to add or remove people.
CREATE TABLE IF NOT EXISTS alert_recipients (
  email  citext  PRIMARY KEY,
  active boolean NOT NULL DEFAULT true
);

-- Problems the watchdog found. One open alert per (kind, subject) so nobody
-- gets the same email every 15 minutes.
CREATE TABLE IF NOT EXISTS alerts (
  id          bigserial   PRIMARY KEY,
  kind        text        NOT NULL,
  subject_key text        NOT NULL,
  details     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  opened_at   timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  resolved_at timestamptz,
  resolved_notified_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS alerts_one_open
  ON alerts (kind, subject_key) WHERE resolved_at IS NULL;

-- Crashes reported by the n8n error workflow.
CREATE TABLE IF NOT EXISTS error_events (
  id           bigserial   PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  workflow     text,
  node         text,
  message      text,
  execution_id text,
  execution_url text
);

-- Watchdog heartbeat, so the app can show "last check" and so a dead
-- watchdog is itself visible.
CREATE TABLE IF NOT EXISTS heartbeats (
  name    text PRIMARY KEY,
  beat_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
