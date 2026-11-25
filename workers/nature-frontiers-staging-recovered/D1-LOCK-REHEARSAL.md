# Persistent D1 migration lock rehearsal

Date: 2026-11-25
Repository: `clickerrish-art/Nature-Frontiers`
Branch: `codex/nf-durable-publisher-api`

## Scope and resource isolation

A new disposable D1 database was created solely for this rehearsal:

- Name: `nf-lock-rehearsal-20261125`
- ID: `38261569-4fd3-4948-90a0-9b2386be5519`
- Read replication: disabled
- Region: ENAM

No existing D1 database was used. In particular, the staging database `89be73af-ebaf-4c19-b75a-9871adb8ba3c`, production database `nature-frontiers-prod-state`, backup database and SonicVhibez database were not mutated.

## Results

| Required behavior | Result | Evidence |
|---|---|---|
| Atomic singleton acquisition | PASS | Two simultaneous Cloudflare D1 API inserts for different approved runs produced changes=1 and changes=0; exactly one lock row existed |
| Owner-only release | PASS | Wrong owner delete returned changes=0 and lock remained; matching owner delete removed it and emitted a release audit event |
| Simultaneous-run exclusion | PASS | Concurrent insert race admitted one run only; losing run made no lock change |
| Interruption persistence | PASS | Lock was acquired, then left untouched across separate API requests; it remained present with `expires_at=NULL` |
| No time-based stale stealing | PASS | The persisted lock used an old acquisition timestamp; a contender still received changes=0 |
| Manual stale recovery | PASS | Recovery without the correct owner hash made zero changes; exact owner plus process-termination confirmation and approval reference deleted lock and emitted `STALE_RECOVERED` audit event |
| D1 batch rollback | PASS | Batch created a probe table then deliberately failed on a missing table; subsequent sqlite_master query confirmed the probe table was absent |
| Run-state integration | NOT YET INTEGRATED | Current rehearsal used disposable run records; runner integration remains a separate step |

Cloudflare D1 batch behavior was directly exercised through the D1 HTTP API: successful batch statements were rolled back when a later statement failed. This is a live disposable-D1 observation, not an assumption based on local SQLite.

## Adapter implementation

`scripts/migrations/d1-lock-adapter.mjs` provides a Cloudflare Worker D1 binding adapter:
- all lock mutations use `D1Database.batch()`;
- singleton acquisition is `INSERT ... ON CONFLICT(lock_key) DO NOTHING` from an exact approved run row;
- acquisition binds target, plan, manifest and owner digest;
- release is conditional on both run ID and owner hash;
- stale recovery requires process-termination proof, exact owner hash and explicit approval ID;
- recovery leaves the run `AMBIGUOUS`, never `RELEASED`;
- no TTL, expiry or automatic lock stealing exists;
- raw owner tokens are never persisted;
- SQL DDL is kept in a separate schema file and never run by the adapter.

The schema file is a disposable-first specification only. It has not been applied to staging or production.

## Important limits

- This rehearsal used Cloudflare's D1 HTTP query API to exercise the same SQLite statements and batch transaction semantics. It did not run the JavaScript adapter inside a deployed Worker with an actual D1 binding.
- A D1 Worker-binding integration test and run-state/lock orchestration integration remain required before runner integration.
- The test database is isolated and disposable. It must be deleted after evidence capture.
- No migration DDL was executed against Nature Frontiers staging or production.

## Disposition

**DISPOSABLE D1 LOCK SEMANTICS: PASS FOR TESTED OPERATIONS. ADAPTER SOURCE ADDED, WORKER-BINDING INTEGRATION NOT YET VERIFIED. DO NOT INTEGRATE WITH RUNNER OR APPLY SCHEMA TO STAGING.**

Next gate: verify this adapter inside an isolated Worker using a disposable D1 binding, then run the interruption/concurrency suite through the adapter itself. Only after that review may runner integration be proposed.
