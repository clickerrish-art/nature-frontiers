# Independent adversarial review — plan-only runner

**Reviewed commit:** `2af31ead01e691ecf63ae39c6120cc44794ff0a1`  
**Review date:** 2026-11-25  
**Scope:** `plan-only-runner.mjs`, `run-plan.mjs`, `planner.mjs`, `plan-only-runner.test.mjs`, and the CI job that executes the migration suite.  
**Disposition:** Review completed; hardening required before extending the runner.

## Evidence inspected

- Source blobs at the reviewed commit:
  - `scripts/migrations/plan-only-runner.mjs` — blob `5da0f45e5767d5d0edc3bd1ff6eae84b19aaca26`
  - `scripts/migrations/run-plan.mjs` — blob `29f1b54720cdaf6097673d2fe67a5fabb0283ef4`
  - `scripts/migrations/plan-only-runner.test.mjs` — blob `0a850f76e371ba2dc064220b529c73517d197db7`
  - `scripts/migrations/planner.mjs` — blob `3d1f12d1e40af137cf09abf3ab019149b76883b3`
- CI run [45620760460](https://github.com/clickerrish-art/Nature-Frontiers/actions/runs/45620760460) completed successfully.
- Its job log confirms `npm run test:migrations` executed 29 tests: 29 passed, 0 failed, 0 skipped. The four plan-only orchestration tests ran and passed.
- CI does not show a dedicated end-to-end invocation of `run-plan.mjs`.

## Findings

### R1 — Plan envelope is only shallowly immutable

**Severity: Medium (integrity / auditability).**

`orchestratePlanOnly()` freezes the outer result and `sideEffects`, but returns the `plan` object from `buildDryRunPlan()` without freezing it. The plan contains nested mutable migration records and dependency arrays. A caller can mutate `result.plan` after `planSha256` is computed. The reported hash then no longer commits to the currently displayed plan contents.

This is not a demonstrated execution bypass, but it weakens the integrity guarantee expected of a deterministic, hash-bound plan.

**Required remediation:** Deep-freeze the complete returned plan (including nested arrays/records), or return an immutable/defensive serialized representation. Add tests that attempt to mutate the plan, migration records, and dependency arrays and verify that mutation is rejected or cannot alter the returned plan.

### R2 — Path validation and file opening are separate operations

**Severity: Low; conditional on a concurrent filesystem writer.**

`run-plan.mjs` calls `realpath()`, checks that the resolved path is inside the permitted directory, and later calls `readFile()` by pathname. A process able to modify the checkout concurrently could replace the resolved file with a symlink after the check and before the open. The same pattern is used for migration artifacts.

No such race was observed in the reviewed CI job, and the current repository checkout is not itself evidence of an exploitable concurrent writer. Nevertheless, the pathname check is not an atomic guarantee about the object ultimately opened.

**Required remediation:** Open the file once using a no-follow strategy where supported, validate the opened file descriptor/object and its canonical location, then read from that same descriptor. Apply the same policy to manifest and artifact files. If the supported runtime cannot provide a defensible descriptor-based containment check, document the trusted-checkout assumption explicitly and do not describe the check as race-proof.

### R3 — CLI security boundary lacks adversarial integration tests

**Severity: Medium (coverage gap).**

The test suite exercises the pure orchestration function, but does not invoke `run-plan.mjs` as a subprocess. The inspected CI log shows the migration suite and syntax checks for the existing planner/legacy CLI and D1 modules; it does not show a dedicated CLI integration test for the new plan-only entry point.

Consequently, the following CLI behaviours are not evidenced by the current automated test harness:
- unknown, duplicate, missing, and empty argument values;
- wrong environment/database/Worker rejected before manifest or artifact reads;
- manifest path traversal and symlink escape;
- artifact path traversal and symlink escape;
- duplicate JSON keys and malformed UTF-8 rejected before any artifact read;
- missing artifact and checksum/byte-length mismatch;
- successful output for the empty manifest and a synthetic valid non-empty manifest;
- stable non-zero exit status and no partial success output on refusal.

**Required remediation:** Add subprocess-based CLI tests using temporary directories and synthetic fixtures. Include an observable sentinel outside the allowed root to prove it is never read. Test both valid empty and valid synthetic non-empty manifests. Keep all tests offline and without D1 bindings or credentials.

## Positive controls observed

- The pure orchestration entry point has an explicit allowlist of input keys and rejects unknown top-level capabilities such as a supplied `db` object.
- Manifest bytes are decoded with fatal UTF-8 handling and passed through the strict duplicate-key parser.
- The planner pins the staging target and rejects production/unknown database and Worker identities.
- Artifact bytes are checked against declared byte length and SHA-256.
- The returned envelope explicitly states plan-only mode and false D1 read/write, lock, SQL, and deployment side-effect flags.
- The implementation contains no D1 client, SQL executor, Worker deployer, or network capability.

These controls support the conclusion that the reviewed pure orchestration function is currently plan-only. They do not substitute for the missing CLI tests or live runtime evidence.

## Acceptance decision

**NOT READY TO EXTEND.** Resolve R1 and R3 before adding runner capabilities. R2 should be fixed or explicitly bounded by a documented trusted-checkout threat model before the CLI is used on mutable/untrusted workspaces.

No code changes, D1 operations, deployments, migration execution, or changes to `main` were made as part of this review. This report does not authorize runner execution or staging changes.
