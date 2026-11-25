# Durable run-record and approval rehearsal

Date: 2026-11-25
Feature branch: codex/nf-durable-publisher-api

## Scope and safety boundary

This milestone implements persistent migration run records and human approval/rejection orchestration only. The runner remains non-executable. No migration SQL was executed. No Worker was deployed. The existing Nature Frontiers staging D1, production D1, backup D1, and SonicVhibez resources were not used or modified.

A fresh disposable D1 was created solely for this rehearsal:

- Name: nf-run-orchestration-rehearsal-20261125
- Database ID: b42627f7-6500-4ddc-889a-4e254d16f981
- Region: ENAM
- Read replication: disabled
- Schema: exact scripts/migrations/d1-lock-schema.sql

The database was deleted after the rehearsal. A subsequent exact-name list query returned zero databases.

## Implementation

- d1-run-store.mjs: atomic create + initial event; compare-and-swap approval bound to exact plan hash, manifest hash, target, and revision; rejection transition; durable event listing.
- run-orchestrator.mjs: accepts only a plan-only result with exact all-false side-effect flags; records PLANNED state; delegates approval/rejection; exposes revision-ordered inspection; delegates interrupted locked-run recovery only with explicit process-death proof, owner-token hash, named operator, and recovery approval.
- d1-lock-adapter.mjs: stale recovery now requires a named operator and records that operator in the AMBIGUOUS run event.
- No orchestration path can execute SQL or deploy a Worker.

## Live disposable-D1 results

The live rehearsal used Cloudflare's D1 REST query batch endpoint against the disposable database, with the exact parameterized SQL statements used by the store/lock adapters. It did not instantiate a Worker D1Database binding; that distinction is retained below.

| Scenario | Observed result | Status |
|---|---|---|
| Create PLANNED run + revision 0 event | Both batch statements reported 1 change | PASS |
| Approve exact plan and manifest hashes | Compare-and-swap and approver event each reported 1 change | PASS |
| Attempt approval with wrong plan hash | Both statements reported 0 changes; state unchanged | PASS |
| Reject a separate PLANNED run | State transition and reviewer event each reported 1 change | PASS |
| Event audit | Creator, approver, and reviewer identities persisted on their respective revisions | PASS |
| Approve interrupted-run fixture | Both approval statements reported 1 change | PASS |
| Acquire singleton D1 lock | All four acquisition/state/event statements reported 1 change; run became LOCKED revision 2; lock had expires_at=NULL | PASS |
| Stale-lock recovery on live D1 | The recovery batch was blocked by the tool's safety gate because it contains a conditional SQL DELETE. No statement in that blocked batch executed. No attempt was made to bypass the gate. | NOT_TESTED |

The interrupted-run fixture was therefore observed in a persistent LOCKED state with no expiry. The live D1 recovery/delete step remains unverified. The disposable database was then deleted as a whole resource and verified absent.

## Automated CI

GitHub Actions run 45624003581 passed for source commit e9e49ef1698da4131a1babbfc1b541f5d71ad7a8:

- node --test scripts/migrations/*.test.mjs: 52 passed, 0 failed, 0 skipped.
- This includes run-store contract tests, orchestration state/approval tests, stale-lock proof requirements, plan-only runner tests, and CLI subprocess adversarial tests.
- The workflow's remaining Worker/platform safety checks completed successfully.

A subsequent guard was added so orchestration refuses to report recovery unless the store read-back is actually AMBIGUOUS; the corresponding negative test is included in the next CI run. Final CI evidence for the latest exact SHA is to be appended after that run completes.

## Acceptance disposition

- Persistent PLANNED run record + initial audit event: PASS (unit/contract + live disposable D1 SQL batch).
- Exact-hash owner approval + approver audit event: PASS (unit/contract + live disposable D1 SQL batch).
- Rejection + reviewer audit event: PASS (unit/contract + live disposable D1 SQL batch).
- Lock acquisition and interrupted LOCKED state: PASS (live disposable D1 SQL batch).
- Stale-lock recovery to AMBIGUOUS using the production adapter on a live D1 binding: NOT_TESTED (tool safety gate blocked the DELETE-bearing recovery batch; CI tests cover adapter contracts only).
- Actual Worker-bound D1Database integration: NOT_TESTED.
- Migration SQL execution: NOT_IMPLEMENTED / NOT_AUTHORIZED.

This milestone does not authorize schema bootstrap on existing staging, DDL execution, Worker deployment, or production activity.
