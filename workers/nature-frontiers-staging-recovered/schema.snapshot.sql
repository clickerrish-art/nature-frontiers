-- READ-ONLY STAGING SCHEMA SNAPSHOT captured 2026-11-25.\n-- This is not an original migration and must not be applied to the active staging database.\n-- No application row data is included. Platform-managed _cf_KV is intentionally excluded.\n\n-- table: analytics_snapshots\nCREATE TABLE analytics_snapshots (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram')),
  collected_at TEXT NOT NULL,
  source_api_version TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  UNIQUE(content_id, platform, collected_at)
);\n\n-- table: approval_receipts\nCREATE TABLE approval_receipts (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram')),
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected')),
  reviewer_id TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  rights_evidence_sha256 TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  signed_receipt TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);\n\n-- table: approvals\nCREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  reviewer TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected')),
  content_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);\n\n-- table: audit_chain\nCREATE TABLE audit_chain (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  actor TEXT NOT NULL,
  event_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  payload_sha256 TEXT,
  previous_hash TEXT NOT NULL,
  event_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);\n\n-- table: audit_events\nCREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  content_id TEXT,
  actor TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);\n\n-- table: backup_records\nCREATE TABLE backup_records (
  id TEXT PRIMARY KEY,
  backup_uri TEXT NOT NULL,
  storage_provider TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length > 0),
  encryption_key_reference TEXT NOT NULL,
  created_at TEXT NOT NULL,
  verified_at TEXT,
  restore_tested_at TEXT,
  restore_test_sha256 TEXT
);\n\n-- table: campaigns\nCREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  commercial INTEGER NOT NULL DEFAULT 0 CHECK (commercial IN (0,1)),
  disclosure_required INTEGER NOT NULL DEFAULT 0 CHECK (disclosure_required IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);\n\n-- table: content_audit_events\nCREATE TABLE content_audit_events (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id),
  actor TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('content.created','content.updated')),
  revision INTEGER NOT NULL,
  payload_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);\n\n-- table: content_items\nCREATE TABLE content_items (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN ('feed_post','reel')),
  caption TEXT NOT NULL,
  media_url TEXT NOT NULL,
  media_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','needs_review','approved','scheduled','publishing','published','held','failed')),
  scheduled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, campaign_id TEXT REFERENCES campaigns(id));\n\n-- table: content_revisions\nCREATE TABLE content_revisions (
  content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision > 0),
  content_type TEXT NOT NULL CHECK (content_type IN ('feed_post','reel')),
  caption TEXT NOT NULL,
  media_url TEXT NOT NULL,
  media_sha256 TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  editor TEXT NOT NULL,
  created_at TEXT NOT NULL, campaign_id TEXT REFERENCES campaigns(id),
  PRIMARY KEY (content_id, revision)
);\n\n-- table: content_targets\nCREATE TABLE content_targets (
  content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram')),
  account_id TEXT NOT NULL,
  platform_media_id TEXT,
  published_at TEXT,
  status TEXT NOT NULL DEFAULT 'held'
    CHECK (status IN ('held','approved','publishing','published','failed')),
  PRIMARY KEY (content_id, platform)
);\n\n-- table: login_rate_limits\nCREATE TABLE login_rate_limits (
  ip_hash TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  failure_count INTEGER NOT NULL CHECK (failure_count >= 0),
  blocked_until INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);\n\n-- table: media_assets\nCREATE TABLE media_assets (
  media_sha256 TEXT PRIMARY KEY,
  storage_provider TEXT NOT NULL CHECK (storage_provider IN ('r2','external')),
  object_key TEXT,
  media_url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length > 0),
  duration_ms INTEGER,
  width INTEGER,
  height INTEGER,
  provenance_json TEXT NOT NULL,
  validation_status TEXT NOT NULL CHECK (validation_status IN ('pending','passed','failed','held')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);\n\n-- table: media_rights\nCREATE TABLE media_rights (
  media_sha256 TEXT PRIMARY KEY,
  rights_status TEXT NOT NULL
    CHECK (rights_status IN ('unverified','licensed','owned','public_domain','rejected')),
  rights_holder TEXT,
  source_url TEXT,
  license_reference TEXT,
  verified_by TEXT,
  verified_at TEXT,
  expires_at TEXT
);\n\n-- table: media_rights_evidence\nCREATE TABLE media_rights_evidence (
  id TEXT PRIMARY KEY,
  media_sha256 TEXT NOT NULL REFERENCES media_assets(media_sha256),
  rights_status TEXT NOT NULL CHECK (rights_status IN ('owned','licensed','public_domain','rejected','unverified')),
  rights_holder TEXT,
  source_url TEXT,
  license_reference TEXT,
  permitted_platforms_json TEXT NOT NULL DEFAULT '[]',
  permitted_uses_json TEXT NOT NULL DEFAULT '[]',
  evidence_uri TEXT,
  evidence_sha256 TEXT,
  verified_by TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);\n\n-- table: meta_connections\nCREATE TABLE meta_connections (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider = 'meta'),
  page_id TEXT NOT NULL,
  page_name TEXT,
  instagram_business_account_id TEXT,
  granted_permissions_json TEXT NOT NULL DEFAULT '[]',
  secret_binding_name TEXT NOT NULL,
  token_expires_at TEXT,
  identity_verified_at TEXT,
  permissions_verified_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('unverified','verified','expired','revoked','blocked')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, access_token_ciphertext TEXT, access_token_nonce TEXT, token_key_version INTEGER NOT NULL DEFAULT 1, instagram_identity_verified_at TEXT, page_tasks_json TEXT NOT NULL DEFAULT '[]');\n\n-- table: meta_webhook_events\nCREATE TABLE meta_webhook_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  received_at TEXT NOT NULL,
  object_type TEXT NOT NULL,
  entry_count INTEGER NOT NULL CHECK (entry_count >= 0)
);\n\n-- table: nf_schema_migrations\nCREATE TABLE nf_schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL);\n\n-- table: oauth_states\nCREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('meta')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  redirect_uri TEXT NOT NULL,
  initiating_subject TEXT NOT NULL
);\n\n-- table: operator_sessions\nCREATE TABLE operator_sessions (
  session_hash TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner')),
  csrf_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_seen_at TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  user_agent_hash TEXT NOT NULL
);\n\n-- table: publication_attempts\nCREATE TABLE publication_attempts (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id),
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram')),
  idempotency_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('reserved','confirmed','ambiguous','failed')),
  platform_post_id TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  error_code TEXT
);\n\n-- table: schedule_slots\nCREATE TABLE schedule_slots (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram')),
  scheduled_at TEXT NOT NULL,
  timezone TEXT NOT NULL CHECK (timezone = 'Africa/Johannesburg'),
  state TEXT NOT NULL CHECK (state IN ('held','ready','leased','publishing','published','failed','cancelled','dead_letter')),
  idempotency_key TEXT NOT NULL UNIQUE,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  lease_token_hash TEXT,
  lease_expires_at TEXT,
  next_attempt_at TEXT,
  published_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(content_id, platform)
);\n\n-- table: system_controls\nCREATE TABLE system_controls (
  key TEXT PRIMARY KEY CHECK (key IN ('emergency_stop','publishing_enabled','dry_run')),
  enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)
);\n\n-- table: webhook_delivery_events\nCREATE TABLE webhook_delivery_events (
  provider_event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider = 'meta'),
  signature_verified INTEGER NOT NULL CHECK (signature_verified IN (0,1)),
  received_at TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  processing_state TEXT NOT NULL CHECK (processing_state IN ('received','processed','ignored','failed')),
  processed_at TEXT,
  error_code TEXT
);\n\n-- table: worker_runs\nCREATE TABLE worker_runs (
  id TEXT PRIMARY KEY,
  schedule_slot_id TEXT NOT NULL REFERENCES schedule_slots(id),
  worker_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('started','heartbeat','completed','failed','abandoned')),
  started_at TEXT NOT NULL,
  heartbeat_at TEXT,
  finished_at TEXT,
  error_code TEXT
);\n\n-- index: idx_approval_payload\nCREATE INDEX idx_approval_payload
  ON approval_receipts(content_id, platform, payload_sha256, decision);\n\n-- index: idx_attempt_content\nCREATE INDEX idx_attempt_content
  ON publication_attempts(content_id, platform);\n\n-- index: idx_audit_chain_created\nCREATE INDEX idx_audit_chain_created
  ON audit_chain(created_at, sequence);\n\n-- index: idx_campaign_status_updated\nCREATE INDEX idx_campaign_status_updated
  ON campaigns(status, updated_at DESC);\n\n-- index: idx_content_audit_event_revision\nCREATE UNIQUE INDEX idx_content_audit_event_revision
  ON content_audit_events(content_id, event_type, revision);\n\n-- index: idx_content_audit_events_content\nCREATE INDEX idx_content_audit_events_content
  ON content_audit_events(content_id, created_at);\n\n-- index: idx_content_campaign\nCREATE INDEX idx_content_campaign
  ON content_items(campaign_id, updated_at DESC);\n\n-- index: idx_content_revisions_latest\nCREATE INDEX idx_content_revisions_latest
  ON content_revisions(content_id, revision DESC);\n\n-- index: idx_content_schedule\nCREATE INDEX idx_content_schedule
  ON content_items(status, scheduled_at);\n\n-- index: idx_login_rate_limits_blocked\nCREATE INDEX idx_login_rate_limits_blocked
  ON login_rate_limits(blocked_until);\n\n-- index: idx_meta_connection_page\nCREATE UNIQUE INDEX idx_meta_connection_page
  ON meta_connections(provider, page_id);\n\n-- index: idx_meta_webhook_events_received_at\nCREATE INDEX idx_meta_webhook_events_received_at
  ON meta_webhook_events(received_at);\n\n-- index: idx_oauth_states_expiry\nCREATE INDEX idx_oauth_states_expiry
  ON oauth_states(expires_at, consumed_at);\n\n-- index: idx_operator_sessions_expiry\nCREATE INDEX idx_operator_sessions_expiry
  ON operator_sessions(expires_at, revoked_at);\n\n-- index: idx_revision_campaign\nCREATE INDEX idx_revision_campaign
  ON content_revisions(campaign_id, content_id, revision);\n\n-- index: idx_rights_media_status\nCREATE INDEX idx_rights_media_status
  ON media_rights_evidence(media_sha256, rights_status, expires_at);\n\n-- index: idx_schedule_due\nCREATE INDEX idx_schedule_due
  ON schedule_slots(state, scheduled_at, next_attempt_at, lease_expires_at);\n\n-- index: idx_webhook_received\nCREATE INDEX idx_webhook_received
  ON webhook_delivery_events(received_at, processing_state);\n\n-- index: idx_worker_runs_slot\nCREATE INDEX idx_worker_runs_slot
  ON worker_runs(schedule_slot_id, started_at);\n\n-- trigger: approval_receipts_audit_insert\nCREATE TRIGGER approval_receipts_audit_insert
