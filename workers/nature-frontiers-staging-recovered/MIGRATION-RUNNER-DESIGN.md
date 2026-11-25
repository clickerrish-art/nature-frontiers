# Migration runner architecture — Nature Frontiers staging

> **DESIGN ONLY — NOT IMPLEMENTED — NOT EXECUTED — NO DATABASE OR DEPLOYMENT AUTHORIZATION**
>
> This document specifies a proposed runner contract for future review. It creates no executable migration, runner code, D1 objects, lock, ledger entry, Worker version, or deployment. Production Worker `nature-frontiers-publisher` and production D1 `nature-frontiers-prod-state` are explicitly out of scope.

Captured: 2026-11-25 (UTC)
Repository: `clickerrish-art/Nature-Frontiers`
Branch: `codex/nf-durable-publisher-api`
Design inputs:
- `MIGRATION-RUNNER-CONTRACT.md` (the runner is absent)
- `FORWARD-RECONCILIATION-PROPOSAL.md` (proposal only)
- `schema.snapshot.sql` (read-only snapshot, not a migration)
- recovered staging Worker `index.js` and `backups.js`
- `DEPLOYMENT-PROVENANCE.json`

## 1. Decision and non-goals

**Recommended contract:** a manifest-driven, checksum-pinned, fail-closed migration runner. It must refuse to infer migration history from filenames or from the existing ledger row. It must not try to replay the older 0001–0004 generation or invent missing 0005–0008/0009 sources.

The runner is not an application endpoint and must not be reachable from the public dashboard, scheduled publishing, webhook handlers, or ordinary operator sessions. It is a separately invoked, tightly scoped maintenance operation with a staging-only target guard.

This design does not:
- recover or fabricate historical migration files;
- backfill or rewrite the existing `nf_schema_migrations` row;
- choose a historical migration number for a new repair;
- create executable SQL or runner source;
- write to staging or production;
- deploy a Worker, alter secrets, connect Meta, dispatch, or publish.

## 2. Immutable inputs and target identity

Every run must pin all of the following before it can produce an executable plan:

1. Git repository and full commit SHA (never a moving branch name alone).
2. Exact manifest path and SHA-256 of its raw bytes.
3. Every migration artifact path, byte length, and SHA-256 of raw bytes.
4. Runner source commit, runner build/version, and manifest schema version.
5. Exact D1 database name and database ID from the deployment/binding configuration.
6. Exact staging Worker name and version/source identity where a Worker binding is involved.
7. A fresh read-only schema fingerprint and the timestamp at which it was captured.

Target checks are allowlist-first:
- The only permitted database target is staging D1 ID `89be73af-ebaf-4c19-b75a-9871adb8ba3c`, with its verified staging database name supplied by the pinned configuration.
- The only permitted Worker target is `nature-frontiers-staging`.
- Explicitly deny production D1 `nature-frontiers-prod-state` and production Worker `nature-frontiers-publisher`.
- If target identity is missing, ambiguous, changed, or cannot be independently read from the pinned configuration, abort before lock acquisition or SQL.
- No environment variable or CLI flag may override the production denylist or turn a non-staging target into an allowed target.

The staging D1 ID above is a target constraint, not permission to write to it.

## 3. Deterministic manifest and ordering

Do not discover migrations by directory enumeration followed by lexical or numeric filename sorting. The manifest is the sole source of execution order.

Proposed manifest fields per artifact:
- `sequence`: positive integer, unique and contiguous within this manifest stream;
- `migration_id`: immutable, globally unique semantic identifier;
- `path`: repository-relative path, normalized and confined to the declared migration root;
- `sha256`: lowercase 64-character SHA-256 of exact file bytes;
- `byte_length`: exact raw byte count;
- `kind`: explicitly supported migration class;
- `requires`: optional list of prior migration IDs that must already be verified;
- `expected_pre_schema_sha256` and `expected_post_schema_sha256`: where a complete canonical schema fingerprint is available;
- `description`: human-readable intent (never used as an execution instruction).

