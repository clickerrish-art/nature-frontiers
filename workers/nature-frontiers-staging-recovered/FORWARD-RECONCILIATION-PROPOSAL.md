# Forward schema reconciliation proposal — Nature Frontiers staging

> **PROPOSAL ONLY — NOT APPLIED — REQUIRES EXPLICIT OWNER APPROVAL**
>
> This document authorizes no action. No migrations, SQL writes, ledger edits, Worker deployments, secret changes, OAuth connections, dispatches, or publishing actions were performed to prepare it. Production Worker `nature-frontiers-publisher` and production D1 `nature-frontiers-prod-state` are out of scope and must remain untouched.

## 1. Decision summary

**Recommendation: do not generate or apply a numbered SQL migration yet.** First establish an independently reviewed, read-only baseline for the current staging schema and the recovered staging Worker source. The captured staging schema snapshot already matches the observed application-object inventory (25 tables, 19 indexes, 31 triggers). The migration ledger, however, contains only `0009_meta_token_encryption.sql`. The original staging migration chain for 0005–0009 is not recoverable from the refs and Library sources inspected so far.

A conventional "replay missing migrations" approach is unsafe: the available 0003/0004 files define `media_evidence` and `review_evidence`, which are absent from staging, while the recovered Worker generation uses `media_assets`, `media_rights_evidence`, and `approval_receipts`. The separately recovered PR #32 `0005_educational_story.sql` is a real Git object but belongs to a different schema generation, depends on `review_evidence`, and is incompatible with the observed staging schema. It is explicitly excluded.

The proposed path is therefore **state-first, forward-only reconciliation**:
1. freeze the current evidence as a schema/source baseline;
2. independently compare every table, column, index, trigger, constraint, and foreign key against the recovered Worker source's SQL expectations;
3. if the live staging schema is already compatible, make no schema changes and document the baseline without fabricating historical ledger entries;
4. if a concrete incompatibility is proven, prepare a separately named, additive forward repair with exact DDL, data-impact analysis, and a tested recovery plan;
5. only after a separate written owner approval may that repair be tested on a disposable D1 and considered for staging.

No migration number or filename is selected in this proposal. The migration runner's filename ordering, ledger semantics, transaction behavior, and duplicate/retry handling have not yet been verified. Do not assume that 0010 is safe.

## 2. Evidence baseline

### Staging database and schema

- Worker: `nature-frontiers-staging`.
- Staging D1: `89be73af-ebaf-4c19-b75a-9871adb8ba3c`.
- Read-only ledger observation: one row, `0009_meta_token_encryption.sql`, applied at `2026-11-25 09:55:01`.
- Read-only application-object inventory, excluding Cloudflare-managed `_cf_KV` and SQLite internals: 25 tables, 19 indexes, 31 triggers.
- Recovered schema snapshot: `workers/nature-frontiers-staging-recovered/schema.snapshot.sql`, Git blob `2de7101043ce35bb0da87bbba5af8ad26b31a221`. It is DDL-only, excludes application row data and platform-managed `_cf_KV`, and explicitly says it is not an original migration or safe to apply to active staging.
- The captured snapshot inventory matches the read-only object inventory. This is an inventory-level match, not proof that all live definitions, constraints, foreign keys, or data satisfy Worker expectations.

### Migration history and incompatibilities

- On `codex/nf-durable-publisher-api`, checked-in migrations 0001–0004 have blobs:
  - 0001: `04ce4ae1e906dca50d797f5802b7917218a39d51`
  - 0002: `9827db44a77c85e3d26599476c1f07dd77237f83`
  - 0003: `3b80b233eab16311933fa773c2cbc6170f654b57`
  - 0004: `5393b44273a582d2f670d64e142e7b937a419c0d`
