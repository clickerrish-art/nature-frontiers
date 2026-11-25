# Nature Frontiers staging acceptance register

Captured: 2026-11-25 (UTC)

## Authoritative baseline

- Repository: `clickerrish-art/nature-frontiers`
- Implementation branch: `codex/nf-durable-publisher-api`
- Branch HEAD after source recovery and schema reconciliation record: `000fd67c23aca48576c56c3ac306959306a63ea0`
- `main` HEAD observed during this work: `678e3db436bb8e50c8e8d8aab48ef024e75fbdf0`
- Branch relationship: 206 commits ahead, 7 behind; diverged. No reset, rebase, force-push, or merge performed.
- Staging Worker: `nature-frontiers-staging`, active version 25, version ID `98ba14e3-e5e2-490c-ba21-14615ffa23cc`.
- Previous Worker version: 24, ID `a378aca2-5bbf-457c-832f-647c705dc0d2`.
- Versions 24 and 25 share script ETag `7082c1cdf2d27f5a663039af78539ba3a5be42bc8272fd5ce109099dd9469d1f`; version 25 was secret-triggered.
- Version 24 annotation `a69d5a5ef44cd2737c023d26deaeb5547cc8c9ed` and seven earlier annotated Worker SHAs could not be resolved in the accessible GitHub repository (GitHub API 422). Global search for the version 24 SHA returned no result.
- Staging D1: `nature-frontiers-staging`, ID `89be73af-ebaf-4c19-b75a-9871adb8ba3c`.
- Backup D1: ID `82f13712-6c0f-4d68-8a8d-b53c82fd13f5`.
- The deployed source modules are preserved under `workers/nature-frontiers-staging-recovered/`. This is a byte-for-byte source snapshot, not a claim to have recovered the original source commit.
- `schema.snapshot.sql` was compared byte-for-byte against live D1 schema DDL: 25 tables, 19 indexes, 31 triggers; no application row data included.

## Safety state

- D1 `dry_run=1`.
- D1 `emergency_stop=1`.
- D1 `publishing_enabled=0`.
- Worker `DRY_RUN=true`.
- Worker `EMERGENCY_STOP=true`.
- Worker `FACEBOOK_PUBLISH_ENABLED=NO`.
- No staging secrets changed during this recovery.
- No staging D1 data or migration rows changed.
- No Worker deployment made during this recovery.
- No production Worker or production D1 mutation performed.
- No Meta publishing, campaign action, or external provider mutation performed.

## Gate status

| Gate | Status | Evidence / blocker |
|---|---|---|
| A — Operator authentication | BLOCKED | Deployed source uses PBKDF2-HMAC-SHA256, 100,000 iterations, 16-byte salt, 32-byte derived key; hash format `pbkdf2$100000$salt$derivedKey`. Login rate limit is 5 failures per 900 seconds; session lifetime is 8 hours. Password-hash secret is configured but unreadable. One owner session row is active until 2026-11-25T17:41:40Z, but the raw session cookie is not in D1 and no authenticated browser context is available. No password reset or credential exposure attempted. Live login/session/CSRF/origin/UA/logout tests remain unperformed. |
| B — Internal draft persistence | BLOCKED | No authenticated dashboard session available. No draft inserted. Current content, revision, audit, campaign, schedule and publication-attempt counts remain zero. Exact draft test remains pending. |
| C — Deployment/database consistency | BLOCKED | Version 24/25 source modules and current schema snapshot recovered to the existing implementation branch. Original Cloudflare source commit annotations remain unresolvable. Repository migrations 0001–0004 are present; 0007–0009 source files are absent. D1 ledger records only 0009. Effects associated with 0007/0008 exist in tables/triggers but lack ledger records. No migrations applied and no ledger entries fabricated. |
| D — Content workspace | FAIL | Deployed UI supports Feed post and Reel only. Story option is absent. Source inspection found no duplicate or delete draft actions. Browser workflow and persistence not verified. |
| E — Media and rights | FAIL | Deployed module verifies externally fetched media bytes, MIME and SHA-256 and records rights evidence. No upload/storage binding (R2 or Static Assets) is configured. No actual media upload/retrieval or interrupted-upload recovery test. |
| F — Meta OAuth | BLOCKED | Callback and OAuth implementation exist. `NF_META_APP_ID` and `NF_META_APP_SECRET` are not configured. No Meta connection rows or owner-verified Page/Instagram identity. |
| G — Meta webhooks | BLOCKED | GET challenge implementation and verification token exist. POST requires `NF_META_APP_SECRET`, which is absent. No genuine signed Meta test delivery. |
| H — Scheduling/worker engine | FAIL | Scheduling API persists slots and explicitly returns `dispatchEnabled:false`. Version 25 lists only a `fetch` handler; no scheduled handler or cron trigger. No dispatch, retry/backoff, lease, or restart worker lifecycle verified. |
| I — Facebook/Instagram adapters | FAIL | Deployed Meta helper is GET-only. No Graph publishing POST adapter or `media_publish` implementation found in the deployed modules. No live publishing performed. |
| J — Analytics | BLOCKED | Read-only collection and persistence code exists, but no Meta connection or analytics snapshots exist. No real provider metrics verified. |
| K — Backup/recovery | BLOCKED | Encrypted gzip/AES-GCM backup implementation and separate backup D1 binding exist. Backup database has zero backup records and zero chunks. No real backup or restore test performed. |
| L — Dashboard/operator experience | NOT_TESTED | Static dashboard source exists and includes content, campaigns, scheduling, analytics, audit, controls and backup areas. No authenticated desktop/mobile browser journey, accessibility, loading/error or persistence test. |
| M — Security/failure testing | NOT_TESTED | Source inspection only. No full hostile/negative runtime test suite or complete security acceptance performed. |
| N — End-to-end acceptance | BLOCKED | Gates A–M are not all accepted; no end-to-end journey performed. |