Validation must reject:
- duplicate sequence numbers or migration IDs;
- gaps in the new manifest's sequence;
- missing files, duplicate paths, path traversal, symlinks escaping the root, or unexpected file extensions;
- malformed or duplicate JSON keys;
- non-canonical identifiers;
- unknown manifest versions or unsupported migration kinds;
- dependency cycles, missing dependencies, or dependencies ordered after their consumer;
- any artifact whose raw-byte SHA-256 or byte length differs from the manifest.

A stable topological order is allowed only if tie-breaking is explicitly defined by sequence then migration ID. Prefer a contiguous sequence and reject ambiguous ties. The final ordered plan must be byte-for-byte reproducible from the pinned manifest and artifacts.

### Historical lineage boundary

The existing staging ledger contains only `0009_meta_token_encryption.sql`; original staging 0005–0009 SQL lineage is not recovered. The available 0001–0004 files belong to a different, older schema generation. The PR #32 educational-story 0005 is incompatible and excluded.

Therefore:
- treat the current `nf_schema_migrations` contents as legacy observations, not as a complete authoritative manifest;
- never synthesize absent historical files, checksums, applied timestamps, or provenance;
- never claim that an unverified legacy row matches an artifact;
- introduce any future forward-reconciliation stream under a clearly distinct semantic namespace, not by relabelling it as 0005–0010;
- require an explicit owner-approved baseline/adoption decision before the new stream can run against an existing database.

## 4. SHA-256 identity and drift policy

The checksum is calculated over the exact raw bytes of the migration artifact, before newline conversion, parsing, formatting, or SQL normalization. Store lowercase hex SHA-256 and byte length.

The immutable identity is the tuple:
`(migration_id, artifact_sha256, artifact_path, source_commit_sha)`.

Rules:
- same ID + same checksum + same provenance: already applied; no-op;
- same ID + different checksum: hard failure; never overwrite history;
- same checksum + different ID: still a distinct artifact; require explicit review, do not infer equivalence;
- file changed after plan generation: invalidate the plan and require a new dry run;
- applied ledger record but schema does not match expected post-state: drift; stop;
- schema already has expected post-state but no truthful applied record: ambiguous prior application; stop for manual reconciliation, do not insert a success record;
- no checksum or source provenance may be retroactively assigned to the legacy 0009 row without primary evidence.

No automatic checksum repair, ledger rewrite, or `IF NOT EXISTS`-based concealment of unexpected schema drift is permitted.

## 5. Ledger model and truthful state machine

The current table is `nf_schema_migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`. It cannot represent checksum, source commit, runner version, or run state. Do not silently reinterpret its two columns.

Proposed future design: preserve the legacy table unchanged and introduce a separately versioned runner metadata ledger only through an explicitly reviewed bootstrap. A future ledger record should contain at least:
- `migration_id` (primary key);
- `artifact_sha256`;
- `artifact_path`;
- `source_commit_sha`;
- `manifest_sha256` and `manifest_version`;
- `runner_version`;
- `target_database_id`;
- `applied_at` generated by the runner only after the DDL batch succeeds;
- `result` constrained to the single terminal success state for committed records.

A separate append-only run-event log may record attempts and outcomes (started, refused, failed-before-apply, ambiguous, applied, verified), with run ID, lock token hash, actor/operator identity, timestamps, error category, and artifact checksum. Do not put secrets or raw tokens in it.

**No false success rows:** the successful migration record must be committed in the same atomic D1 batch as its migration DDL, if and only if the disposable-D1 rehearsal proves that exact DDL + ledger batch is atomic. Never write an `applied` row before executing the migration. Never create an applied row merely because a runner started or a statement returned an uncertain network result.

If exact DDL and ledger insertion cannot be committed atomically, the runner must use a separately designed checkpoint protocol and mark interrupted outcomes as `ambiguous/manual_recovery_required`; it must not claim transactionality.

