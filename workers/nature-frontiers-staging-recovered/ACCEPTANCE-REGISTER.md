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


## 2026-11-26 live re-inspection

Captured: 2026-11-26 11:47 UTC. Read-only Cloudflare inspections were used for deployed Worker versions, bindings, D1 schema, migration ledger, safety controls, connection records, content records, backup records, observability issues, and rehearsal D1 history. No DDL, D1 data writes, secret writes, deployment, Meta request, or publishing operation was performed in this inspection.

### Repository and PR

- Repository: `clickerrish-art/nature-frontiers`.
- PR #30 remains `open`, `draft=true`, `merged=false`.
- Branch `codex/nf-durable-publisher-api` was 133 commits ahead and 0 behind its PR base before the latest regression-test commit; it is now 134 ahead and 0 behind.
- Latest branch commit created during this inspection: `1b2f3fb3f383d0062543174bd1810ccdc5261575` (`test: guard Meta OAuth against automatic redirects`).
- The added regression test asserts that all mocked Meta OAuth/Graph requests use `redirect: manual` and that an unexpected Graph redirect is rejected with HTTP 502. The updated file was fetched back and verified. CI for this new exact commit had not yet appeared at capture time.
- No write to `main`, merge, close, ready-for-review transition, reset, rebase, force-push, or history rewrite was performed.

### Staging Worker deployment and secret preservation

- Worker: `nature-frontiers-staging`.
- Active deployment: `078f055f-9178-4343-a75b-1598d68ee3fe`, routing 100% to version 42 (`2fa960eb-860f-4045-a160-93c21862917c`), annotated commit `5266e6604e38cf0531f17cafb3397e627dad3461`.
- Version 42 has the seven expected `secret_text` bindings: `NF_BACKUP_ENCRYPTION_KEY`, `NF_META_APP_ID`, `NF_META_APP_SECRET`, `NF_META_TOKEN_ENCRYPTION_KEY`, `NF_META_WEBHOOK_VERIFY_TOKEN`, `NF_OPERATOR_PASSWORD_HASH`, `NF_SESSION_SECRET`.
- Version 44 (`b228485e-a6f3-43ea-9549-fcc962826bb5`) is an uploaded, not active, version annotated with OAuth fix commit `45e0a548cdd2478f71233021017f685388f1102f`; its resource binding list is empty.
- Version 42's source at commit `5266e660` uses `redirect: error` in the Meta OAuth and Graph API fetches. The version 44 source at `45e0a548` uses `redirect: manual` and explicitly rejects unexpected redirects.
- Cloudflare's `bindings_inherit=strict` option only resolves `inherit` bindings against the latest uploaded version; it is not a general mechanism to recover version 42's secret values. `keep_bindings` retains types from the previous upload, which is version 44 and has no bindings. Secret values are not retrievable. Therefore no safe upload/deploy of the OAuth fix was performed.
- Version 42's non-secret safety bindings were directly verified: `DRY_RUN=true`, `EMERGENCY_STOP=true`, `FACEBOOK_PUBLISH_ENABLED=NO`. D1 controls also read `dry_run=1`, `emergency_stop=1`, `publishing_enabled=0`.
- The active version 42 binding list does not include `NF_MEDIA_ALLOWED_HOSTS` or `NF_EVIDENCE_ALLOWED_HOSTS`, although the recovered media-release code requires these allowlists. Media verification cannot be accepted as configured.

### Live staging D1 observations

- Staging D1: `89be73af-ebaf-4c19-b75a-9871adb8ba3c`.
- Migration ledger contains exactly one row: `0009_meta_token_encryption.sql`.
- `meta_connections`: 0; no Facebook Page or Instagram destination is connected or verified.
- One internal draft exists: `413d44e3-2cad-4d46-bc6c-c0a29c75c0bf`, revision 1, status `draft`, with the explicitly placeholder `example.com` media URL. Its revision and `content.created` audit record are present. It is not production media and must never be approved or published.
- Current counts: 1 content item, 1 revision, 1 audit event, 0 media assets, 0 rights-evidence records, 0 approval receipts, 0 schedule slots, 0 publication attempts, 0 worker runs.
- Backup D1 `82f13712-6c0f-4d68-8a8d-b53c82fd13f5` contains 0 backup records. No backup/restore acceptance has occurred.

### Other deployed Worker and rehearsal findings

