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

`InMemoryAtomicLockStore` is a test reference implementation only. It is process-local and is **not** a cross-process lock. No D1 adapter is included. A future D1 adapter must implement the atomic adapter contract and pass disposable-D1 concurrency/failure rehearsal before use.

## Tests

```sh
npm run test:migrations
```

This runs planner adversarial tests and lock/run-state tests, including simultaneous acquisition, owner mismatch, stale-lock hold, manual recovery, invalid target and refusal to represent DDL as applied.

## Hard boundary

No D1 connection, lock table, ledger inspection, lock acquisition against staging, DDL, migration execution, deployment, or production action occurs in this milestone. DDL execution remains gated by the separate disposable-D1 semantics rehearsal, backup/restore proof, independent review, and exact owner approval.
