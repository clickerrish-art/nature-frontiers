-- Hash-bound human editorial and safety review evidence required before approval.
CREATE TABLE IF NOT EXISTS review_evidence (
  content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  content_sha256 TEXT NOT NULL,
  human_review_confirmed INTEGER NOT NULL CHECK (human_review_confirmed IN (0,1)),
  content_accuracy_confirmed INTEGER NOT NULL CHECK (content_accuracy_confirmed IN (0,1)),
  wildlife_welfare_confirmed INTEGER NOT NULL CHECK (wildlife_welfare_confirmed IN (0,1)),
  non_graphic_review_passed INTEGER NOT NULL CHECK (non_graphic_review_passed IN (0,1)),
  media_integrity_review_passed INTEGER NOT NULL CHECK (media_integrity_review_passed IN (0,1)),
  media_technical_review_passed INTEGER NOT NULL CHECK (media_technical_review_passed IN (0,1)),
  watermark_scan_passed INTEGER NOT NULL CHECK (watermark_scan_passed IN (0,1)),
  media_accessibility_confirmed INTEGER NOT NULL CHECK (media_accessibility_confirmed IN (0,1)),
  script_originality_confirmed INTEGER NOT NULL CHECK (script_originality_confirmed IN (0,1)),
  voiceover_originality_confirmed INTEGER NOT NULL CHECK (voiceover_originality_confirmed IN (0,1)),
  reviewer TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  PRIMARY KEY (content_id, content_sha256)
);
