-- Meta webhook delivery ledger. Deliberately stores only a payload digest and minimal
-- envelope metadata; raw webhook payloads may contain personal data and are not retained.
CREATE TABLE IF NOT EXISTS meta_webhook_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  received_at TEXT NOT NULL,
  object_type TEXT NOT NULL,
  entry_count INTEGER NOT NULL CHECK (entry_count >= 0)
);
CREATE INDEX IF NOT EXISTS idx_meta_webhook_events_received_at
  ON meta_webhook_events(received_at);
