# Job 4B — plan-only runner lifecycle integration

## Scope and target

- Repository: `clickerrish-art/nature-frontiers`
- Branch: `codex/nf-durable-publisher-api`
- Pull request: #30, remain open and draft
- Rehearsal Worker: `nf-adapter-worker-rehearsal`
- Rehearsal D1: `a12fb838-1bd1-4811-9cf1-2ad5b21089d4`
- Staging allowlist retained: `89be73af-ebaf-4c19-b75a-9871adb8ba3c / nature-frontiers-staging`

## Implementation

`scripts/migrations/migration-runner.mjs` composes the existing pure plan-only planner with the D1 run store, approval orchestrator, and persistent lock adapter. The supported lifecycle is explicit: plan, persist PLANNED, approve against exact plan and manifest hashes, acquire the persistent lock, release only with the matching owner token, and inspect persisted audit events. Interrupted runs use the existing process-termination confirmation and explicit recovery approval path and become AMBIGUOUS.

The runner has no SQL/DDL execution, schema mutation, or Worker deployment method. Its capability declaration sets all such capabilities to false. The original offline CLI remains staging-only and has no D1 or lock capability. The planner accepts only exact staging and exact disposable rehearsal target pairs; mixed identities and production targets remain rejected.

A rehearsal-specific defect was fixed: orchestrator rejection now uses its configured exact target rather than hardcoding staging. Lock acquisition and release audit events now record the named actor in the run-event history.

## Live verification

The live rehearsal is pending deployment of this exact branch revision. Required checks before acceptance:

1. Verify rehearsal Worker imports the checked-in lifecycle module and reports the exact rehearsal target and all four control tables.
2. Execute plan and persist PLANNED; independently read back the run row and initial event.
3. Approve using exact persisted plan and manifest hashes; verify APPROVED and approval identity.
4. Prove lock acquisition is rejected before approval.
5. Run two independent Worker requests concurrently against separate approved runs; exactly one must acquire the singleton lock.
6. Verify wrong-owner release is rejected without deleting the lock; matching-owner release succeeds.
7. Independently inspect run revisions and lock/run event history.
8. Simulate interruption by leaving a locked run across separate Worker requests; recover only with process-termination confirmation and explicit recovery approval; verify AMBIGUOUS and STALE_RECOVERED history.
9. Verify no active lock remains after release/recovery.
10. Confirm no DDL/migration SQL execution and no staging/production database access.

A Worker-request boundary interruption test is not equivalent to forcibly terminating an isolate during a D1 batch; do not claim that stronger guarantee without a dedicated fault-injection test.

## Safety

- No staging, production, or backup D1 database is targeted.
- No migration SQL, migration ledger update, or DDL is executed.
- No publisher Worker deployment or publishing action is performed.
- PR #30 remains open/draft/unmerged; `main` is untouched.
- The existing staging target remains the default orchestrator target and the offline CLI remains staging-only.

## Acceptance

Job 4B is not accepted until exact-SHA CI and the live rehearsal checks above pass, with independent D1 readback. Unit tests or Worker health alone are not sufficient.
