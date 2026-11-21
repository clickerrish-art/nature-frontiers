-- Reconstructed from the read-only production D1 schema inspection on 21 November 2026.
-- The migration is intentionally idempotent so it can be applied to an existing database.
CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN ('feed_post','reel')),
  caption TEXT NOT NULL,
  media_url TEXT NOT NULL,
  media_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','needs_review','approved','scheduled','publishing','published','held','failed')),
  scheduled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_content_schedule
  ON content_items(status, scheduled_at);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  reviewer TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected')),
  content_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  content_id TEXT,
  actor TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS content_targets (
  content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram')),
  account_id TEXT NOT NULL,
  platform_media_id TEXT,
  published_at TEXT,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held','approved','publishing','published','failed')),
  PRIMARY KEY (content_id, platform)
);

CREATE TABLE IF NOT EXISTS media_rights (
  media_sha256 TEXT PRIMARY KEY,
  rights_status TEXT NOT NULL CHECK (rights_status IN ('unverified','licensed','owned','public_domain','rejected')),
  rights_holder TEXT,
  source_url TEXT,
  license_reference TEXT,
  verified_by TEXT,
  verified_at TEXT,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS publication_attempts (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id),
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram')),
  idempotency_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('reserved','confirmed','ambiguous','failed')),
  platform_post_id TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  error_code TEXT
);

CREATE INDEX IF NOT EXISTS idx_attempt_content
  ON publication_attempts(content_id, platform);