### Existing legacy ledger

The observed `0009_meta_token_encryption.sql` row remains untouched. It is not upgraded with an invented checksum or source SHA. A reviewed baseline-adoption record may state that this legacy row was observed, with the observation timestamp and evidence source, but must not claim to verify the historical SQL bytes.

## 6. Concurrency protection

### Required behavior

Only one runner may own the migration stream for a target database at a time. Two invocations must never both reach migration execution.

Proposed lock:
- one dedicated singleton lock row per target database in a runner-control table;
- acquire using one atomic conditional insert/claim protected by a unique key;
- owner is a cryptographically random run token; persist only its hash where practical;
- store actor, start time, pinned manifest SHA, target database ID, and runner version;
- acquisition succeeds only when the unique lock row is newly created; verify affected-row count and read back the exact owner token hash;
- if the row already exists, fail closed and report the current lock metadata without trying to steal it;
- release only with a conditional delete/update matching the exact owner token and target ID.

**No automatic lock expiry or lease stealing.** An expired lease can allow a paused runner to resume after another process takes ownership. The initial contract therefore deliberately prefers a stuck lock over concurrent schema writes.

Stale-lock recovery is manual and requires:
1. evidence that the original runner invocation has terminated and cannot resume;
2. read-only inspection of the D1 schema and ledger for partial/ambiguous effects;
3. preserved logs and run token identity;
4. explicit operator approval to clear the exact stale lock;
5. a new dry-run plan against the current schema.

A failed invocation must not automatically delete its lock in a generic `finally` block if the result of its last D1 operation is uncertain. It should leave the lock for reconciliation.

The lock/control tables themselves require a reviewed one-time bootstrap. Bootstrap ordering, simultaneous first-run behavior, and DDL semantics must be rehearsed in disposable D1 before any real staging use.

## 7. D1 execution and failure semantics

### What Cloudflare documents

Cloudflare's D1 Worker API documentation states:
- D1 `batch()` executes statements sequentially and non-concurrently as a SQL transaction;
- if a statement in the batch fails, D1 returns an error for that statement and aborts/rolls back the entire batch;
- D1 `exec()` accepts one or more raw SQL statements and stops further statements on an error, but its API description does not make the same all-or-nothing rollback guarantee.

References:
- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://developers.cloudflare.com/d1/sql-api/sql-statements/
- https://developers.cloudflare.com/d1/reference/migrations/
- https://developers.cloudflare.com/d1/wrangler-commands/

### Runner rule

Do not use multi-statement `exec()` as the migration transaction. Do not assume the local Node SQLite test adapter's `BEGIN IMMEDIATE` behavior is D1 behavior.

Preferred candidate for rehearsal: prepare each complete SQL statement as one D1 prepared statement, then submit the ordered statements and final truthful ledger insert in one `db.batch([...])`. The migration artifact format must preserve statements safely; do not split SQL naively on semicolons because trigger bodies and quoted literals can contain semicolons. A parser/manifest representation must be selected and tested before implementation.

### DDL-specific proof gate

Cloudflare's documented batch transaction contract is strong evidence for batch rollback generally, but it is not by itself a completed test of this project's exact DDL, trigger, index, foreign-key, and ledger statement mix.

Before implementation approval, a disposable D1 experiment must use the same API, statement construction, DDL categories, and runner version intended for staging. It must prove:
- successful multi-statement DDL batch commits all expected objects and the ledger row;
- an intentional failure after at least one successful DDL statement leaves no earlier DDL effects and no ledger success row;
- failure in the final ledger insert rolls back the preceding DDL;
- trigger creation and trigger-body syntax behave as expected;
- index, constraint, foreign-key and table-alter operations behave as expected;
- duplicate invocation is a no-op only when checksum and post-schema state match;
- an ambiguous client/network outcome is reconciled by read-only schema + ledger inspection, never blind retry.

