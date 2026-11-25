# Migration runner contract inspection — Nature Frontiers staging

Captured: 2026-11-25 (UTC)
Repository: `clickerrish-art/Nature-Frontiers`
Inspected branch: `codex/nf-durable-publisher-api`
Inspection scope: repository tree and recovered staging Worker source only; read-only.

> **Finding: NO MIGRATION RUNNER CONTRACT ESTABLISHED.**
>
> No migrations were run, no database or ledger rows were written, no Worker was deployed, and no publishing or Meta actions were performed.

## 1. Executive result

The inspected branch contains four historical SQL files under `workers/nature-frontiers-publisher/migrations/`, a legacy publisher Worker, and a recovered staging Worker source snapshot. It does **not** contain a migration runner, migration CLI, deployment migration hook, or migration workflow.

The recovered staging Worker source does not implement migration discovery or execution. It contains application-level D1 queries and D1 `batch()` calls for content operations, but no schema migration execution path.

The existing `worker-api.test.mjs` test harness manually reads migrations 0001–0004 in a hard-coded sequence and applies them to an in-memory Node SQLite database. Its explicit `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` logic belongs to the test adapter. It is not evidence of Cloudflare D1 migration transaction behavior or of a production migration runner.

Therefore the requested runner contract cannot be established from the recovered code. A forward-reconciliation migration must not be named, sequenced, or drafted as executable SQL yet.

## 2. Exact inspected source evidence

Inspected at branch `codex/nf-durable-publisher-api`:

| File | Git blob SHA | Relevant finding |
|---|---|---|
| `package.json` | `d9c3582a3d825114e6d97bb8b279358118c0742e` | No migration script, schema command, or migration dependency in scripts |
| `.github/workflows/publisher-worker-validation.yml` | `4ae1199e17c0881709cce02f7cd666b1080dc45f` | Validates source and tests; no migration execution step |
| `workers/nature-frontiers-staging-recovered/index.js` | `cdf85fa2b35a4276945b006d18712c84b26ca65c` | Recovered deployed application source; application D1 access only; no migration runner |
| `workers/nature-frontiers-publisher/worker.js` | `ff1f54e45a4d033deb5584fe3060c8992ecfa944` | Separate, older publisher implementation; not the deployed staging schema generation |
| `workers/nature-frontiers-publisher/worker-api.test.mjs` | `c50226c1825c87ac0a20011f4603af51bef6ca8c` | Test-only manual migration setup and SQLite transaction wrapper |
| `workers/nature-frontiers-staging-recovered/schema.snapshot.sql` | `2de7101043ce35bb0da87bbba5af8ad26b31a221` | DDL snapshot defines `nf_schema_migrations(name, applied_at)`; snapshot is not a runner or migration |

The recursive branch tree contained no separate migration runner, migration script, migration configuration, or additional numbered migration files beyond 0001–0004. The package scripts are campaign/publishing validation and publishing operations; none is a schema migration command.

## 3. Contract by requested dimension

| Dimension | Finding | Evidence / implication |
|---|---|---|
| Filename ordering | **NOT IMPLEMENTED / UNKNOWN** | Test harness explicitly names 0001, 0002, 0003, 0004 in source order. No directory discovery, filename parser, numeric sort, duplicate-number rejection, or ordering policy is present. |
| Checksum validation | **NOT IMPLEMENTED** | No migration file hash calculation, stored checksum, checksum comparison, or immutable migration identity logic found. The staging ledger schema has only `name` and `applied_at`. |
| Locking / concurrency | **NOT IMPLEMENTED / UNKNOWN** | No migration lock table, lease, lock token, compare-and-swap, or runner exclusion mechanism found. Test adapter's SQLite `BEGIN IMMEDIATE` is not a D1 migration lock. |
| Transaction handling | **NOT ESTABLISHED FOR MIGRATIONS** | Test adapter wraps its simulated `batch()` with local SQLite `BEGIN IMMEDIATE`, `COMMIT`, and `ROLLBACK`. Recovered Worker uses D1 `db.batch()` for application-level content create/update. Neither proves how a schema migration runner would transact DDL or recover from partial execution. |
| Ledger behavior | **SCHEMA + OBSERVED ROW ONLY; RUNNER ABSENT** | Snapshot defines `nf_schema_migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`. Read-only staging inspection found one row, `0009_meta_token_encryption.sql`, timestamp `2026-11-25 09:55:01`. No code was found that inserts, updates, validates, or reconciles this ledger. |
| Failure / retry behavior | **NOT IMPLEMENTED / UNKNOWN** | No runner-level failure checkpoints, retry policy, idempotency contract, or partial-application recovery path found. |
| Migration provenance | **INCOMPLETE** | 0001–0004 are present in the older schema-generation directory; original staging 0005–0009 source lineage is unavailable. The PR #32 educational-story 0005 is incompatible and excluded. |

