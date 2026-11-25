# Nature Frontiers staging migration runner integration plan

Date: 2026-11-25
Repository: `clickerrish-art/Nature-Frontiers`
Branch at review: `codex/nf-durable-publisher-api`
Branch tip reviewed: `a1854948232cd8fbab7fa114ce462428584cf5c3`

## Disposition

**PLAN ONLY — runner integration is not implemented or authorized by this document.** The persistent D1 lock adapter and run store exist, but the checked-in JavaScript has not been successfully exercised inside a deployed Worker using a real D1 binding. The browser-triggered validation attempt was stopped to avoid further delay. Its temporary Worker and disposable D1 were deleted and deletion was verified.

No existing Nature Frontiers staging, production, or backup D1 was modified. No schema DDL, migration, Worker deployment, publishing action, or Meta action is authorized by this plan.

## Exact-SHA evidence reviewed

| Artifact | Commit / blob | Evidence and limit |
|---|---|---|
| Branch tip | `a1854948232cd8fbab7fa114ce462428584cf5c3` | Current branch ref at review; branch is not protected. |
| D1 lock adapter | blob `106aacdac85fb7a0e23d05300c6ba942b467e42e` | Pinned staging target; conditional singleton acquisition; owner-hash release; approval-gated manual recovery; no TTL/automatic stealing; no DDL or runner dispatch. |
| D1 run store | blob `59f13f4df31ba2af292d2f789b82fc21bf67f52f` | Persists PLANNED runs and explicit approval transitions. |
| Lock contract tests | blob `7bcecfda3dc996febd406ad0734ca2ab1a9049c1` | Node fake-binding contract tests; not a real Worker runtime. |
| Run-store tests | blob `1f4115a70b309e12b3bf8db9fd05ec9c318cdb7a` | Node fake-binding contract tests; not a real Worker runtime. |
| Disposable D1 rehearsal report | blob `2e79864fa008a39461785ad4107b7af0c4d33dda` | Direct D1 SQL probes passed for acquisition race, owner release, exclusion, interruption persistence, manual recovery, and batch rollback. It explicitly records JavaScript Worker binding runtime as NOT_TESTED. |
| Runner contract report | blob `c3ecf323b0367e910304479a0e46075239d4fb2e` | No pre-existing runner contract was recovered; historical 0005–0009 sources remain unavailable. |
| CI | run [45614508832](https://github.com/clickerrish-art/Nature-Frontiers/actions/runs/45614508832) | Success for implementation SHA `5098df7d8a2760d0d9c50af0e7c6f0075ff95c1b`; not evidence of live Worker binding behavior or a passing check on branch tip `a185494...`. |

## Integration sequence (future work; each gate must pass)

### 1. Close the runtime-validation gap
- If/when resumed, use only a newly created disposable D1 and a temporary Worker.
- Execute the checked-in `D1MigrationRunStore` and `D1MigrationLockStore` modules through the actual Worker `env.DB` binding.
- Assert all outcomes from D1 rows and audit events, not only an HTTP response.
- Cover two concurrent acquisitions, wrong-owner and correct-owner release, persistence across separate requests, contender exclusion, wrong-owner recovery refusal, and approved recovery to AMBIGUOUS.
- Delete the temporary Worker and disposable D1 and verify both are absent.
- Until this gate passes, record **Worker-binding runtime: NOT_TESTED** and do not claim full adapter validation.

### 2. Define the execution boundary before coding
- Keep the runner staging-only and pin the exact staging database ID and Worker name already enforced by the adapter.
- Runner entry points must default to plan-only; execution must require a separately supplied, one-shot approval bound to the exact run ID, target, manifest SHA, plan SHA, and operator.
- Reject production, unknown targets, empty/ambiguous manifests, missing artifacts, duplicate IDs, dependency/order violations, checksum or byte-length mismatches, and changed content for an applied identity.
- Never reconstruct or backfill historical 0005–0009 migrations. The current empty forward manifest means no forward migration is declared; it does not establish schema parity.
- Do not silently reconcile or rewrite the observed legacy 0009 ledger row.

### 3. Implement a fail-closed runner (only after the runtime gate and separate authorization)
- Load and validate the explicit manifest and immutable artifact bytes; compute plan and manifest SHA-256 values.
- Persist a PLANNED run, then require explicit approval before attempting lock acquisition.
- Acquire the singleton lock using the existing adapter; a losing invocation must stop before any DDL.
- Re-read the target and migration ledger under the lock. Stop on unknown rows, checksum drift, missing provenance, schema drift, or any unmet precondition.
- Execute one migration unit at a time using prepared D1 statements and `D1Database.batch()`; never use multi-statement `exec()` as a claimed transaction.
- Put the truthful migration-ledger insert in the same D1 batch as that migration's DDL only after the exact DDL-plus-ledger batch has passed disposable-D1 rollback and success rehearsals.
- Do not split SQL using a naive semicolon parser. Use a tested SQLite-aware statement parser or constrain and validate the artifact format explicitly.
- On uncertain transport/result state, stop and inspect the ledger/schema read-only. Never blind-retry DDL and never write a success ledger row on an uncertain result.
- Release only after a verified terminal outcome and only with the matching owner token. Leave ambiguous locks for manual recovery; never add TTL-based lock stealing.

### 4. Required test matrix
- Deterministic manifest ordering, duplicate/missing identifiers, dependencies, byte lengths, SHA mismatch, and changed-applied-content rejection.
- Plan-only behavior produces no D1 writes.
- Wrong target and missing/invalid approval refusal.
- Two concurrent runner invocations: exactly one can reach the DDL boundary.
- Duplicate invocation and already-applied migration behavior.
- DDL plus ledger success in one D1 batch; forced mid-batch failure rolls back both.
- Interrupted request, lost response, restart, ambiguous outcome, and manual recovery.
- Post-apply schema and ledger verification, including exact artifact/source provenance.
- All tests must run against disposable D1 for D1-specific semantics; fake-binding unit tests alone are insufficient.

### 5. Operational rollout gates
- First deliver runner code and tests on this feature branch only.
- CI must pass on the exact resulting commit SHA.
- Independent review must verify target pinning, approval binding, transaction behavior, audit records, no blind retries, and no publishing side effects.
- Rehearse against a disposable database cloned from a reviewed schema fixture, not the live staging database.
- Require a separate owner decision before any staging DDL or runner deployment. Production remains out of scope.

## Current blockers

1. **Worker-binding runtime test: NOT_TESTED** — the browser-triggered run was cancelled; this is not a PASS.
2. **Migration provenance: BLOCKED** — original staging 0005–0009 SQL sources and checksums remain unrecovered.
3. **Forward manifest: EMPTY** — no migration artifact is authorized or declared.
4. **Runner integration: NOT IMPLEMENTED** — this document is a sequence and acceptance contract only.
5. **Staging/production execution: NOT AUTHORIZED** — no live DDL or migration operation is permitted.

## Next concrete action

The next engineering change, once separately authorized, is to implement the runner's plan-only orchestration and test harness on this branch, without deploying it or executing DDL. The live Worker-binding test remains an explicit validation gap and must not be represented as passed.


## 2026-11-25 implementation update

The plan-only orchestration milestone described above has now been implemented on this feature branch.

- Pure orchestration: `scripts/migrations/plan-only-runner.mjs`
- Offline CLI: `scripts/migrations/run-plan.mjs`
- Test harness: `scripts/migrations/plan-only-runner.test.mjs`
- Command: `npm run migration:run-plan`
- Test inclusion: the existing `npm run test:migrations` glob includes the new test file.
- Implementation commit containing the complete milestone: `2af31ead01e691ecf63ae39c6120cc44794ff0a1`
- CI run: [45620760460](https://github.com/clickerrish-art/Nature-Frontiers/actions/runs/45620760460), completed successfully. The migration planner and D1 adapter contract test step, migration syntax check, Worker syntax check, and all other required job steps passed.

This completes **offline plan-only orchestration and its automated test harness only**. It does not implement D1 run persistence, lock acquisition, ledger inspection, prechecks, SQL execution, a DDL runner, or a Worker deployment. The live Worker-binding runtime test remains NOT_TESTED; original staging migration 0005–0009 provenance remains BLOCKED; the forward manifest remains empty; staging and production execution remain unauthorized.