- `nature-frontiers-staging` has no Cloudflare Cron schedules. The recovered Worker export contains a `fetch` handler only. Its scheduling API explicitly returns `dispatchEnabled=false`; no dispatch/retry worker lifecycle is deployed.
- `nature-frontiers-publisher` is active at version 1 and bound to `nature-frontiers-prod-state` (`9b2e439d-5fd4-4812-a938-e1739fbe8795`). Its settings expose only a D1 binding and no `PUBLISHER_API_TOKEN` binding. The bound D1 has the base publisher tables but lacks `media_evidence` and `review_evidence`, both required by PR #30's publisher Worker health check. PR #30's new publisher API is not deployed and must not be treated as live.
- Disposable rehearsal Worker `nf-adapter-worker-rehearsal` has `AUTH_TOKEN` and its disposable D1 binding. Read-only D1 inspection confirms 44 run records, 125 run events, 38 lock events, and 0 unexpired locks. The Job 4C record documents plan/approval/lock/release/recovery lifecycle tests. The authenticated browser POST through the visible operator UI remains `NOT_TESTED`.

### Runtime and CI evidence

- Cloudflare observability contains a historical owner-login failure on `/api/auth/login`: HTTP 500 because an earlier version requested PBKDF2 600,000 iterations while the Workers runtime limit was 100,000. The current feature-branch Worker and hash generator use 100,000; the write-only `NF_OPERATOR_PASSWORD_HASH` value cannot be inspected, so the current configured hash format remains unverified and owner login is not accepted.
- Previous exact-head PR checks on `45e0a548` passed: gated publishing safety run `45809926732`, Meta OAuth validation run `45809926678`, publisher Worker validation run `45809926527`. The publisher and Instagram publisher jobs were skipped; Meta and Instagram provider calls were mocked; publisher persistence tests used SQLite, not the deployed D1 adapter. These are CI passes, not live provider or deployed Worker acceptance.
- A new redirect regression-test commit `1b2f3fb3f383d0062543174bd1810ccdc5261575` was added after those runs. Its exact-head CI is pending/not yet observed.

### Updated acceptance register

| Area | Status | Current evidence / blocker |
|---|---|---|
| Repository / PR preservation | PASS | PR #30 open, draft, unmerged; latest branch commit recorded above. |
| Staging safety defaults | PASS | Active version 42 and D1 controls read fail-closed. |
| OAuth redirect source fix | PASS (source only) | Manual redirect implementation and regression test present; not active. |
| OAuth fix deployment | BLOCKED | Latest upload v44 has no bindings; seven secret values cannot be recovered. |
| Owner authentication | BLOCKED | Historical PBKDF2 600,000 runtime failure; current secret hash format cannot be read/verified. |
| Facebook OAuth / Page identity | BLOCKED | Zero connection rows; previous authorization-code exchange failed; fixed code not deployed. |
| Instagram authorization / identity | BLOCKED | No independent Instagram Login flow or verified professional account; app login product not independently inspectable. |
| D1 historical migration provenance | BLOCKED | Ledger only records 0009; original 0005–0009 chain remains incomplete and schema generations diverge. |
| Durable publisher API | NOT_TESTED on deployed target | PR code passes mocked/SQLite CI; not deployed; production-state D1 lacks required evidence tables and API token binding. |
| Job 4C plan-only rehearsal | PASS with limitation | Live D1 lifecycle evidence; browser-authenticated HTTP POST remains NOT_TESTED. |
| Media / rights / approvals | BLOCKED | Only placeholder draft; no actual media, allowlist bindings, rights evidence or approval receipt. |
| Scheduling / dispatch / retry | BLOCKED | No cron trigger or deployed dispatch handler; API explicitly reports dispatch disabled. |
| Dashboard end-to-end | NOT_TESTED | No complete authenticated browser journey on the current deployed Worker. |
| Backup / restore | NOT_TESTED | Backup D1 has zero records; no restore rehearsal. |
| Full security / end-to-end acceptance | NOT_TESTED | Required real OAuth, identity, media, rights, provider and deployed adapter tests remain incomplete. |

All production publishing remains disabled. No staging or production database writes were made during this re-inspection.

### Follow-up exact-head CI result — 2026-11-26

After the redirect regression test and live re-inspection register were committed, the workflows associated with exact head `324db3e31c68da1f154d228277e37d1c686163e4` completed successfully:

- Meta OAuth validation run `45815008332` (run 31): PASS — Worker module syntax and Facebook OAuth scope-isolation/redirect regression tests.
- Durable publisher Worker validation run `45815008192` (run 270): PASS — migration planner/D1 adapter contracts, Worker syntax, SQLite-backed publisher API tests, Meta webhook tests, Instagram policy/readiness tests, and fail-closed controls.
- Gated publishing safety run `45815008216` (run 1033): safety-tests PASS. `facebook-publisher`, `instagram-preflight`, and `instagram-publisher` jobs were SKIPPED.

These CI results are source-level, mocked, or SQLite-backed checks. They do not change the live deployment, establish real Meta authorization, validate the actual staging D1 adapter for the publisher API, or prove public provider publication. All corresponding live acceptance gates remain as recorded above.