-- Exact-hash wildlife provenance and on-screen disclosure evidence.
CREATE TABLE IF NOT EXISTS media_evidence (
  media_sha256 TEXT PRIMARY KEY REFERENCES media_rights(media_sha256) ON DELETE CASCADE,
  media_origin TEXT NOT NULL CHECK (media_origin = 'original_camera_recording'),
  stock_footage_used INTEGER NOT NULL CHECK (stock_footage_used IN (0,1)),
  synthetic_visuals INTEGER NOT NULL CHECK (synthetic_visuals IN (0,1)),
  ai_generated_video INTEGER NOT NULL CHECK (ai_generated_video IN (0,1)),
  source_creator TEXT,
  license_name TEXT,
  license_evidence_url TEXT,
  source_recording_id TEXT,
  original_camera_file_sha256 TEXT,
  original_recording_retained INTEGER,
  provenance_review_passed INTEGER NOT NULL CHECK (provenance_review_passed IN (0,1)),
  provenance_reviewer TEXT NOT NULL,
  provenance_reviewed_at TEXT NOT NULL,
  on_screen_disclosure_text TEXT,
  on_screen_disclosure_media_sha256 TEXT,
  caption_attribution TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
