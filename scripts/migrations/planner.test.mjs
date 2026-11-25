import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildDryRunPlan, parseStrictJson, stagingTarget } from "./planner.mjs";

const bytes = Buffer.from("CREATE TABLE example (id INTEGER PRIMARY KEY);\n");
const sha256 = createHash("sha256").update(bytes).digest("hex");
const entry = { sequence: 1, migrationId: "forward.example-001", path: "001_example.sql", sha256, byteLength: bytes.length, kind: "sql", requires: [] };
const manifest = (migrations = [entry]) => ({
  schemaVersion: 1,
  streamId: "nature-frontiers.staging.forward-v1",
  target: { ...stagingTarget },
  migrations
});
const plan = (m = manifest(), artifactBytes = new Map([["001_example.sql", bytes]]), target = stagingTarget) =>
  buildDryRunPlan({ manifest: m, artifacts: artifactBytes, target, manifestBytes: Buffer.from(JSON.stringify(m)), sourceCommit: "a".repeat(40) });

test("strict JSON parser rejects duplicate object keys", () => {
  assert.throws(() => parseStrictJson('{"x":1,"x":2}'), { code: "DUPLICATE_JSON_KEY" });
});
test("strict JSON parser accepts nested valid JSON", () => {
  assert.deepEqual(parseStrictJson('{"a":[1,true,{"b":"ok"}]}'), { a: [1, true, { b: "ok" }] });
});
test("manifest sequence, checksum and target produce a deterministic read-only plan", () => {
  const first = plan();
  const second = plan();
  assert.equal(first.planSha256, second.planSha256);
  assert.equal(first.migrations[0].sha256, sha256);
  assert.equal(first.executionEnabled, false);
  assert.equal(first.databaseState, "NOT_INSPECTED_NO_D1_CONNECTION");
  assert.equal(first.migrations[0].status, "PENDING_LEDGER_NOT_INSPECTED");
});
test("manifest order is sequence-based, not input or filename order", () => {
  const secondBytes = Buffer.from("CREATE TABLE second (id INTEGER);");
  const second = { sequence: 2, migrationId: "forward.example-002", path: "000_second.sql", sha256: createHash("sha256").update(secondBytes).digest("hex"), byteLength: secondBytes.length, kind: "sql" };
  const m = manifest([second, entry]);
  const p = plan(m, new Map([["001_example.sql", bytes], ["000_second.sql", secondBytes]]));
  assert.deepEqual(p.migrations.map(x => x.sequence), [1, 2]);
  assert.deepEqual(p.migrations.map(x => x.migrationId), [entry.migrationId, second.migrationId]);
});
test("duplicate and gapped sequence numbers are refused", () => {
  assert.throws(() => plan(manifest([entry, { ...entry, migrationId: "forward.example-002", sequence: 1, path: "002.sql" }])), { code: "DUPLICATE_SEQUENCE" });
  assert.throws(() => plan(manifest([{ ...entry, sequence: 2 }])), { code: "SEQUENCE_GAP" });
});
test("checksum and byte-length mismatch are refused", () => {
  assert.throws(() => plan(manifest(), new Map([["001_example.sql", Buffer.from("tampered")]])), { code: "BYTE_LENGTH_MISMATCH" });
  const altered = { ...entry, sha256: "0".repeat(64) };
  assert.throws(() => plan(manifest([altered])), { code: "CHECKSUM_MISMATCH" });
});
test("production, unknown and mismatched targets are refused", () => {
  assert.throws(() => plan(manifest(), new Map([["001_example.sql", bytes]]), { environment: "production", databaseId: "prod", worker: "nature-frontiers-publisher" }), { code: "TARGET_ENVIRONMENT_DENIED" });
  assert.throws(() => plan(manifest(), new Map([["001_example.sql", bytes]]), { ...stagingTarget, databaseId: "wrong-id" }), { code: "UNKNOWN_DATABASE_DENIED" });
});
test("path traversal and missing dependencies are refused", () => {
  assert.throws(() => plan(manifest([{ ...entry, path: "../escape.sql" }])), { code: "PATH_TRAVERSAL" });
  assert.throws(() => plan(manifest([{ ...entry, requires: ["forward.missing"] }])), { code: "MISSING_DEPENDENCY" });
});
test("empty manifest is an explicit no-migration plan, not evidence of schema parity", () => {
  const empty = manifest([]);
  const p = plan(empty, new Map());
  assert.equal(p.disposition, "NO_MIGRATIONS_DECLARED");
  assert.equal(p.schemaFingerprint, null);
  assert.equal(p.ledgerState, "NOT_INSPECTED_NO_D1_CONNECTION");
});
