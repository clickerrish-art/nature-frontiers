-- Persist the educational narrative and bind editorial review and owner approval to it.
ALTER TABLE content_items ADD COLUMN educational_story_json TEXT;
ALTER TABLE content_items ADD COLUMN educational_story_sha256 TEXT;
ALTER TABLE review_evidence ADD COLUMN educational_story_sha256 TEXT;
ALTER TABLE approvals ADD COLUMN educational_story_sha256 TEXT;

CREATE INDEX IF NOT EXISTS idx_approvals_story_binding
  ON approvals(content_id, content_sha256, educational_story_sha256, created_at);