- 0001 describes itself as reconstructed from read-only production D1 inspection; it is not authoritative original staging provenance.
- 0003/0004 create `media_evidence` and `review_evidence`, both absent in staging. Do not apply them simply to make the current schema resemble those files.
- The staging ledger has no 0005–0008 rows. The source files for 0005–0008 were not found in inspected repository refs.
- 0009 has a ledger row but no corresponding source file in the inspected refs. Staging `meta_connections` includes `access_token_ciphertext`, `access_token_nonce`, `token_key_version`, `instagram_identity_verified_at`, and `page_tasks_json`; without the original SQL, the precise attribution of these fields is unknown.
- The PR #32 candidate `workers/nature-frontiers-publisher/migrations/0005_educational_story.sql` (blob `47fac90f17891667f8b6335ef80c54cc45966933`, introducing commit `4a579cec6a3ae17e774532e45ceed5e0623451bf`) adds educational-story fields and depends on `review_evidence`. It is not staging's missing 0005 and must not be applied or relabelled.
- The wider scan covered 30 branch heads, 27 PRs, available PR refs, two pages of recent workflow runs, tags, releases, and the currently indexed Library archive set. It found no original 0006–0009 source chain. This does not exclude inaccessible, expired, deleted, external, or operator-held copies.

### Recovered Worker schema generation

The captured staging schema includes the newer object family used by the recovered staging Worker:
- content and history: `campaigns`, `content_items`, `content_revisions`, `content_audit_events`, `audit_events`, `audit_chain`;
- media and approval: `media_assets`, `media_rights`, `media_rights_evidence`, `approval_receipts`, `approvals`;
- scheduling and execution: `schedule_slots`, `worker_runs`, `publication_attempts`;
- operator, OAuth, and control: `system_controls`, `oauth_states`, `operator_sessions`, `login_rate_limits`, `meta_connections`;
- integration, analytics, and recovery: `meta_webhook_events`, `webhook_delivery_events`, `analytics_snapshots`, `backup_records`, `nf_schema_migrations`.

The presence of these tables is observed schema state, not proof of which migration created them. Before writing any repair, the exact recovered Worker source revision and every SQL statement it executes must be pinned to immutable commit/blob SHAs and compared with the live DDL. Do not infer a source-to-schema dependency from table names alone.

## 3. Proposed changes (conditional, not executable SQL)

### Phase A — establish an immutable baseline (read-only)

1. Record the exact staging Worker version ID, source ETag, deployment annotation, D1 binding ID, and recovered Worker source commit/blob SHAs.
2. Re-capture `sqlite_master`, `PRAGMA table_info`, `PRAGMA index_list`, index SQL, trigger SQL, and foreign-key definitions for every application table. Preserve raw outputs, timestamps, query text, and checksums.
3. Compare the fresh live definitions byte-for-byte or structurally against the checked-in schema snapshot. Explain every difference; do not normalize away meaningful defaults, collations, checks, uniqueness, or FK actions.
4. Extract the Worker SQL statements and map each statement to the exact table/column/index/trigger it requires. Include read paths and write paths, not just CREATE statements.
5. Run read-only data-shape checks for nullability, duplicate keys, invalid enum values, orphan references, and state-machine consistency. The earlier Cloudflare permission-denied PRAGMA integrity/foreign-key checks remain unresolved; do not claim full integrity until they are successfully completed through an authorized read-only path.

**Expected outcome:** a signed-off compatibility matrix, with each object marked MATCH, MISMATCH, UNUSED, or UNKNOWN. If every required object matches, stop here: no schema migration is necessary for the currently recovered Worker revision.

### Phase B — conditional additive forward repair

Only if Phase A identifies a specific Worker-required schema mismatch:

