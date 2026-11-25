-- Disposable-first schema for the persistent migration lock adapter.
-- Never apply to the existing staging or production D1 without separate approval.
CREATE TABLE nf_migration_runs (
  run_id TEXT PRIMARY KEY,
  plan_sha256 TEXT NOT NULL CHECK(length(plan_sha256)=64),
  manifest_sha256 TEXT NOT NULL CHECK(length(manifest_sha256)=64),
  target_database_id TEXT NOT NULL CHECK(target_database_id IN ('89be73af-ebaf-4c19-b75a-9871adb8ba3c','a12fb838-1bd1-4811-9cf1-2ad5b21089d4')),
  worker_name TEXT NOT NULL CHECK((target_database_id='89be73af-ebaf-4c19-b75a-9871adb8ba3c' AND worker_name='nature-frontiers-staging') OR (target_database_id='a12fb838-1bd1-4811-9cf1-2ad5b21089d4' AND worker_name='nf-adapter-worker-rehearsal')),
  actor TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('PLANNED','APPROVED','LOCKED','PRECHECKED','REFUSED','FAILED_BEFORE_DDL','AMBIGUOUS','RELEASED')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
  approval_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reason TEXT NOT NULL
) STRICT;

CREATE TABLE nf_migration_run_events (
  run_id TEXT NOT NULL REFERENCES nf_migration_runs(run_id),
  revision INTEGER NOT NULL,
  state TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  approval_id TEXT,
  PRIMARY KEY(run_id,revision)
) STRICT;

CREATE TABLE nf_migration_lock (
  lock_key TEXT PRIMARY KEY CHECK(lock_key='global'),
  target_database_id TEXT NOT NULL CHECK(target_database_id='89be73af-ebaf-4c19-b75a-9871adb8ba3c'),
  worker_name TEXT NOT NULL CHECK(worker_name='nature-frontiers-staging'),
  run_id TEXT NOT NULL REFERENCES nf_migration_runs(run_id),
  plan_sha256 TEXT NOT NULL CHECK(length(plan_sha256)=64),
  manifest_sha256 TEXT NOT NULL CHECK(length(manifest_sha256)=64),
  owner_token_hash TEXT NOT NULL CHECK(length(owner_token_hash)=64),
  acquired_at TEXT NOT NULL,
  expires_at TEXT CHECK(expires_at IS NULL),
  recovery_approval_id TEXT
) STRICT;

CREATE TABLE nf_migration_lock_events (
  event_key TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES nf_migration_runs(run_id),
  event_type TEXT NOT NULL CHECK(event_type IN ('ACQUIRED','RELEASED','STALE_RECOVERED')),
  owner_token_hash TEXT NOT NULL CHECK(length(owner_token_hash)=64),
  occurred_at TEXT NOT NULL,
  approval_id TEXT
) STRICT;

CREATE INDEX nf_migration_lock_events_run ON nf_migration_lock_events(run_id,occurred_at);