AFTER INSERT ON approval_receipts
BEGIN
  INSERT INTO audit_events(id,event_type,content_id,actor,details_json,created_at)
  VALUES(lower(hex(randomblob(16))),'content.approval.recorded',NEW.content_id,NEW.reviewer_id,
    json_object('approvalId',NEW.id,'platform',NEW.platform,'decision',NEW.decision,'payloadSha256',NEW.payload_sha256,'rightsEvidenceSha256',NEW.rights_evidence_sha256,'policyVersion',NEW.policy_version),
    NEW.created_at);
END;\n\n-- trigger: approval_receipts_audit_revoke\nCREATE TRIGGER approval_receipts_audit_revoke
AFTER UPDATE OF revoked_at ON approval_receipts
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
BEGIN
  INSERT INTO audit_events(id,event_type,content_id,actor,details_json,created_at)
  VALUES(lower(hex(randomblob(16))),'content.approval.revoked',NEW.content_id,NEW.reviewer_id,
    json_object('approvalId',NEW.id,'platform',NEW.platform,'payloadSha256',NEW.payload_sha256,'revokedAt',NEW.revoked_at),
    NEW.revoked_at);
  UPDATE schedule_slots SET state='held',lease_token_hash=NULL,lease_expires_at=NULL,updated_at=NEW.revoked_at
    WHERE content_id=NEW.content_id AND platform=NEW.platform AND state IN ('ready','leased');
