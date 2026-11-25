# Runner D1 validation record

Date: 2026-11-25  
Code under test: `codex/nf-durable-runner-fail-closed`  
Schema source: recovered read-only staging snapshot `schema.snapshot.sql` (SHA-256 provenance is recorded in `SOURCE-MANIFEST.json`)  
Environment: temporary Cloudflare D1 database, not the staging database

## Isolation and cost controls

- Temporary database: `nf-runner-validation-20261125`
- Temporary database ID: `d07b4339-4e1a-4753-b31a-4eb4f2b6b0b0`
- The database was created only for this validation and populated with synthetic test fixtures.
- The recovered schema snapshot was applied only to this disposable database. It was not applied to staging.
- No Meta API request, OAuth exchange, content publication, or production Worker deployment was performed.
- The disposable database was deleted successfully after the checks below; no temporary D1 database remains.

## Actual D1 checks performed

1. Applied the recovered DDL snapshot to the disposable D1 database. Table, index, and trigger creation succeeded.
2. Inserted synthetic content, a validated media record, matching rights evidence, a signed-receipt-shaped approval fixture, one held schedule slot, and the three fail-closed controls.
3. Ran two concurrent conditional lease-acquisition D1 batches against the same due slot. Exactly one contender changed the schedule row and inserted a worker run; the other contender changed zero rows and inserted no worker run. This demonstrates single-winner exclusion for this tested SQL pattern on D1.
4. Ran the completion batch with a wrong lease hash. Both statements changed zero rows.
5. Ran the completion batch with the owning lease hash. The worker run and schedule slot each changed exactly one row.
6. Simulated an expired `publishing` lease with a `reserved` publication attempt. The recovery batch changed the slot to `dead_letter`, changed the attempt to `ambiguous`, marked the worker run `abandoned`, and inserted one audit event. No retry was made.

## Limits

These checks validate the SQL patterns against actual D1 and synthetic rows. They do not prove the authenticated Worker routes end-to-end, Cloudflare Worker request handling, real Meta provider behavior, token refresh, media delivery, or live publication. The approval fixture was accepted by the database guard; this D1 test did not independently exercise the Worker's HMAC receipt verifier.

## Result

The tested D1 lease exclusion, owner-hash completion, and ambiguous-attempt recovery SQL behaved as expected in the disposable database. This is an integration checkpoint, not a release approval or a claim that the full automation system is complete.


## Verified destination and approval-to-schedule D1 check

A second disposable D1 database was used after adding the destination-binding flow:

- Database: `nf-release-validation-20261125`
- Database ID: `1a37e942-73d9-48ef-bf26-8c4b041b3b4c`
- The same recovered schema snapshot was applied only to this temporary database.
- Synthetic rows represented a verified Meta Page connection, current media and rights evidence, a content revision, a held platform target, and a matching approval receipt.
- The target and content were advanced to `approved`, then a `ready` schedule slot was inserted. The database's `schedule_requires_approval_insert` trigger accepted the exact verified target/approval/rights combination.
- A read-only verification query returned `content_status=approved`, `target_status=approved`, `meta_status=verified`, `decision=approved`, and `schedule_state=ready`.
- The second disposable database was deleted successfully.

This validates the database-side destination/approval/scheduling relationship with synthetic fixtures. It does not validate the Worker HMAC route or any real Meta account.
