# JOB 4A — Isolated D1 Worker rehearsal

Date: 2026-11-25  
Repository: `clickerrish-art/nature-frontiers`  
Branch: `codex/nf-durable-publisher-api`

## Target isolation

The implementation adds a second exact allowlist tuple without changing the existing staging tuple:

- Existing staging: `staging / 89be73af-ebaf-4c19-b75a-9871adb8ba3c / nature-frontiers-staging`.
- Disposable rehearsal: `rehearsal / a12fb838-1bd1-4811-9cf1-2ad5b21089d4 / nf-adapter-worker-rehearsal`.

The lock adapter, run store, orchestrator, and SQL schema each enforce the rehearsal identity. The orchestrator still defaults to staging and requires explicit target injection for rehearsal. Mixed database/Worker pairs are rejected by tests.

## Disposable resources

- D1: `nf-adapter-worker-rehearsal-20261125`
- D1 ID: `a12fb838-1bd1-4811-9cf1-2ad5b21089d4`
- Worker: `nf-adapter-worker-rehearsal`
- Worker URL: https://nf-adapter-worker-rehearsal.kajiboye44.workers.dev
- Worker version: 5
- Version ID: `443d0007-1360-4c51-8410-d5452b5f8eaa`
- Deployment ID: `443d000713604c518410d5452b5f8eaa`
- D1 binding: `DB` → exact disposable D1 ID
- Authentication: `AUTH_TOKEN` is configured as a Worker secret; its value is not recorded here.

## Schema installation and independent inspection

The exact checked-in `scripts/migrations/d1-lock-schema.sql` was applied only to the disposable D1 through the D1 API. Cloudflare reported successful execution of all five schema statements. An independent `sqlite_master` query returned the four expected control tables:

- `nf_migration_runs`
- `nf_migration_run_events`
- `nf_migration_lock`
- `nf_migration_lock_events`

An independent count query confirmed the new database starts with 0 runs, 0 run events, 0 locks, and 0 lock events.

The deployed Worker read-only health route was then requested over HTTPS. It returned:
```json
{"ok":true,"target":{"environment":"rehearsal","databaseId":"a12fb838-1bd1-4811-9cf1-2ad5b21089d4","worker":"nf-adapter-worker-rehearsal"},"controlTables":4}
```

This proves the deployed module entrypoint executes and the Worker-bound D1 binding can read the schema. It does not prove any mutation path.

## Implementation

- `d1-lock-adapter.mjs`: explicit staging and disposable allowlist; singleton conditional insert; hashed owner token; conditional owner release; manual stale recovery requiring termination confirmation and approval.
- `d1-run-store.mjs`: exact target validation for plan records and approval/rejection compare-and-swap transitions.
- `run-orchestrator.mjs`: staging remains default; disposable target requires explicit injection.
- `d1-lock-schema.sql`: database/Worker pair constraints for both allowlisted targets.
- `workers/nf-adapter-worker-rehearsal/worker.js`: isolated authenticated POST harness importing the checked-in modules; read-only GET health route.

## Acceptance disposition

| Requirement | Result |
|---|---|
| Exact disposable target allowlist added without relaxing staging | PASS — source and contract tests |
| Harness imports checked-in adapter, run store and orchestrator | PASS — deployed as separate Worker modules |
| Control schema applied only to disposable D1 | PASS |
| Worker deployment with exact DB binding | PASS |
| Worker HTTPS health request and schema read | PASS |
| Real Worker POST: record and approve run | NOT_TESTED |
| Real Worker POST: atomic lock acquisition | NOT_TESTED |
| Simultaneous Worker request exclusion | NOT_TESTED |
| Real Worker POST: owner-only release | NOT_TESTED |
| Interrupted-run / stale-lock recovery through Worker | NOT_TESTED |
| Independent persisted event-history readback after mutations | NOT_TESTED |
| Existing staging / production resources modified | NO |

The available execution interface in this session could deploy the Worker, inspect D1 through Cloudflare's API, and issue HTTPS GET requests, but it did not provide an authorized HTTP POST invocation path to the deployed Worker. The Worker mutating endpoints therefore remain unexecuted. No substitute claim is made from the direct D1 schema query or CI tests.

## Gate

JOB 4A is **partially implemented, not accepted**. Do not integrate the lock adapter with the runner yet. The remaining acceptance step is to invoke the authenticated Worker POST routes from an approved HTTP client (or a zero-cost GitHub Actions runner with the one-time harness secret), execute the concurrency/ownership/recovery matrix, and independently query the persisted run and lock event tables afterward.

No DDL execution, migration execution, publisher deployment, production change, staging D1 change, or publishing action occurred.
