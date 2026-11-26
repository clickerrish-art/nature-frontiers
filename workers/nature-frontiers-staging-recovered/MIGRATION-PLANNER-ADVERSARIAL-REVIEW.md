# Offline migration planner adversarial review and lock-state implementation

Date: 2026-11-25
Repository: `clickerrish-art/Nature-Frontiers`
Branch: `codex/nf-durable-publisher-api`

**Scope:** source-level adversarial review of the offline manifest planner, followed by a non-D1 lock/run-state protocol and tests. This review does not establish D1 behavior, cross-process locking, migration execution safety, or deployment readiness.

## 1. Review result

The first planner milestone had a useful baseline—SHA-256 and byte-length checks, target allowlisting, deterministic sequence sorting, duplicate JSON-key detection, and an offline CLI—but it was not yet hardened against several malformed or ambiguous inputs.

### Findings and remediation

| Finding | Risk | Remediation in current branch |
|---|---|---|
| Unknown manifest/target/migration fields were accepted | Typographical or attacker-added fields could be silently ignored | Exact allowlists now reject unknown keys at all three levels |
| Duplicate dependency declarations were accepted | Ambiguous manifest intent and noisy plan | Duplicate dependency IDs now rejected |
| Extra artifact bytes not referenced by manifest were ignored | Caller could believe all supplied inputs were planned | Planner now rejects unreferenced artifact-map entries |
| Exported planner trusted caller-provided manifest object and raw bytes independently | Plan hash could bind bytes that do not represent the object being validated | Raw bytes are parsed strictly and compared to the supplied object |
| Exported planner did not validate raw byte input or metadata shape | Invalid caller input could fail inconsistently or yield misleading provenance | Requires Uint8Array bytes, valid full Git SHA or null, and canonical semantic version |
| CLI silently accepted unknown flags | Operator typo could go unnoticed | CLI now rejects unknown and duplicate options |
| Target validation did not reject extra target fields | Ambiguous target configuration could pass | Target object has exact allowed keys |
| Prior tests did not exercise these adversarial cases | CI success did not cover these conditions | Expanded planner tests cover unknown keys, duplicate dependencies, mismatched raw bytes and extra artifacts |

### Residual limitations

- Review was source-level plus CI execution; it was not a formal security audit or independent third-party penetration test.
- Filesystem path checks use canonical resolution, but do not claim protection against a hostile process concurrently replacing files between resolution and read.
- The planner still intentionally does not parse SQL, inspect D1, compare a live schema or ledger, acquire a persistent lock, or execute a migration.
- Empty manifest means no declared work; it is not schema parity or proof of migration history.

## 2. Lock and run-state implementation

Added `scripts/migrations/lock-state.mjs` with:
- explicit run states: `PLANNED`, `APPROVED`, `LOCKED`, `PRECHECKED`, and fail-closed terminal states;
- legal transition checks and an explicit approval reference before `APPROVED`;
- exact staging target guard;
- adapter contract requiring atomic `claimIfAbsent`, `releaseIfOwner`, and `clearIfOwner` operations;
- random owner token whose SHA-256 digest, not raw token, is recorded;
- non-expiring lock record (`expiresAt: null`); no automatic stealing;
- conditional release tied to owner hash;
- manual stale-lock recovery requiring confirmation the original process cannot resume and an approval reference;
- no `APPLYING` or `APPLIED` state, no DDL API and no SQL execution capability.

### Crucial implementation boundary

`InMemoryAtomicLockStore` is a process-local reference/test adapter only. It is not a cross-process lock and must never be used to coordinate actual staging runners. No D1 adapter or lock-table schema is implemented. No staging lock has been acquired.

A future D1 adapter must demonstrate atomic claim/release semantics and interruption/concurrency safety on disposable D1 before it can be considered usable.

## 3. Automated verification

Added planner adversarial tests and lock/run-state tests. The suite includes:
- duplicate JSON keys and malformed JSON;
- deterministic manifest order independent of filename/input order;
- duplicate/gapped sequence and duplicate dependency rejection;
- unknown field rejection at manifest, target and migration levels;
- byte-length, SHA-256, raw-manifest/object mismatch and unreferenced-artifact rejection;
- unsafe target, traversal and missing dependency rejection;
- empty-manifest non-parity semantics;
- run-record target/hash/timestamp validation;
- approval and transition checks;
- simultaneous lock claims (exactly one winner in the in-memory adapter);
- wrong-owner release refusal and correct-owner release;
- no automatic stale-lock expiry/steal;
- manual recovery gates;
- production/unknown target refusal.

GitHub Actions for implementation commit `845bd45249ee72464a6db3573b192dfee6306f2b` completed successfully:
https://github.com/clickerrish-art/nature-frontiers/actions/runs/45611713407

This CI result validates the checked-in automated tests and existing workflow steps. It does not validate D1 lock semantics or DDL rollback.

## 4. No-write assurance

During this task:
- no D1 connection was opened;
- no D1 table, lock, ledger, or schema was created or changed;
- no migration SQL was executed;
- no Worker was deployed;
- no production resource was accessed for mutation.

## 5. Disposition and next gate

**OFFLINE REVIEW REMEDIATIONS IMPLEMENTED — LOCK/RUN-STATE PROTOCOL IMPLEMENTED AS AN ADAPTER CONTRACT — D1 ADAPTER ABSENT — NO DATABASE WRITES.**

Next engineering gate: independently design and rehearse the D1 adapter's atomic claim/release and crash-recovery semantics against a disposable D1. Keep DDL execution separately gated by the complete D1 failure-semantics matrix, backup/restore proof, and a separate explicit owner approval for the exact staging operation.
