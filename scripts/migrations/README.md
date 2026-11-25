# Offline migration planner

This milestone is deliberately offline. It does not import a D1 client, open a network connection, inspect the database ledger, acquire a lock, execute SQL, or deploy a Worker.

## Current manifest

`workers/nature-frontiers-staging-recovered/migrations/manifest.json` is an empty forward-stream manifest. This is intentional: no historical 0005–0009 migration source has been recovered, and no new repair migration has been approved or authored. An empty manifest must not be interpreted as schema parity or as confirmation that staging is current.

## Read-only plan command

Run from the repository root:

```sh
node scripts/migrations/plan.mjs \
  --manifest workers/nature-frontiers-staging-recovered/migrations/manifest.json \
  --environment staging \
  --database-id 89be73af-ebaf-4c19-b75a-9871adb8ba3c \
  --worker nature-frontiers-staging
```

The command validates the staging allowlist before reading the manifest or artifacts. It outputs a deterministic plan hash, exact manifest/artifact SHA-256 values, manifest order, and explicit `NOT_INSPECTED_NO_D1_CONNECTION` states for the ledger and schema. It never connects to D1.

## Tests

```sh
npm run test:migration-planner
```

The test suite covers duplicate JSON keys, strict parsing, deterministic ordering, sequence gaps/duplicates, SHA-256 and byte-length mismatch, path traversal, missing dependencies, wrong/production targets, and empty-manifest semantics.

## Explicit limitations

- No migration SQL is currently declared.
- No schema or ledger inspection is performed.
- No lock or concurrency operation exists yet.
- No SQL parsing or statement splitting is performed.
- No migration execution, retries, rollback, or recovery are implemented.
- A plan is not evidence that D1 is ready or that a migration has run.

DDL execution remains separately gated by the disposable-D1 failure-semantics rehearsal, independent review, backup/restore proof, and separate explicit owner approval for the exact staging operation.
