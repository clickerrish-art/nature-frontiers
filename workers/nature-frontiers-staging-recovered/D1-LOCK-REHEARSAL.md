# Persistent D1 migration lock rehearsal

Date: 2026-11-25
Repository: `clickerrish-art/Nature-Frontiers`
Branch: `codex/nf-durable-publisher-api`

## Scope and resource isolation

Two newly created disposable D1 databases were used in sequence; neither was an existing project database:

1. `nf-lock-rehearsal-20261125` — ID `38261569-4fd3-4948-90a0-9b2386be5519`, initial concurrency/recovery and batch rollback probes.
2. `nf-lock-adapter-validation-20261125` — ID `cfafca12-432d-4d2f-8820-a473c8f686ed`, exact schema and SQL sequence matching the checked-in adapter.

Both had read replication disabled and were created in the Cloudflare account's ENAM region.

The existing Nature Frontiers staging D1 `89be73af-ebaf-4c19-b75a-9871adb8ba3c`, production D1 `nature-frontiers-prod-state`, staging backup D1, and SonicVhibez D1 were not mutated.

## Disposable D1 results

| Required behavior | Result | Evidence |
|---|---|---|
| Atomic singleton acquisition | PASS | Two concurrent D1 batch acquisitions for different approved runs returned claim changes 0 and 1; exactly one lock row existed |
| Owner-only release | PASS | Wrong owner batch returned changes 0 for all four statements and preserved the lock; matching owner returned changes 1 for audit, delete, run-state update and run-event insert |
| Simultaneous-run exclusion | PASS | The losing run remained APPROVED and no lock was created for it; winner moved to LOCKED |
| Interruption persistence | PASS | Lock survived separate API requests; a later contender was refused; lock had `expires_at=NULL` and an old acquisition timestamp |
| No time-based stale stealing | PASS | Old timestamp did not permit a contender to acquire the singleton lock |
| Manual stale recovery | PASS | Wrong owner hash returned changes 0 for all five statements; exact owner plus approval reference removed lock, wrote `STALE_RECOVERED`, and moved run to `AMBIGUOUS` |
| D1 batch rollback | PASS | A batch created a probe table then failed on a missing table; subsequent `sqlite_master` query confirmed the probe table was rolled back |
| D1 run creation and approval SQL | PASS | Run rows and initial APPROVED rows were inserted in batches; approved state and approval references were checked by subsequent lock acquisition |
| D1 JavaScript binding runtime | NOT_TESTED | The checked-in JavaScript adapter was not executed inside a Worker bound to D1 |

For the adapter-validation database, the exact SQL sequences in `d1-lock-adapter.mjs` were replayed through Cloudflare's D1 query API. The concurrent race returned:

- contender A: `[0,0,0,0]`
- contender B: `[1,1,1,1]`
- one persisted lock row, owned by B; run B state `LOCKED`, revision 2.

For owner release, the wrong owner returned `[0,0,0,0]`; the correct owner returned `[1,1,1,1]`, and the run moved to `RELEASED`.

For interruption recovery, a lock acquired with an old timestamp persisted across separate API requests. A different approved run received `[0,0,0,0]`. Recovery with the wrong owner returned `[0,0,0,0,0]`. Recovery with the exact owner and explicit incident approval returned `[1,1,1,1,1]`; the run ended in `AMBIGUOUS` with a durable `STALE_RECOVERED` audit event and approval reference.

Cloudflare D1 batch behavior was directly tested: when a later statement failed, earlier schema changes in the same batch were rolled back. This is observed D1 behavior, not an assumption based on local SQLite.

## Implementation committed

- `scripts/migrations/d1-lock-schema.sql`: disposable-first schema for run rows, run events, singleton lock and immutable lock audit events.
- `scripts/migrations/d1-lock-adapter.mjs`: D1 binding adapter for conditional singleton acquisition, owner-only release, manual stale recovery, hashed owner tokens and audit trail.
- `scripts/migrations/d1-run-store.mjs`: persistent planned-run creation and explicit approval transitions.
- `scripts/migrations/d1-lock-adapter.test.mjs` and `d1-run-store.test.mjs`: Node contract/validation tests. These are not substitutes for the direct D1 rehearsal.
- CI syntax checks cover both D1 modules; the test suite runs all migration tests.

Adapter invariants:
- one singleton key per migration stream;
- atomic `INSERT ... ON CONFLICT DO NOTHING` acquisition from an exact APPROVED run;
- all multi-statement changes use `D1Database.batch()`;
- owner release matches both run ID and owner-token digest;
- recovery requires process-termination confirmation, exact owner digest and explicit approval;
- recovery ends in `AMBIGUOUS`, never a successful/released state;
- no expiry/TTL or automatic stealing;
- raw owner tokens are never persisted;
- no DDL, runner dispatch, or migration execution is present in adapter code.

## Important limits

- Direct D1 API execution validated the SQL and D1 transaction semantics; the JS adapter itself has not been executed in a deployed Worker with a real D1 binding.
- GitHub CI validates the JavaScript contract tests and syntax, not a Worker binding.
- Both disposable D1 databases were deleted after evidence capture. The final account listing returned only the four pre-existing databases; neither disposable ID remained.
- No migration DDL was executed against Nature Frontiers staging or production.

## CI verification

GitHub Actions completed successfully for implementation commit `5098df7d8a2760d0d9c50af0e7c6f0075ff95c1b`:
https://github.com/clickerrish-art/nature-frontiers/actions/runs/45614508832

The workflow passed the migration planner and D1 adapter contract tests, syntax checks for both adapter modules, and the existing Worker/publishing safety tests. It did not run against a live D1 binding.

## Disposition

**DISPOSABLE D1 SQL SEMANTICS: PASS FOR ACQUIRE, OWNER RELEASE, CONCURRENCY, INTERRUPTION PERSISTENCE, MANUAL RECOVERY AND BATCH ROLLBACK. PERSISTENT D1 ADAPTER AND RUN STORE IMPLEMENTED. WORKER-BINDING RUNTIME: NOT_TESTED. RUNNER INTEGRATION: NOT AUTHORIZED/NOT DONE.**

Next gate: exercise the checked-in JavaScript adapter inside an isolated Worker with a disposable D1 binding. Only after that test and independent review should runner integration be considered. The schema must not be applied to staging or production as part of this milestone.
