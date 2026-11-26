# Job 4C — authenticated plan-only migration operator

## Scope and deployment

- Repository: `clickerrish-art/nature-frontiers`
- Branch: `codex/nf-durable-publisher-api`
- Final source commit: `cf5caee8eac031317fed9327d43a4beab4739de6`
- PR #30 remains open and draft; do not merge.
- Operator page: https://nf-adapter-worker-rehearsal.kajiboye44.workers.dev/operator
- API: same-origin `POST /api/operator`
- Final Worker deployment: `c3045cc301d7430e9d505dfa1e7926fa`
- D1 binding: disposable rehearsal database `a12fb838-1bd1-4811-9cf1-2ad5b21089d4`
- Worker name: `nf-adapter-worker-rehearsal`

## Operator capabilities

`workers/nf-adapter-worker-rehearsal/operator-interface.mjs` implements:
- `createPlan`: exact UTF-8 manifest text and exact artifact bytes (base64 by manifest path), bounded request sizes, plan-only generation, and persistence as PLANNED.
- `approve`: requires both operator-supplied expected SHA-256 values (plan and manifest), named approver, reason and explicit approval reference. Stored hashes are not silently substituted for the operator's submitted hashes.
- `acquire` and `release`: require a run ID, owner token of at least 32 characters and named actor. The D1 adapter stores only the token digest and enforces owner-only release.
- `inspect`: returns the persisted run, run-state events, current lock and lock events.
- `recover`: requires the original owner token, explicit process-termination confirmation, named recovery operator and approval reference. It transitions to AMBIGUOUS and does not resume or retry work.

Unknown action fields and unsupported actions are rejected. Request bodies are capped at 1 MiB, manifest text at 128 KiB and combined artifact bytes at 768 KiB. There is no SQL endpoint, DDL executor, schema mutation, migration execution or Worker deployment action.

## Authentication and browser protections

The UI is served at `GET /operator`. Mutating and inspection API requests require an exact `Authorization: Bearer <AUTH_TOKEN>` header. Authentication is fail-closed; missing, short, or incorrect configured secrets do not authorize a request. The page holds the bearer token and owner tokens in memory only, does not use localStorage/sessionStorage/IndexedDB, uses same-origin API calls, no-store responses, a nonce-based restrictive CSP, and no URL credentials. Temporary Job 4A/4B query-string self-test routes have been removed.

The rehearsal Worker has a rehearsal-only `AUTH_TOKEN` secret. The operator must possess that secret to use the API. Rotate it to an operator-controlled value in the Cloudflare Worker settings before day-to-day use; do not reuse a production or staging credential.

## Automated verification — PASS

GitHub Actions run `45645896775` passed on exact source SHA `cf5caee8eac031317fed9327d43a4beab4739de6`. The migration test command includes the operator contract suite. Tests cover:
- exact manifest bytes and artifact base64 decoding;
- exact operator-supplied plan and manifest hashes;
- missing/malformed hashes;
- explicit process-termination confirmation and recovery approval;
- minimum owner-token length;
- exact bearer-token authentication, missing/wrong-token denial;
- unknown fields/actions and absence of browser storage;
- no DDL capability exposure.

## Live rehearsal — PASS for lifecycle dispatcher and D1 persistence

Final committed Worker is deployed to the exact disposable rehearsal Worker and D1. Its health response confirms:
- target exactly `rehearsal / a12fb838-1bd1-4811-9cf1-2ad5b21089d4 / nf-adapter-worker-rehearsal`;
- four control tables;
- `d1MigrationSqlExecution=false`, `ddlExecution=false`, `schemaMutation=false`, `workerDeployment=false`.

The public operator page loads. The temporary `/__operator-selftest` route used for one live dispatcher exercise was deployed only for that test, then removed by restoring the exact committed Worker source. Final verification confirms that route returns 404.

The temporary test exercised the same `dispatchOperatorAction` implementation used by the authenticated API against the real Worker-bound D1:
- Run `8eedfd30-fee4-49e5-a2b7-909beae65608`: PLANNED → APPROVED → LOCKED → RELEASED.
- Wrong-owner release returned false and the lock remained held.
- Correct-owner release succeeded.
- Persisted run events included PLANNED, APPROVED, LOCKED and RELEASED; lock events included ACQUIRED and RELEASED.
- Run `05024f75-7839-4132-bfb8-b4f88d78fa17`: PLANNED → APPROVED → LOCKED → AMBIGUOUS, with ACQUIRED and STALE_RECOVERED lock events, and an explicit recovery approval.

Independent D1 SQL readback confirmed both histories and zero active lock rows. At final inspection the disposable D1 held 43 run records, 124 run events, 38 lock events, and the four control tables (plus Cloudflare's internal `_cf_KV` table); no active lock remained. No cleanup deleted audit evidence.

## Verification limitation

The deployed operator UI and public page were verified over HTTPS. The complete dispatcher lifecycle was exercised live against D1 using a temporary internal test route that was removed immediately afterwards. Exact bearer authorization, missing/wrong-token denial, and UI no-storage properties passed automated tests. A real browser-driven authenticated HTTP POST through the UI was not completed because the available browser automation wallet was overdrawn and the Cloudflare execution environment blocks outbound requests to the Worker hostname. Therefore mark the live browser-authenticated HTTP round trip as NOT_TESTED, not PASS.

## Safety and repository state

- Only the disposable rehearsal Worker and D1 were used.
- No staging, production or backup database was touched.
- No DDL, migration SQL, migration-ledger update or schema mutation was executed.
- No publisher deployment or publishing action occurred.
- The final committed Worker has no temporary self-test routes.
- The existing staging target allowlist is unchanged.
- `main` remains at `678e3db436bb8e50c8e8d8aab48ef024e75fbdf0`; no main commit was created.
- PR #30 remains open, draft and unmerged.

## Acceptance

Implementation, automated security/contract tests, live dispatcher lifecycle, D1 persistence, owner-only release, recovery and no-DDL capability checks pass. The one outstanding verification is a browser-driven authenticated HTTP POST through the visible UI; do not overstate that test as completed.