END;\n\n-- trigger: approval_receipts_insert_guard\nCREATE TRIGGER approval_receipts_insert_guard
BEFORE INSERT ON approval_receipts
WHEN NEW.decision='approved'
AND NOT EXISTS (
  SELECT 1 FROM content_items ci
  JOIN content_revisions cr ON cr.content_id=ci.id
    AND cr.revision=(SELECT MAX(revision) FROM content_revisions WHERE content_id=ci.id)
    AND cr.payload_sha256=NEW.payload_sha256
  JOIN media_assets ma ON ma.media_sha256=ci.media_sha256 AND ma.validation_status='passed'
  JOIN media_rights_evidence mre ON mre.media_sha256=ma.media_sha256
    AND mre.evidence_sha256=NEW.rights_evidence_sha256
    AND mre.rights_status IN ('owned','licensed','public_domain')
    AND mre.revoked_at IS NULL AND (mre.expires_at IS NULL OR mre.expires_at>CURRENT_TIMESTAMP)
    AND EXISTS (SELECT 1 FROM json_each(mre.permitted_platforms_json) WHERE value=NEW.platform)
    AND EXISTS (SELECT 1 FROM json_each(mre.permitted_uses_json) WHERE value='social_media')
  WHERE ci.id=NEW.content_id
)
BEGIN SELECT RAISE(ABORT, 'approval blocked: current revision, validated media and matching unrevoked social rights are required'); END;\n\n-- trigger: approval_receipts_no_delete\nCREATE TRIGGER approval_receipts_no_delete
BEFORE DELETE ON approval_receipts
BEGIN SELECT RAISE(ABORT, 'approval receipt history is immutable'); END;\n\n-- trigger: approval_receipts_update_guard\nCREATE TRIGGER approval_receipts_update_guard
BEFORE UPDATE ON approval_receipts
WHEN
  NEW.id IS NOT OLD.id OR NEW.content_id IS NOT OLD.content_id OR NEW.platform IS NOT OLD.platform OR
  NEW.decision IS NOT OLD.decision OR NEW.reviewer_id IS NOT OLD.reviewer_id OR
  NEW.payload_sha256 IS NOT OLD.payload_sha256 OR NEW.rights_evidence_sha256 IS NOT OLD.rights_evidence_sha256 OR
  NEW.policy_version IS NOT OLD.policy_version OR NEW.signed_receipt IS NOT OLD.signed_receipt OR
  NEW.approved_at IS NOT OLD.approved_at OR NEW.expires_at IS NOT OLD.expires_at OR
  NEW.created_at IS NOT OLD.created_at OR OLD.revoked_at IS NOT NULL OR
  NEW.revoked_at IS NULL OR NEW.revoked_at IS OLD.revoked_at
