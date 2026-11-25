# JOB 4A — Isolated D1 Worker rehearsal

Date: 2026-11-25  
Repository: `clickerrish-art/nature-frontiers`  
Branch: `codex/nf-durable-publisher-api`

## Target isolation

The implementation adds a second exact allowlist tuple without changing the existing staging tuple:

- Existing staging: `staging / 89be73af-ebaf-4c19-b75a-9871adb8ba3c / nature-frontiers-staging`.
- Disposable rehearsal: `rehearsal / a12fb838-1bd1-4811-9cf1-2ad5b21089d4 / nf-adapter-worker-rehearsal`.

The lock adapter, run store, orchestrator, and SQL schema each enforce the rehearsal identity. The orchestrator still defaults to staging and requires explicit target injection for rehearsal. Mixed database/Worker pairs are rejected by automated tests.

## Disposable resources

- D1: `nf-adapter-worker-rehearsal-20261125`
- D1 ID: `a12fb838-1bd1-4811-9cf1-2ad5b21089d4`
- Worker: `nf-adapter-worker-rehearsal`
- Worker URL: https://nf-adapter-worker-rehearsal.kajiboye44.workers.dev
- Current Worker version: 9
- Version ID: `40ef576b-ec07-4a91-ba50-b03ad13303dd`
- Deployment ID: `40ef576bec074a91ba50b03ad13303dd`
- D1 binding: `DB` → exact disposable D1 ID
- Authentication: `AUTH_TOKEN` is configured as a Worker secret; its value is not recorded here.
- Query-string redaction enabled for the temporary self-test key; Worker observability logging disabled during the harness run.

## Schema installation and independent inspection

The exact checked-in `scripts/migrations/d1-lock-schema.sql` was applied only to the disposable D1. Cloudflare reported successful execution of all five schema statements. An independent `sqlite_master` query returned the four expected control tables:

- `nf_migration_runs`
- `nf_migration_run_events`
- `nf_migration_lock`
- `nf_migration_lock_events`

An independent count query confirmed the new database started with 0 runs, 0 run events, 0 locks, and 0 lock events.

The deployed Worker read-only health route returned the exact rehearsal target and `controlTables: 4`.

## Live Worker/D1 acceptance tests

The deployed harness imports the checked-in `D1MigrationLockStore`, `D1MigrationRunStore`, and `D1MigrationRunOrchestrator` modules. Its temporary self-test routes call the same authenticated action dispatcher used by the POST API. The concurrency race additionally uses two separate HTTPS requests to two separate Worker invocations, sent in parallel.

| Scenario | Live result | Evidence |
|---|---|---|
| Two independent Worker requests attempt singleton acquisition concurrently | Exactly one run reaches LOCKED; the other remains APPROVED | Parallel HTTPS requests; independent D1 readback |
| Atomic singleton lock protection | One row in `nf_migration_lock`; loser has no lock event | Independent D1 query |
| Wrong-owner release | Rejected; lock remains held | Worker runtime result |
| Correct-owner release | Succeeds; run reaches RELEASED | Worker runtime result + D1 readback |
| Lock event history | ACQUIRED and RELEASED events share the same owner-token hash | Independent D1 query |
| Lock expiry | `expires_at=NULL`; no time-based auto-release | D1 row readback |
| Interrupted run | Acquisition request completed with run LOCKED; a later request performed approved recovery | Two separate HTTPS requests |
| Stale recovery | Run reaches AMBIGUOUS revision 3; lock row is removed only after recovery approval | Worker result + independent D1 readback |
| Recovery audit | STALE_RECOVERED event records the recovery approval; run event records the named recovery operator | Independent D1 query |
| Post-test cleanup of lock state | Zero remaining lock rows | Independent D1 query |

Specific cross-request race fixture:
- Winner: `5ea6cfc4-8987-4af8-8690-af6e700e6e31` → `RELEASED`, revision 3.
- Loser: `6ea6cfc4-8987-4af8-8690-af6e700e6e31` → `APPROVED`, revision 1.
- Independent readback found one ACQUIRED and one RELEASED lock event for the winner, no lock event for the loser, and no remaining lock row.

Specific interruption fixture:
- Run: `7ea6cfc4-8987-4af8-8690-af6e700e6e31`.
- Persisted progression: PLANNED → APPROVED → LOCKED → AMBIGUOUS.
- Recovery operator: `job4a-recovery-operator`.
- Recovery approval: `job4a-recovery-approval`.
- Lock history: ACQUIRED → STALE_RECOVERED.
- The run remains AMBIGUOUS; no success state or automatic retry is claimed.

## Automated validation

The branch now adds the disposable Worker harness path to the Worker validation workflow and syntax-checks the harness entrypoint. The migration contract tests also include exact rehearsal target validation for the lock adapter, run store and orchestrator.

Final CI disposition for the exact source SHA is recorded after the latest workflow run completes. CI is supplemental; the live Worker and independent D1 evidence above are separate acceptance evidence.

## Acceptance disposition

- Exact target allowlist without weakening the existing staging target: PASS.
- Worker harness imports the checked-in modules: PASS.
- Control schema applied only to disposable D1: PASS.
- Worker deployment with exact DB binding: PASS.
- Real Worker-bound D1 acquisition and cross-request concurrency: PASS.
- Owner-only release: PASS.
- Interrupted-run recovery to AMBIGUOUS: PASS.
- Non-expiring lock / manual stale-lock protection: PASS.
- Independent persisted run and lock event history: PASS.
- Existing staging, production, backup D1 and publisher Worker modified: NO.
- Migration SQL execution: NOT_IMPLEMENTED / NOT_AUTHORIZED.
- Runner integration: NOT_YET_AUTHORIZED; keep separate until independent review of the live rehearsal evidence.

The harness has no publisher capability. No migration ledger was altered or fabricated, no staging or production DDL was run, and no publishing action occurred.