If the intended migration cannot fit in one proven atomic batch, stop. Design a separately approved, resumable step protocol with explicit checkpoints and compensation/forward-recovery rules; do not silently fall back to `exec()` or claim atomicity.

## 8. Dry-run planner

Dry-run is the default and must be read-only. It must:
1. validate target allowlist and production denylist;
2. load and validate the pinned manifest and all artifact bytes;
3. compute and compare every SHA-256 and byte length;
4. inspect current legacy and runner ledgers without modifying them;
5. capture current schema fingerprint and compare expected preconditions;
6. determine pending, already-applied, drifted, missing-dependency, and ambiguous items;
7. show exact ordered artifact IDs, paths, checksums, statement counts, and expected schema transitions;
8. report lock state and whether the lock is available (read-only);
9. list backup/restore and owner-approval gates;
10. emit a machine-readable plan hash tied to target ID, manifest SHA, artifact hashes, runner version, and current schema fingerprint.

Dry-run must not create a lock, bootstrap a table, write a run record, create a backup, insert a ledger row, execute SQL, or change a Worker setting. A plan becomes stale if any pinned input, target identity, lock state, or schema fingerprint changes. Execution must revalidate all preconditions after lock acquisition.

A dry-run result is a plan, not evidence that a migration has been applied or that DDL will succeed.

## 9. Failure, retry, and recovery state machine

Proposed high-level states:

`UNPLANNED -> PLANNED -> APPROVED -> LOCKED -> PRECHECKED -> APPLYING -> APPLIED -> POSTCHECKED -> RELEASED`

Terminal/stop states:
- `REFUSED`: target, manifest, checksum, dependency, approval, or precondition invalid;
- `LOCKED_BY_OTHER_RUN`: another owner holds the singleton lock;
- `FAILED_BEFORE_DDL`: failure proven to occur before any DDL was submitted;
- `ROLLED_BACK`: exact batch rollback proven by the D1 rehearsal and post-failure inspection;
- `AMBIGUOUS`: request outcome or schema/ledger state cannot be conclusively reconciled;
- `DRIFT`: current schema differs from expected pre/post state;
- `MANUAL_RECOVERY_REQUIRED`: never retry automatically.

Retry policy:
- retry read-only planning and inspection with bounded backoff;
- never automatically retry DDL after a timeout, disconnect, Worker termination, or uncertain response;
- retry an apply only after proving no DDL was committed, the original invocation is stopped, the lock remains controlled, and a new dry-run matches the current schema;
- if schema has any partial effects or ledger and schema disagree, stop and prepare a separately reviewed recovery plan;
- preserve failed run logs and checksums; never erase failed evidence.

## 10. Required disposable-D1 rehearsal matrix

No staging test substitutes for this matrix. Use synthetic data only and no real credentials, tokens, personal data, or Meta bindings.

| Test | Setup / injected condition | Required result |
|---|---|---|
| Deterministic order | Deliberately shuffled filenames and manifest entries | Same manifest sequence every run; no filesystem-order dependence |
| Duplicate ID | Two entries share an ID | Plan refused |
| Duplicate/gapped sequence | Repeated or missing sequence | Plan refused |
| Missing dependency | Dependency absent or ordered later | Plan refused |
| Path escape | Artifact path leaves migration root | Plan refused |
| Checksum mismatch | One byte changed after manifest creation | Plan refused before SQL |
| Already applied exact | Matching ID, checksum, provenance, and post-schema | No-op; no DDL |
| Already applied altered | Matching ID but different checksum | Hard refusal; ledger untouched |
| Concurrent invocation | Two runners acquire simultaneously | Exactly one lock owner; other refuses |
| Stale lock | Existing lock with no proven dead process | Refuse; no automatic expiry/steal |
| Owner-token mismatch | Wrong token attempts release | Lock remains |
| Batch success | Multiple DDL statements + ledger insert | All expected effects present |
| Mid-batch DDL failure | Intentional failing statement after earlier DDL | All earlier DDL rolled back; no applied row |
| Ledger insert failure | Force final ledger statement to fail | DDL rolled back |
| Trigger DDL | Create trigger with multi-line body | Correct trigger definition and behavior |
| Worker interruption | Terminate/lose client during apply | Outcome reconciled read-only; no blind retry |
| Ambiguous result | Simulate response loss after request | Schema + ledger determine state or manual hold |
| Duplicate invocation after success | Re-run same artifact | Verified no-op |
| Schema drift | Alter expected object out-of-band | Abort before apply |
| Wrong target | Production ID/name or unknown ID | Refuse before lock or SQL |
| Backup/restore | Restore synthetic backup to separate disposable D1 | Restore and checksums independently verified |

