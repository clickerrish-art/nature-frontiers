import { buildDryRunPlan, parseStrictJson } from "./planner.mjs";

const ALLOWED_KEYS = new Set(["manifestBytes", "artifacts", "target", "sourceCommit", "runnerVersion"]);

function refuse(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

/**
 * Pure orchestration boundary for a migration run.
 *
 * This function accepts bytes already loaded by the caller. It has no D1,
 * network, filesystem, lock-store, Worker, or SQL capability. Its output is
 * deliberately non-executable even when the manifest contains migrations.
 */
export function orchestratePlanOnly(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    refuse("INVALID_INPUT", "Plan-only input must be an object.");
  }
  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.has(key)) refuse("UNKNOWN_INPUT", `Unsupported plan-only input: ${key}`);
  }
  const { manifestBytes, artifacts, target, sourceCommit = null, runnerVersion = "0.1.0" } = input;
  if (!(manifestBytes instanceof Uint8Array)) {
    refuse("INVALID_MANIFEST_BYTES", "manifestBytes must be the exact raw manifest bytes.");
  }
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes);
  const manifest = parseStrictJson(decoded);
  const plan = buildDryRunPlan({
    manifest,
    artifacts,
    target,
    manifestBytes,
    sourceCommit,
    runnerVersion
  });
  return Object.freeze({
    runnerSchemaVersion: 1,
    mode: "PLAN_ONLY",
    executionEnabled: false,
    sideEffects: Object.freeze({
      d1Reads: false,
      d1Writes: false,
      lockAcquired: false,
      sqlExecuted: false,
      workerDeployed: false
    }),
    plan
  });
}
