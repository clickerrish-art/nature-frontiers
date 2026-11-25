import test from "node:test";
import assert from "node:assert/strict";
import { orchestratePlanOnly } from "./plan-only-runner.mjs";
import { stagingTarget } from "./planner.mjs";

const manifest = {
  schemaVersion: 1,
  streamId: "nature-frontiers.staging.forward-v1",
  target: { ...stagingTarget },
  migrations: []
};
const manifestBytes = Buffer.from(JSON.stringify(manifest));

test("orchestrator returns a deterministic, explicitly non-executable plan", () => {
  const input = { manifestBytes, artifacts: new Map(), target: stagingTarget };
  const first = orchestratePlanOnly(input);
  const second = orchestratePlanOnly(input);
  assert.equal(first.mode, "PLAN_ONLY");
  assert.equal(first.executionEnabled, false);
  assert.deepEqual(first.sideEffects, {
    d1Reads: false,
    d1Writes: false,
    lockAcquired: false,
    sqlExecuted: false,
    workerDeployed: false
  });
  assert.equal(first.plan.disposition, "NO_MIGRATIONS_DECLARED");
  assert.equal(first.plan.databaseState, "NOT_INSPECTED_NO_D1_CONNECTION");
  assert.equal(first.plan.ledgerState, "NOT_INSPECTED_NO_D1_CONNECTION");
  assert.equal(first.plan.planSha256, second.plan.planSha256);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.sideEffects), true);
});

test("orchestrator rejects unknown capabilities instead of accepting a D1 binding", () => {
  assert.throws(
    () => orchestratePlanOnly({ manifestBytes, artifacts: new Map(), target: stagingTarget, db: { prepare() {} } }),
    { code: "UNKNOWN_INPUT" }
  );
});

test("orchestrator rejects malformed UTF-8 and non-byte manifest input", () => {
  assert.throws(
    () => orchestratePlanOnly({ manifestBytes: "{}", artifacts: new Map(), target: stagingTarget }),
    { code: "INVALID_MANIFEST_BYTES" }
  );
  assert.throws(
    () => orchestratePlanOnly({ manifestBytes: Uint8Array.from([0xff]), artifacts: new Map(), target: stagingTarget }),
    error => error instanceof TypeError
  );
});

test("orchestrator fails closed for a target mismatch and does not return an executable plan", () => {
  assert.throws(
    () => orchestratePlanOnly({
      manifestBytes,
      artifacts: new Map(),
      target: { ...stagingTarget, databaseId: "wrong" }
    }),
    { code: "UNKNOWN_DATABASE_DENIED" }
  );
});