BEGIN SELECT RAISE(ABORT, 'approval receipt is immutable; only one-way revocation is allowed'); END;\n\n-- trigger: audit_chain_no_delete\nCREATE TRIGGER audit_chain_no_delete
BEFORE DELETE ON audit_chain
BEGIN
  SELECT RAISE(ABORT, 'audit_chain is append-only');
END;\n\n-- trigger: audit_chain_no_update\nCREATE TRIGGER audit_chain_no_update
BEFORE UPDATE ON audit_chain
BEGIN
  SELECT RAISE(ABORT, 'audit_chain is append-only');
END;\n\n-- trigger: audit_events_no_delete\nCREATE TRIGGER audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit events are append-only'); END;\n\n-- trigger: audit_events_no_update\nCREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit events are append-only'); END;\n\n-- trigger: campaigns_audit_insert\nCREATE TRIGGER campaigns_audit_insert
AFTER INSERT ON campaigns
BEGIN
  INSERT INTO audit_events(id,event_type,content_id,actor,details_json,created_at)
  VALUES(lower(hex(randomblob(16))),'campaign.created',NULL,NEW.created_by,
    json_object('campaignId',NEW.id,'name',NEW.name,'commercial',NEW.commercial,'disclosureRequired',NEW.disclosure_required),NEW.created_at);
