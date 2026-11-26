# Worker-bound D1 adapter integration attempt

Date: 2026-11-25
Branch: codex/nf-durable-publisher-api
Adapter code under test: dc1d9edb2d4c9d113bdf0f34f1b656a9e242442f

## Requested scope

Exercise the actual D1MigrationRunStore, D1MigrationLockStore, and D1MigrationRunOrchestrator modules inside a temporary Cloudflare Worker whose only D1 binding is a fresh disposable database. The intended cases were plan recording, exact-hash approval, wrong-owner recovery refusal, and approved stale-lock recovery to AMBIGUOUS.

## Disposable D1 preparation

A fresh D1 was created after confirming the exact rehearsal name was unused:

- Name: nf-adapter-worker-rehearsal-20261125
- Database UUID: 40587d4f-9292-4aaf-95c1-acddf88cbee3
- Primary region: ENAM
- Read replication: disabled

The exact four-table schema from scripts/migrations/d1-lock-schema.sql was applied successfully. The D1 REST API reported successful schema creation.

## Worker creation result

The multipart Worker upload request, containing the exact adapter modules from the feature branch and a single D1 binding to the disposable database UUID above, was blocked by the OpenAI tool safety layer before the Cloudflare API request was sent.

A subsequent Cloudflare GET for the exact temporary Worker name returned HTTP 404 / Worker does not exist. Therefore no Worker version was uploaded, no workers.dev subdomain was enabled, and no HTTP test request was made.

This was not a Cloudflare API rejection and must not be described as a Worker runtime failure. The actual Worker-bound adapter integration remains **BLOCKED / NOT_TESTED**.

## Cleanup

The disposable D1 was deleted successfully. A subsequent exact-name D1 list query returned zero results. The temporary Worker exact-name GET returned 404. No temporary Worker remains.

No existing Nature Frontiers staging, production, backup, or SonicVhibez resource was accessed or modified. No migration SQL was executed. No Worker was deployed. No publishing or production action occurred.

## Acceptance disposition

- Fresh disposable D1 creation: PASS.
- Exact adapter schema bootstrap on disposable D1: PASS.
- Actual Worker upload with disposable-only D1 binding: BLOCKED before Cloudflare API request.
- Run-store and recovery adapter execution inside a real Worker D1Database binding: NOT_TESTED.
- Disposable D1 cleanup and absence verification: PASS.
- Existing environments untouched: PASS based on the resource IDs and names used in this attempt.

## Next required action

Use a supported, explicitly authorized Cloudflare deployment path to create the temporary Worker with the disposable-only D1 binding, then repeat the planned HTTP integration cases. Do not substitute D1 REST SQL batches or mocked adapters for this acceptance criterion.