1. Prepare one new, clearly labelled forward-reconciliation artifact. It must not masquerade as 0005–0009, backfill missing historical ledger rows, or claim to reconstruct their contents.
2. Select the filename/sequence only after inspecting the actual migration runner and its ordering, checksum, locking, transaction, and ledger behavior. A semantic reconciliation name may be preferable if the runner supports it; otherwise the owner must approve a sequence that is demonstrably safe.
3. Include only the minimal DDL needed to address each proven mismatch. Every statement must be derived from the exact pinned Worker source and fresh live DDL. This proposal intentionally supplies **no executable SQL**, because the current evidence does not establish a concrete missing-object delta or the migration runner contract.
4. Prefer additive, nullable/defaulted changes where compatible with the Worker contract. Do not drop, rename, rebuild, truncate, or rewrite populated tables as a convenience. Any unavoidable table rebuild or data transformation requires a separate, explicit design and approval.
5. Do not create `media_evidence` or `review_evidence` from 0003/0004, and do not add educational-story columns from the incompatible PR #32 0005, unless a separately approved product/schema decision makes those objects genuinely required by the pinned Worker. Current evidence does not support either change.
6. Do not update `nf_schema_migrations` to pretend missing migrations ran. A future reconciliation ledger record, if the verified runner requires one, must identify the new forward-repair artifact and its checksum honestly.

### Phase C — isolated rehearsal

1. Use a disposable, non-production D1 database with no real credentials, tokens, personal data, or live Meta bindings.
2. Seed only synthetic fixtures representing the required relationships and edge cases; never copy production/staging application rows into the rehearsal database.
3. Apply the proposed repair to the disposable database using the same runner and exact artifact checksum intended for staging.
4. Test clean application, repeat invocation, interrupted/partial execution, lock contention, concurrent runner attempts, and recovery after failure.
5. Compare pre/post schema and fixture data. Confirm no existing values are lost or silently rewritten, FK/check/unique constraints behave as expected, and all required Worker SQL paths execute against the result.
6. Rehearse backup and restore independently. A backup is not considered valid merely because a row exists in `backup_records`.

## 4. Dependencies and release gates

All of the following are prerequisites before any staging write:

| Gate | Required evidence | Current status |
|---|---|---|
| Source provenance | Exact immutable Worker source revision and SQL call-site map | PARTIAL — recovered source exists; pin and complete call-site mapping still required |
| Schema baseline | Fresh full DDL and PRAGMA inventory with checksums | PARTIAL — snapshot and object counts exist; full constraint/integrity checks are incomplete |
| Migration runner | Verified ordering, checksum, lock, transaction, retry, and ledger semantics | NOT ESTABLISHED |
| Historical lineage | Original staging 0005–0009 source and provenance, or formal owner acceptance that it is unavailable | BLOCKED — original chain not recovered |
| Data integrity | Authorized read-only integrity, FK, uniqueness, orphan, and state checks | PARTIAL — anti-join checks previously found zero orphans; integrity/FK PRAGMAs were denied |
| Backup | Fresh encrypted staging backup, verified checksum, and successful isolated restore test | NOT ESTABLISHED — backup tables currently have no backup records/chunks and restore is untested |
| Rehearsal | Disposable D1 test report tied to exact repair SHA | NOT STARTED |
| Owner approval | Written approval naming exact D1, artifact SHA, scope, maintenance window, operator, and stop conditions | NOT GRANTED |

A staging write must remain blocked until every gate is PASS and the owner has separately approved the exact change. Approval of this proposal is not approval to deploy, publish, connect Meta, or change production.

## 5. Data-preservation and operational safeguards

- Target only staging D1 `89be73af-ebaf-4c19-b75a-9871adb8ba3c`; explicitly deny production D1 and Worker identifiers in the execution plan.
- Preserve all application rows, IDs, hashes, revision history, audit-chain sequence/hash continuity, approval receipts, rights evidence, OAuth/session state, scheduling slots, worker runs, publication attempts, and webhook delivery records.
- Do not use `DROP`, `TRUNCATE`, destructive table recreation, broad `UPDATE`, or implicit data coercion.
- Do not reset or reseed the migration ledger. Never manufacture historical applied-at timestamps or historical checksums.
- Before any approved write, capture and checksum a fresh schema-only baseline and a separately protected encrypted data backup. Confirm backup byte length, checksum, encryption-key reference, and a successful restore into an isolated D1.
- Use a single migration runner with a verified lock/lease and an explicit precondition that the live schema still matches the reviewed baseline. Abort on drift.
- Require transactional DDL where supported and proven by rehearsal. If the operation cannot be atomic, split it into independently idempotent, checkpointed steps with a tested partial-failure recovery path.
- Keep the safety controls unchanged: `publishingEnabled=false`, `dryRun=true`, `FACEBOOK_PUBLISH_ENABLED=NO`, `emergencyStop=true`, `campaignId=null`, `commercial=false`, `disclosureRequired=false`.
- No Meta OAuth, token rotation, webhook activation, dispatch, scheduling release, or publishing is part of schema reconciliation.