END;\n\n-- trigger: campaigns_no_delete\nCREATE TRIGGER campaigns_no_delete
BEFORE DELETE ON campaigns
BEGIN SELECT RAISE(ABORT, 'campaign records are archived, never deleted'); END;\n\n-- trigger: content_audit_events_no_delete\nCREATE TRIGGER content_audit_events_no_delete
BEFORE DELETE ON content_audit_events
BEGIN
  SELECT RAISE(ABORT, 'content_audit_events is append-only');
END;\n\n-- trigger: content_audit_events_no_update\nCREATE TRIGGER content_audit_events_no_update
BEFORE UPDATE ON content_audit_events
BEGIN
  SELECT RAISE(ABORT, 'content_audit_events is append-only');
END;\n\n-- trigger: content_revision_revoke_stale_approvals\nCREATE TRIGGER content_revision_revoke_stale_approvals
AFTER INSERT ON content_revisions
BEGIN
  UPDATE approval_receipts SET revoked_at=NEW.created_at
    WHERE content_id=NEW.content_id AND payload_sha256<>NEW.payload_sha256 AND revoked_at IS NULL;
END;\n\n-- trigger: content_revisions_no_delete\nCREATE TRIGGER content_revisions_no_delete
BEFORE DELETE ON content_revisions
BEGIN
  SELECT RAISE(ABORT, 'content_revisions is append-only');
END;\n\n-- trigger: content_revisions_no_update\nCREATE TRIGGER content_revisions_no_update
BEFORE UPDATE ON content_revisions
BEGIN
  SELECT RAISE(ABORT, 'content_revisions is append-only');
END;\n\n-- trigger: dry_run_required_until_release\nCREATE TRIGGER dry_run_required_until_release
BEFORE UPDATE OF enabled ON system_controls
WHEN OLD.key='dry_run' AND NEW.enabled=0
BEGIN SELECT RAISE(ABORT, 'dry-run cannot be disabled through the application'); END;\n\n-- trigger: emergency_stop_one_way_latch\nCREATE TRIGGER emergency_stop_one_way_latch
BEFORE UPDATE OF enabled ON system_controls
WHEN OLD.key='emergency_stop' AND OLD.enabled=1 AND NEW.enabled=0
BEGIN SELECT RAISE(ABORT, 'emergency stop cannot be disabled through the application'); END;\n\n-- trigger: media_asset_failed_revoke_rights\nCREATE TRIGGER media_asset_failed_revoke_rights
AFTER UPDATE OF validation_status ON media_assets
WHEN NEW.validation_status IN ('failed','held') AND OLD.validation_status<>NEW.validation_status
BEGIN
  UPDATE media_rights_evidence SET revoked_at=CURRENT_TIMESTAMP
    WHERE media_sha256=NEW.media_sha256 AND revoked_at IS NULL;
END;\n\n-- trigger: media_assets_insert_pending\nCREATE TRIGGER media_assets_insert_pending
BEFORE INSERT ON media_assets
WHEN NEW.validation_status <> 'pending'
BEGIN SELECT RAISE(ABORT, 'media assets must enter pending validation'); END;\n\n-- trigger: media_assets_no_delete\nCREATE TRIGGER media_assets_no_delete
BEFORE DELETE ON media_assets
BEGIN SELECT RAISE(ABORT, 'media asset history is immutable'); END;\n\n-- trigger: media_assets_transition_only\nCREATE TRIGGER media_assets_transition_only
BEFORE UPDATE ON media_assets
WHEN
  NEW.media_sha256 IS NOT OLD.media_sha256 OR
  NEW.storage_provider IS NOT OLD.storage_provider OR
  NEW.object_key IS NOT OLD.object_key OR
  NEW.media_url IS NOT OLD.media_url OR
  NEW.mime_type IS NOT OLD.mime_type OR
  NEW.byte_length IS NOT OLD.byte_length OR
  NEW.duration_ms IS NOT OLD.duration_ms OR
  NEW.width IS NOT OLD.width OR
  NEW.height IS NOT OLD.height OR
  NEW.provenance_json IS NOT OLD.provenance_json OR
  NEW.created_at IS NOT OLD.created_at OR
  NOT (
    (OLD.validation_status = 'pending' AND NEW.validation_status IN ('passed','failed','held')) OR
    (OLD.validation_status = 'passed' AND NEW.validation_status IN ('failed','held'))
  )