Record D1 platform/runtime version, runner build, exact SQL artifact hashes, statement order, query results, schema before/after hashes, ledger rows, lock transitions, timestamps, and injected failure point.

## 11. Backup, preconditions, and postconditions

A staging run must remain blocked until a fresh encrypted backup exists and has been restored successfully into an isolated D1. The recovered `backups.js` implementation and a backup table definition do not prove a usable backup; the current proposal records that backup storage and restore are not yet established.

Before any future staging execution:
- fresh full schema and constraint/FK baseline;
- exact row counts and preservation hashes for critical application tables;
- verified encrypted backup byte length and SHA-256;
- successful isolated restore with post-restore verification;
- no unresolved integrity or foreign-key check failures;
- source-to-schema compatibility matrix for the exact pinned Worker source;
- exact approved artifact and plan hash;
- written owner approval naming the exact staging D1, artifact commit/hash, runner version, operator, maintenance window, and stop/recovery conditions.

After a future approved run:
- verify every expected table, column, index, trigger, constraint and FK;
- verify truthful ledger identity/checksum/provenance;
- verify preserved row counts and stable hashes, audit-chain continuity and key relationships;
- verify safety controls remain fail-closed;
- verify production identifiers were never selected;
- preserve all run artifacts and independent evidence.

## 12. Safety invariants

The runner must never:
- call Meta APIs, OAuth, webhook processing, dispatch, scheduling, or publishing;
- alter `publishingEnabled=false`, `dryRun=true`, `FACEBOOK_PUBLISH_ENABLED=NO`, `emergencyStop=true`, `campaignId=null`, `commercial=false`, or `disclosureRequired=false`;
- read or print secrets, tokens, or credentials;
- use production resources;
- reset or fabricate migration history;
- drop, truncate, rebuild, or broadly rewrite application data as an automatic recovery;
- run without an explicit owner-approved execution plan.

## 13. Approval gates and implementation sequence

The design itself does not authorize implementation. Recommended next sequence:

1. Owner reviews and approves this runner contract as the intended design.
2. Resolve manifest representation and SQL statement parsing format; review parser behavior for triggers, strings, comments, and SQLite syntax.
3. Implement runner and dry-run planner on a feature branch only, with no active D1 binding or production credentials.
4. Unit-test ordering, hashes, manifest validation, target guards, state transitions, and lock-token behavior without a live database.
5. Rehearse the complete D1 matrix against a disposable D1 using the exact intended execution mechanism.
6. Independently review the resulting source, test report, and failure evidence.
7. Prepare a separate staging execution plan with fresh backup/restore proof and exact artifact SHA.
8. Obtain separate explicit owner approval for that exact staging operation before any staging write.

Approval of this design is not approval of runner implementation, runner deployment, staging migration execution, or any production action.

## 14. Current disposition

**DESIGN PROPOSED — RUNNER ABSENT — IMPLEMENTATION NOT AUTHORIZED — STAGING AND PRODUCTION UNCHANGED.**

The next engineering gate is review of this contract and the D1 statement-execution rehearsal plan. Do not draft an executable schema repair until runner implementation and DDL failure semantics have been independently validated.
