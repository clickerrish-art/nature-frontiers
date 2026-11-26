# Job 4B — plan-only runner lifecycle integration

## Scope and target

- Repository: `clickerrish-art/nature-frontiers`
- Branch: `codex/nf-durable-publisher-api`
- Pull request: #30, remain open and draft
- Rehearsal Worker: `nf-adapter-worker-rehearsal`
- Rehearsal D1: `a12fb838-1bd1-4811-9cf1-2ad5b21089d4`
- Staging allowlist retained: `89be73af-ebaf-4c19-b75a-9871adb8ba3c / nature-frontiers-staging`

## Implementation

`scripts/migrations/migration-runner.mjs` composes the existing pure `orchestratePlanOnly` planner with the D1 run store, human-approval orchestrator, and persistent lock adapter. The supported lifecycle is explicit: plan, persist PLANNED, approve against exact plan and manifest hashes, acquire the persistent lock, release only with the matching owner token, and inspect persisted run and lock event histories. Interrupted runs use the existing process-termination confirmation and explicit recovery approval path and become AMBIGUOUS.

The runner has no SQL/DDL execution, schema mutation, or Worker deployment method. Its capability declaration sets all such capabilities to false. The original offline `run-plan.mjs` CLI remains staging-only and has no D1 or lock capability. The planner accepts only exact staging and exact disposable rehearsal target pairs; mixed identities and production targets remain rejected.

A rehearsal-specific defect was fixed: orchestrator rejection now uses its configured exact target rather than hardcoding staging. Lock acquisition and release run-event entries now record the named actor.

## Live verification — PASS

Final Worker deployment:
- Deployment ID: `796bfe1c92f849259edb1d0f91d106fc`
- Worker source file SHA: `339647ead6de0bc352729fc87e02926066c6d41f`
- Compatibility flag: `nodejs_compat`
- Exact D1 binding: `a12fb838-1bd1-4811-9cf1-2ad5b21089d4`
- Observability disabled, invocation logs disabled, Logpush disabled, and query-string redaction enabled
- Health reports exactly the rehearsal target, four control tables, and all execution/deployment capabilities false

### Approval, lifecycle and owner-only release

The deployed Worker used the checked-in plan-only runner to produce an empty-migration plan, persist PLANNED, record explicit approval, acquire the D1 lock, and release it. The live lifecycle fixture `d5d56bc9-0928-47a1-b65e-6531337eda80` reached PLANNED → APPROVED → LOCKED → RELEASED; the competing fixture `21b3e108-9c8a-4650-a064-b265244d5a0d` remained APPROVED. Wrong-owner release was rejected and left the lock intact; matching-owner release succeeded. Persisted run events included the planner, approver, and lock-owner actors.

### Independent cross-request concurrency

Two independently approved runs were contended through separate HTTPS Worker requests:
- Winner: `123e4567-e89b-42d3-a456-4266141740a3`
- Loser: `123e4567-e89b-42d3-a456-4266141740a4`

Independent D1 readback while the lock was held showed exactly one LOCKED run at revision 2, the other still APPROVED at revision 1, and the singleton lock row owned by the winner. After owner release, independent D1 readback showed winner RELEASED at revision 3, loser APPROVED at revision 1, ACQUIRED and RELEASED events carrying the same owner-token hash, and zero active lock rows.

### Restart recovery and persisted audit history

Run `2d1dc130-1173-4272-8714-83c302bad6ca` was left LOCKED by one Worker request and recovered by a separate Worker request using explicit process-termination confirmation and recovery approval `job4b-recovery-approval`. Independent D1 readback showed PLANNED → APPROVED → LOCKED → AMBIGUOUS at revision 3, with `ACQUIRED` then `STALE_RECOVERED` lock events, recovery actor `job4b-recovery-operator`, and no remaining lock row. A repeated recovery inspection returned `alreadyRecovered` without another state transition.

The interruption proof is across separate completed Worker requests, demonstrating persisted state across requests. It is not a forced termination of a Worker isolate in the middle of a D1 batch; do not claim that stronger fault-injection guarantee.

### CI

GitHub Actions run `45643454783` passed on exact source SHA `d24be33c49ebbda8c8aaff29da38073399915ae5`. The migration planner/D1 adapter contract suite, planner syntax check, Worker syntax check, and all existing platform safety tests completed successfully. The preceding run caught test-fixture expectation issues; those were corrected before this successful run.

## Safety

- No staging, production, or backup D1 database was targeted.
- No migration SQL, migration ledger update, or migration DDL was executed.
- Only run-state, lock, and audit-event rows were written to the isolated rehearsal D1.
- The rehearsal D1 still contains only its four preinstalled control tables.
- No publisher Worker deployment or publishing action was performed.
- PR #30 remains open/draft/unmerged; `main` is untouched.

## Acceptance

Live lifecycle, independent cross-request lock exclusion, owner-only release, interruption recovery, and persisted audit history are verified on the disposable rehearsal target. The remaining qualification is that interruption recovery was tested across Worker requests, not by forcibly killing an isolate mid-batch.