BEGIN SELECT RAISE(ABORT, 'media asset metadata is immutable; only a fail-closed validation transition is allowed'); END;\n\n-- trigger: media_rights_evidence_audit_insert\nCREATE TRIGGER media_rights_evidence_audit_insert
AFTER INSERT ON media_rights_evidence
BEGIN
  INSERT INTO audit_events(id,event_type,content_id,actor,details_json,created_at)
  SELECT lower(hex(randomblob(16))), 'media.rights.recorded', ci.id, NEW.verified_by,
    json_object('mediaSha256',NEW.media_sha256,'rightsStatus',NEW.rights_status,'evidenceSha256',NEW.evidence_sha256,'evidenceId',NEW.id),
    NEW.created_at FROM content_items ci WHERE ci.media_sha256=NEW.media_sha256;
END;\n\n-- trigger: media_rights_evidence_audit_revoke\nCREATE TRIGGER media_rights_evidence_audit_revoke
AFTER UPDATE OF revoked_at ON media_rights_evidence
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
BEGIN
  INSERT INTO audit_events(id,event_type,content_id,actor,details_json,created_at)
  SELECT lower(hex(randomblob(16))), 'media.rights.revoked', ci.id, NEW.verified_by,
    json_object('mediaSha256',NEW.media_sha256,'evidenceSha256',NEW.evidence_sha256,'evidenceId',NEW.id,'revokedAt',NEW.revoked_at),
    NEW.revoked_at FROM content_items ci WHERE ci.media_sha256=NEW.media_sha256;
  UPDATE approval_receipts SET revoked_at=NEW.revoked_at
    WHERE rights_evidence_sha256=NEW.evidence_sha256 AND revoked_at IS NULL;
END;\n\n-- trigger: media_rights_evidence_insert_guard\nCREATE TRIGGER media_rights_evidence_insert_guard
BEFORE INSERT ON media_rights_evidence
WHEN NEW.rights_status IN ('owned','licensed','public_domain')
AND NOT EXISTS (SELECT 1 FROM media_assets WHERE media_sha256=NEW.media_sha256 AND validation_status='passed')
BEGIN SELECT RAISE(ABORT, 'verified rights require a media asset whose bytes passed hash validation'); END;\n\n-- trigger: media_rights_evidence_no_delete\nCREATE TRIGGER media_rights_evidence_no_delete
BEFORE DELETE ON media_rights_evidence
BEGIN SELECT RAISE(ABORT, 'media rights evidence history is immutable'); END;\n\n-- trigger: media_rights_evidence_update_guard\nCREATE TRIGGER media_rights_evidence_update_guard
BEFORE UPDATE ON media_rights_evidence
WHEN
  NEW.id IS NOT OLD.id OR NEW.media_sha256 IS NOT OLD.media_sha256 OR
  NEW.rights_status IS NOT OLD.rights_status OR NEW.rights_holder IS NOT OLD.rights_holder OR
  NEW.source_url IS NOT OLD.source_url OR NEW.license_reference IS NOT OLD.license_reference OR
  NEW.permitted_platforms_json IS NOT OLD.permitted_platforms_json OR NEW.permitted_uses_json IS NOT OLD.permitted_uses_json OR
  NEW.evidence_uri IS NOT OLD.evidence_uri OR NEW.evidence_sha256 IS NOT OLD.evidence_sha256 OR
  NEW.verified_by IS NOT OLD.verified_by OR NEW.verified_at IS NOT OLD.verified_at OR
  NEW.expires_at IS NOT OLD.expires_at OR NEW.created_at IS NOT OLD.created_at OR
  OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR NEW.revoked_at IS OLD.revoked_at