## 6. Rollback and recovery strategy

The preferred recovery is **forward repair**, not destructive rollback.

1. Before an approved staging change, require a restorable encrypted backup and a proven restore procedure. The existing `backup_records` table and Worker backup code do not establish that a usable backup exists; previous inspection found no backup records/chunks and no completed restore test.
2. If a failure occurs before any DDL commits, stop the runner, retain logs, verify schema/ledger are unchanged, and do not blindly retry.
3. If a transaction is proven atomic and rolls back, verify the exact pre-change schema and data checksums before considering a retry.
4. If any non-transactional or partially committed DDL has run, stop all further writes. Do not drop newly created objects or reverse table changes automatically. Capture the actual post-failure schema and ledger, compare with the approved plan, and prepare a separately reviewed forward-fix.
5. If data restoration is required, restore only into an isolated D1 first; validate row counts, key relationships, hashes, audit-chain continuity, and application invariants. A live staging restore requires a new explicit owner approval and a documented outage/impact plan.
6. Preserve all failed-run logs, checksums, SQL statements, runner version, operator identity, and timestamps as audit evidence.

There is no safe rollback guarantee until backup restoration and the exact DDL failure modes have been demonstrated in the disposable rehearsal.

## 7. Post-change verification (only after future approval)

- Confirm exact Worker/D1 target IDs and that production resources were not touched.
- Re-run full schema inventory and compare every object to the approved target manifest.
- Verify migration ledger contains only truthful entries with the exact applied artifact identity/checksum; no historical backfill.
- Run integrity, foreign-key, uniqueness, orphan, and application-state checks.
- Verify row counts and stable hashes for all preserved tables/records, including revisions, approvals, rights evidence, audit events/chain, schedules, worker runs, attempts, webhook events, and backup metadata.
- Exercise staging UI draft create/edit/refresh and revision/audit persistence using a clearly marked internal placeholder only. Do not submit for approval or schedule it.
- Exercise read-only Worker health/schema-dependent paths. Keep OAuth, webhook writes, dispatch, and publishing disabled.
- Verify safety controls remain at the required values after the change and after a Worker restart.
- Record exact evidence, timestamps, query outputs, artifact SHA, Worker version, and D1 ID. A green test suite alone is not acceptance.

## 8. Explicit exclusions

This proposal does not:
- recover or invent missing historical 0005–0009 SQL;
- apply 0003/0004 or the incompatible PR #32 0005;
- generate an executable migration or choose a migration number;
- write to staging or production D1;
- edit secrets, connect Meta, deploy a Worker, enable dispatch, or publish content;
- authorize a live restore, schema change, or any paid service.

## 9. Approval record (intentionally blank)

No approval is implied by this document. Before any future staging write, the owner must approve a separate execution plan that names:

- exact target: staging Worker and D1 IDs;
- exact forward-repair file path, full Git commit SHA, and content checksum;
- exact DDL and expected before/after schema;
- verified runner version and rehearsal report;
- backup ID, checksum, encryption-key reference, and restore-test evidence;
- operator, maintenance window, stop conditions, and recovery decision;
- explicit confirmation that production, Meta OAuth, dispatch, and publishing remain out of scope.

**Current disposition: HOLD — proposal prepared; no database or deployment action authorized.**