## Direct database observations

- Application tables: 25.
- Named indexes: 19.
- Triggers: 31.
- Migration ledger: `0009_meta_token_encryption.sql` only.
- Content items: 0.
- Content revisions: 0.
- Audit events: 0.
- Campaigns: 0.
- Schedule slots: 0.
- Meta connections: 0.
- Publication attempts: 0.
- Backup records: 0.
- Backup chunks: 0.
- Ten explicit parent-child anti-join checks returned zero orphans. SQLite integrity and foreign-key PRAGMA checks were denied by Cloudflare D1 query permissions; this is not a full integrity-check PASS.

## Next safe sequence

1. Obtain an authenticated staging browser context without asking for a password in chat or resetting the password secret. Then verify login/session/CSRF and create the exact internal-only Feed draft through the dashboard.
2. Inspect the created content, revision and audit rows; verify the exact caption, format, media URL and hash; confirm no schedule, dispatch or provider action occurred.
3. Recover original migration 0007/0008/0009 source lineage before any migration reconciliation write. Keep current D1 untouched until that evidence exists.
4. Continue independent media, Meta, scheduling, analytics, backup, dashboard and security acceptance work. Keep publishing disabled and emergency stop active.

## Recovery change record

- Added the seven live Worker modules and deployment provenance under `workers/nature-frontiers-staging-recovered/`.
- Added `schema.snapshot.sql`, verified byte-for-byte against live D1 DDL.
- This recovery is source preservation and schema evidence only. It is not a staging deployment, migration application, authentication PASS, draft persistence PASS, or release acceptance.

## Pull-request state observed

- PR #1: already `closed` and `merged=true` before this recovery; head ref `youtube-auto-poster-multiplatform-6a37b`, head SHA `36dc0972b700d0d0a9c8cc02b9da5b84dac42405`. No action taken. This is inconsistent with the requested keep-open/draft/unmerged condition, but reopening or altering it was not attempted.
- PR #26: `open`, `draft=true`, `merged=false`; head ref `codex/instagram-unified-login-setup`, head SHA `dec6a1075c01b5b20a87f47cfec130c4a972123e`. No action taken.
- PR #28: `open`, `draft=true`, `merged=false`; head ref `codex/nf-licensed-stock-policy-fix`, head SHA `98c4bf2bf4eadc1bd7a982a9f216bcdd03c912ac`. No action taken.
- Neither PR #26 nor PR #28 points at the recovery branch `codex/nf-durable-publisher-api`; the recovery commits are confined to that existing implementation branch.

## Exact internal draft test — prepared, not executed

The deployed dashboard form and create handler were inspected:

- The format control offers `feed_post` (displayed as “Feed post”) and `reel`.
- The save payload fields are `campaignId`, `contentType`, `caption`, `mediaUrl`, and `mediaSha256`.
- The exact requested test uses `contentType=feed_post`, `campaignId=null`, an HTTPS URL, and a 64-character SHA-256 string. It satisfies the deployed source-level input validator: caption length 1–5,000, HTTPS URL without embedded credentials, and 64 hexadecimal hash characters.
- The create handler uses a D1 batch to insert `content_items`, revision 1 in `content_revisions`, `content_audit_events`, and `audit_events`.
- The placeholder URL is not media-rights or media-integrity evidence; the test must remain an internal draft and must not be submitted for review, approved, scheduled, or dispatched.

No request was sent because the authenticated browser session could not be established. The live D1 content/revision/audit counts remain zero.