BEGIN SELECT RAISE(ABORT, 'media rights evidence is immutable; only one-way revocation is allowed'); END;\n\n-- trigger: publishing_disabled_until_release\nCREATE TRIGGER publishing_disabled_until_release
BEFORE UPDATE OF enabled ON system_controls
WHEN OLD.key='publishing_enabled' AND NEW.enabled=1
BEGIN SELECT RAISE(ABORT, 'publishing requires a separately reviewed release migration'); END;\n\n-- trigger: schedule_requires_approval_insert\nCREATE TRIGGER schedule_requires_approval_insert
BEFORE INSERT ON schedule_slots
WHEN NEW.state IN ('ready','leased','publishing')
AND NOT EXISTS (
  SELECT 1
  FROM content_items ci
  JOIN content_revisions cr ON cr.content_id = ci.id
   AND cr.revision = (SELECT MAX(revision) FROM content_revisions WHERE content_id = ci.id)
  JOIN approval_receipts ar
    ON ar.content_id = ci.id
   AND ar.platform = NEW.platform
   AND ar.payload_sha256 = cr.payload_sha256
   AND ar.decision = 'approved'
   AND ar.revoked_at IS NULL
   AND (ar.expires_at IS NULL OR ar.expires_at > CURRENT_TIMESTAMP)
  JOIN media_assets ma ON ma.media_sha256 = ci.media_sha256
  JOIN media_rights_evidence mre
    ON mre.media_sha256 = ma.media_sha256
   AND mre.evidence_sha256 = ar.rights_evidence_sha256
   AND mre.rights_status IN ('owned','licensed','public_domain')
   AND mre.revoked_at IS NULL
   AND (mre.expires_at IS NULL OR mre.expires_at > CURRENT_TIMESTAMP)
  JOIN content_targets ct
    ON ct.content_id = ci.id
   AND ct.platform = NEW.platform
   AND ct.status = 'approved'
  WHERE ci.id = NEW.content_id
    AND ci.status IN ('approved','scheduled')
    AND EXISTS (
      SELECT 1 FROM meta_connections mc
      WHERE mc.provider = 'meta'
        AND mc.status = 'verified'
        AND mc.identity_verified_at IS NOT NULL
        AND mc.permissions_verified_at IS NOT NULL
        AND (
          (NEW.platform = 'facebook' AND mc.page_id = ct.account_id)
          OR
          (NEW.platform = 'instagram' AND mc.instagram_business_account_id = ct.account_id)
        )
    )
)
BEGIN
  SELECT RAISE(ABORT, 'schedule blocked: current approval and media rights evidence required');
END;\n\n-- trigger: schedule_requires_approval_update\nCREATE TRIGGER schedule_requires_approval_update
BEFORE UPDATE OF state ON schedule_slots
WHEN NEW.state IN ('ready','leased','publishing')
AND NOT EXISTS (
  SELECT 1
  FROM content_items ci
  JOIN content_revisions cr ON cr.content_id = ci.id
  JOIN approval_receipts ar
    ON ar.content_id = ci.id
   AND ar.platform = NEW.platform
   AND ar.payload_sha256 = cr.payload_sha256
   AND ar.decision = 'approved'
   AND ar.revoked_at IS NULL
   AND (ar.expires_at IS NULL OR ar.expires_at > CURRENT_TIMESTAMP)
  JOIN media_assets ma ON ma.media_sha256 = ci.media_sha256
  JOIN media_rights_evidence mre
    ON mre.media_sha256 = ma.media_sha256
   AND mre.evidence_sha256 = ar.rights_evidence_sha256
   AND mre.rights_status IN ('owned','licensed','public_domain')
   AND mre.revoked_at IS NULL
   AND (mre.expires_at IS NULL OR mre.expires_at > CURRENT_TIMESTAMP)
  WHERE ci.id = NEW.content_id
)
BEGIN
  SELECT RAISE(ABORT, 'dispatch blocked: current approval and media rights evidence required');
END;\n\n-- trigger: system_controls_no_delete\nCREATE TRIGGER system_controls_no_delete
BEFORE DELETE ON system_controls
BEGIN SELECT RAISE(ABORT, 'system safety controls cannot be deleted'); END;\n