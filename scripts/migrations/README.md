# Offline migration planner and lock-state protocol

Both components are offline. They do not import a D1 client, open a network connection, inspect a database ledger, execute SQL, or deploy a Worker.

## Read-only planner

Run from repository root:

```sh
node scripts/migrations/plan.mjs \
  --manifest workers/nature-frontiers-staging-recovered/migrations/manifest.json \
  --environment staging \
  --database-id 89be73af-ebaf-4c19-b75a-9871adb8ba3c \
  --worker nature-frontiers-staging
```

The planner validates exact schema keys, deterministic sequence, dependencies, path confinement, raw manifest bytes, artifact byte lengths and SHA-256 values. It rejects unknown targets before reading the manifest.

The forward-stream manifest remains empty because original staging 0005–0009 provenance is not recovered and no new repair migration is approved. Empty means no plan entries—not schema parity.

## Lock and run-state protocol

`lock-state.mjs` defines:
- run states and legal transitions;
- explicit approval reference before APPROVED;
- exact staging-target enforcement;
- atomic-store adapter contract;
- hashed owner tokens, non-expiring locks and conditional release;
- manual stale-lock recovery requiring confirmed process termination and approval;
- no APPLYING/APPLIED transition and no DDL capability.

`InMemoryAtomicLockStore` is a test reference implementation only. It is process-local and is **not** a cross-process lock. `D1MigrationLockStore` is the persistent adapter; its SQL batch behavior must be verified against the isolated disposable Worker/D1 rehearsal before runner integration.

## Tests

```sh
npm run test:migrations
```

This runs planner adversarial tests and lock/run-state tests, including simultaneous acquisition, owner mismatch, stale-lock hold, manual recovery, invalid target and refusal to represent DDL as applied.

## Target allowlist and disposable rehearsal

The adapter and run store accept two exact target tuples only:
- Existing staging: `staging / 89be73af-ebaf-4c19-b75a-9871adb8ba3c / nature-frontiers-staging`.
- Isolated rehearsal: `rehearsal / a12fb838-1bd1-4811-9cf1-2ad5b21089d4 / nf-adapter-worker-rehearsal`.

The rehearsal tuple is a second explicit allowlist entry, not an environment override. A mixed database/Worker pair is rejected. The orchestrator defaults to the staging tuple; rehearsal requires explicit constructor injection of `rehearsalLockTarget`. The SQL schema enforces the same two exact database/Worker pairs. Never copy the rehearsal target into a production configuration.

The disposable harness is `workers/nf-adapter-worker-rehearsal/worker.js`. It imports the checked-in adapter, run-store, and orchestrator modules as separate Worker modules and requires an `AUTH_TOKEN` secret plus the `DB` D1 binding. Its read-only `GET /health` endpoint reports only the pinned rehearsal target and number of control tables. Mutating operations are authenticated POST actions: `recordPlan`, `approve`, `acquire`, `release`, `recover`, and `inspect`.

## Hard boundary

The control schema and Worker harness are deployed only to the disposable rehearsal database/Worker. Existing staging, production, backup databases, and publisher Worker are not changed. The harness has no DDL or publisher capability. No migration SQL is executed. Runner integration remains blocked until real Worker-bound D1 requests prove acquisition, simultaneous-run exclusion, owner-only release, interrupted-run recovery, stale-lock protection, and independently read-back persisted event history.

## Plan-only runner orchestration

The pure orchestration boundary is `plan-only-runner.mjs`. It accepts exact manifest bytes, an artifact-byte map, and the pinned staging target, then returns a non-executable envelope. Its interface has no D1, lock, Worker, network, filesystem, or SQL capability. It explicitly reports that D1 reads/writes, lock acquisition, SQL execution, and Worker deployment did not occur.

Run the end-to-end offline plan-only command:

```sh
npm run migration:run-plan -- \
  --manifest workers/nature-frontiers-staging-recovered/migrations/manifest.json \
  --environment staging \
  --database-id 89be73af-ebaf-4c19-b75a-9871adb8ba3c \
  --worker nature-frontiers-staging
```

The command loads manifest and artifact bytes from within the repository, rejects path/symlink escapes, validates the exact target before reading files, and emits a JSON result. It does not persist a run record: creating a D1 run record would itself be a write and is outside plan-only mode.

The plan-only orchestration tests are included automatically by `npm run test:migrations`. They cover deterministic output, explicit no-side-effect flags, capability/input rejection, malformed UTF-8, and target refusal. These are offline Node tests, not live D1 or Worker-runtime evidence.


### Adversarial hardening (2026-11-25)

The plan-only result now deep-freezes the plan recursively, including target objects, migration records, and dependency arrays. Mutation-resistance tests cover those nested values.

The CLI opens manifest and artifact files once with `O_NOFOLLOW`, verifies regular-file descriptors, checks canonical containment and device/inode identity, then reads bytes from the validated descriptor. Final-component symlinks are rejected; intermediate symlinks are accepted only when their resolved target remains within the permitted root. Platforms without `O_NOFOLLOW` fail closed. The manifest is decoded with fatal UTF-8 and strict duplicate-key parsing before any artifact is opened.

Subprocess adversarial tests live in `scripts/migrations/run-plan.test.mjs`. They exercise valid empty and synthetic non-empty plans, malformed/duplicate arguments, wrong-target rejection before file access, manifest and artifact traversal/symlink attempts, duplicate JSON keys, malformed UTF-8, missing artifacts, checksum/length mismatches, and refusal output without partial JSON.

The existing `test:migrations` npm script uses the `scripts/migrations/*.test.mjs` glob, so both the orchestration and CLI subprocess tests are automatically included in the existing CI migration test step. CI evidence for this hardening is pending until a run completes on the resulting commit.


### Persistent run records and human approval orchestration

`D1MigrationRunStore` and `D1MigrationRunOrchestrator` persist a plan-only run and its human decisions in the control tables defined by `d1-lock-schema.sql`.

- `recordPlan` accepts only a `PLAN_ONLY` result whose execution flag is false and whose side-effect capability flags are all false. It persists the exact plan and manifest SHA-256 values, pinned staging target, creator identity, revision 0, and initial `PLANNED` event in one D1 batch.
- `approve` is a compare-and-swap transition from `PLANNED` revision 0 to `APPROVED` revision 1. The caller must supply the exact expected plan hash and manifest hash, exact pinned target, named approver, and explicit approval reference. The approval event records the approver separately from the plan creator.
- `reject` is a compare-and-swap transition from `PLANNED` to `REFUSED`, preserving the reviewer identity and reason. A rejected run cannot be approved by these transitions.
- `inspect` returns the durable run and append-only revision-ordered event history.
- `recoverInterrupted` is available only for a persisted `LOCKED` run and delegates to the D1 lock adapter. It requires process-termination confirmation, the exact owner-token hash, a named recovery operator, and an explicit recovery approval. Recovery ends in `AMBIGUOUS`; it never marks a run successful or retries SQL.

The orchestration layer has no SQL execution capability, no Worker deployment capability, and does not acquire locks during plan recording or approval. Lock acquisition remains a separate explicit adapter operation. A live disposable-D1 rehearsal must not be interpreted as staging authorization.

CI unit/contract tests are in `d1-run-store.test.mjs`, `run-orchestrator.test.mjs`, and `d1-lock-adapter.test.mjs`. The exact live disposable-D1 rehearsal and any blocked test cases are recorded in `workers/nature-frontiers-staging-recovered/RUN-RECORD-APPROVAL-REHEARSAL.md`.