## 4. Important distinction: three different transaction contexts

1. **Test-only SQLite adapter:** `worker-api.test.mjs` creates an in-memory database, manually executes the four SQL files, and implements `batch(statements)` using SQLite `BEGIN IMMEDIATE`, statement execution, `COMMIT`, and `ROLLBACK`. This verifies application API behavior under that adapter. It does not test Cloudflare D1 migration semantics.
2. **Recovered staging Worker application batches:** `index.js` calls `db.batch([...])` for content create/update operations. These are application data operations, not schema changes. No DDL migration path is present.
3. **Staging migration ledger:** D1 has a ledger table and one observed 0009 row. A table and row do not establish the code that wrote them, the SQL that was run, checksum verification, atomicity, or concurrency safety.

Do not transfer guarantees from one context to another.

## 5. Safe conclusion for forward reconciliation

- Do not assume migration number 0010 is available or safe.
- Do not assume a numeric filename sort or that gaps are tolerated.
- Do not insert a new ledger row until a real runner contract is designed and reviewed.
- Do not backfill 0005–0008 or rewrite the existing 0009 ledger row.
- Do not apply 0003/0004 or the incompatible PR #32 0005 to staging.
- Do not treat a D1 `batch()` application operation or the SQLite test adapter as proof of transactional DDL.
- Continue to keep staging and production unchanged.

At present, the only honest contract is: **there is no recovered migration runner contract to rely on.**

## 6. Required next engineering task — design, not execute

If the owner later authorizes implementation of a migration mechanism, first create a separately reviewed runner design and tests. At minimum it must specify:

1. Explicit migration manifest and deterministic ordering; reject duplicate, missing, or ambiguous identifiers.
2. Immutable migration identity and SHA-256 checksum stored alongside the migration name and applied timestamp. Reject changed content for an already-applied identity.
3. A D1-compatible concurrency strategy with an owner-reviewed lock/lease, stale-lock recovery, and prevention of two runners applying the same change.
4. Exact D1 DDL transaction semantics, including whether a migration is atomic, what happens on statement failure, and how partial completion is detected. Prove this in a disposable D1 using the intended execution mechanism.
5. Ledger rules: insert only after successful application; never fabricate historical rows; record artifact identity/checksum and runner version; detect schema/ledger drift and stop rather than silently repair.
6. A no-op plan/dry-run mode that emits the ordered plan and preconditions without executing SQL.
7. Rehearsed interruption, retry, concurrent invocation, duplicate invocation, checksum mismatch, and partial-failure cases.
8. A staging-only target allowlist and explicit refusal of production resource identifiers.
9. Backup/restore prerequisites and post-run schema/data verification.
10. A separate owner approval for the runner implementation and another explicit approval for any staging migration execution.

This is a future design checklist, not an instruction to implement or execute a runner now.

## 7. Disposition

**BLOCKED — migration runner contract absent.**

The previous forward-reconciliation proposal remains proposal-only. No executable repair should be drafted until the runner is deliberately designed, independently tested against disposable D1, and explicitly approved. No staging or production operation is authorized by this report.
