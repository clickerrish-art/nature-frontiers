import { createHash } from "node:crypto";
import path from "node:path";

const STAGING_DATABASE_ID = "89be73af-ebaf-4c19-b75a-9871adb8ba3c";
const STAGING_WORKER = "nature-frontiers-staging";
const PRODUCTION_DATABASE_NAMES = new Set(["nature-frontiers-prod-state"]);
const PRODUCTION_WORKER_NAMES = new Set(["nature-frontiers-publisher"]);
const ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export class MigrationPlanError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MigrationPlanError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new MigrationPlanError(code, message);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Validate JSON grammar and reject duplicate object keys before JSON.parse. */
export function parseStrictJson(source) {
  let i = 0;
  const ws = () => { while (/[\t\n\r ]/.test(source[i] ?? "")) i++; };
  const stringToken = () => {
    const start = i;
    if (source[i++] !== '"') fail("INVALID_JSON", "Expected JSON string.");
    while (i < source.length) {
      const c = source[i++];
      if (c === '"') {
        try { return JSON.parse(source.slice(start, i)); }
        catch { fail("INVALID_JSON", "Invalid JSON string escape."); }
      }
      if (c === "\\") {
        if (i >= source.length) fail("INVALID_JSON", "Unterminated JSON escape.");
        i++;
      } else if (c.charCodeAt(0) < 0x20) {
        fail("INVALID_JSON", "Unescaped control character in JSON string.");
      }
    }
    fail("INVALID_JSON", "Unterminated JSON string.");
  };
  const value = () => {
    ws();
    const c = source[i];
    if (c === "{") {
      i++;
      ws();
      const keys = new Set();
      if (source[i] === "}") { i++; return; }
      while (i < source.length) {
        ws();
        if (source[i] !== '"') fail("INVALID_JSON", "Object key must be a string.");
        const key = stringToken();
        if (keys.has(key)) fail("DUPLICATE_JSON_KEY", `Duplicate JSON object key: ${key}`);
        keys.add(key);
        ws();
        if (source[i++] !== ":") fail("INVALID_JSON", "Expected colon after object key.");
        value();
        ws();
        if (source[i] === "}") { i++; return; }
        if (source[i++] !== ",") fail("INVALID_JSON", "Expected comma in object.");
      }
      fail("INVALID_JSON", "Unterminated JSON object.");
    }
    if (c === "[") {
      i++;
      ws();
      if (source[i] === "]") { i++; return; }
      while (i < source.length) {
        value();
        ws();
        if (source[i] === "]") { i++; return; }
        if (source[i++] !== ",") fail("INVALID_JSON", "Expected comma in array.");
      }
      fail("INVALID_JSON", "Unterminated JSON array.");
    }
    if (c === '"') { stringToken(); return; }
    const rest = source.slice(i);
    const primitive = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(rest);
    if (!primitive) fail("INVALID_JSON", `Unexpected token at byte offset ${i}.`);
    i += primitive[0].length;
  };
  value();
  ws();
  if (i !== source.length) fail("INVALID_JSON", "Unexpected trailing JSON content.");
  try { return JSON.parse(source); }
  catch { fail("INVALID_JSON", "Manifest is not valid JSON."); }
}

export function validateTarget({ environment, databaseId, worker }) {
  if (environment !== "staging") fail("TARGET_ENVIRONMENT_DENIED", "Only the staging environment is permitted.");
  if (PRODUCTION_DATABASE_NAMES.has(databaseId) || PRODUCTION_WORKER_NAMES.has(worker)) {
    fail("PRODUCTION_TARGET_DENIED", "Production resources are explicitly denied.");
  }
  if (databaseId !== STAGING_DATABASE_ID) {
    fail("UNKNOWN_DATABASE_DENIED", "Database ID does not match the pinned staging D1 allowlist.");
  }
  if (worker !== STAGING_WORKER) {
    fail("UNKNOWN_WORKER_DENIED", "Worker name does not match the pinned staging Worker allowlist.");
  }
  return { environment, databaseId, worker };
}

function validateManifest(manifest) {
  if (!isPlainObject(manifest)) fail("INVALID_MANIFEST", "Manifest root must be an object.");
  if (manifest.schemaVersion !== 1) fail("UNSUPPORTED_MANIFEST_VERSION", "Only manifest schemaVersion 1 is supported.");
  if (typeof manifest.streamId !== "string" || !ID_PATTERN.test(manifest.streamId)) {
    fail("INVALID_STREAM_ID", "streamId must be a canonical lowercase identifier.");
  }
  if (!isPlainObject(manifest.target)) fail("INVALID_TARGET", "Manifest target must be an object.");
  if (!Array.isArray(manifest.migrations)) fail("INVALID_MIGRATIONS", "migrations must be an array.");

  const ids = new Set();
  const paths = new Set();
  const sequences = new Set();
  for (const item of manifest.migrations) {
    if (!isPlainObject(item)) fail("INVALID_MIGRATION", "Each migration entry must be an object.");
    if (!Number.isSafeInteger(item.sequence) || item.sequence < 1) fail("INVALID_SEQUENCE", "Migration sequence must be a positive safe integer.");
    if (sequences.has(item.sequence)) fail("DUPLICATE_SEQUENCE", `Duplicate sequence: ${item.sequence}`);
    sequences.add(item.sequence);
    if (typeof item.migrationId !== "string" || !ID_PATTERN.test(item.migrationId)) fail("INVALID_MIGRATION_ID", "migrationId is not canonical.");
    if (ids.has(item.migrationId)) fail("DUPLICATE_MIGRATION_ID", `Duplicate migrationId: ${item.migrationId}`);
    ids.add(item.migrationId);
    if (typeof item.path !== "string" || item.path.length === 0 || item.path.includes("\\") || path.posix.isAbsolute(item.path)) {
      fail("INVALID_MIGRATION_PATH", "Migration path must be a non-empty relative POSIX path.");
    }
    const segments = item.path.split("/");
    if (segments.some(segment => !segment || segment === "." || segment === "..")) fail("PATH_TRAVERSAL", "Migration path contains an unsafe segment.");
    if (!item.path.endsWith(".sql")) fail("INVALID_MIGRATION_PATH", "Only .sql migration artifacts are accepted.");
    if (paths.has(item.path)) fail("DUPLICATE_MIGRATION_PATH", `Duplicate migration path: ${item.path}`);
    paths.add(item.path);
    if (item.kind !== "sql") fail("UNSUPPORTED_MIGRATION_KIND", "Only kind=sql is supported by the planner.");
    if (!SHA256_PATTERN.test(item.sha256 ?? "")) fail("INVALID_CHECKSUM", `Invalid SHA-256 for ${item.migrationId}.`);
    if (!Number.isSafeInteger(item.byteLength) || item.byteLength < 0) fail("INVALID_BYTE_LENGTH", "byteLength must be a non-negative safe integer.");
    if (item.requires !== undefined && (!Array.isArray(item.requires) || item.requires.some(x => typeof x !== "string"))) {
      fail("INVALID_DEPENDENCIES", "requires must be an array of migration IDs.");
    }
  }

  const ordered = [...manifest.migrations].sort((a, b) => a.sequence - b.sequence || a.migrationId.localeCompare(b.migrationId));
  ordered.forEach((item, index) => {
    if (item.sequence !== index + 1) fail("SEQUENCE_GAP", "Migration sequences must be contiguous starting at 1.");
    for (const dependency of item.requires ?? []) {
      const dep = ordered.find(candidate => candidate.migrationId === dependency);
      if (!dep) fail("MISSING_DEPENDENCY", `Missing dependency ${dependency} required by ${item.migrationId}.`);
      if (dep.sequence >= item.sequence) fail("DEPENDENCY_ORDER", `Dependency ${dependency} must precede ${item.migrationId}.`);
    }
  });
  return ordered;
}

export function buildDryRunPlan({ manifest, artifacts, target, manifestBytes, sourceCommit, runnerVersion = "0.1.0" }) {
  const safeTarget = validateTarget(target);
  if (manifest.target?.environment !== safeTarget.environment ||
      manifest.target?.databaseId !== safeTarget.databaseId ||
      manifest.target?.worker !== safeTarget.worker) {
    fail("MANIFEST_TARGET_MISMATCH", "Manifest target does not exactly match the allowlisted CLI target.");
  }
  const ordered = validateManifest(manifest);
  const artifactMap = artifacts instanceof Map ? artifacts : new Map(Object.entries(artifacts ?? {}));
  const migrations = ordered.map(item => {
    const bytes = artifactMap.get(item.path);
    if (!(bytes instanceof Uint8Array)) fail("MISSING_ARTIFACT", `Artifact bytes unavailable: ${item.path}`);
    if (bytes.byteLength !== item.byteLength) fail("BYTE_LENGTH_MISMATCH", `Byte length mismatch: ${item.path}`);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== item.sha256) fail("CHECKSUM_MISMATCH", `SHA-256 mismatch: ${item.path}`);
    return {
      sequence: item.sequence,
      migrationId: item.migrationId,
      path: item.path,
      sha256,
      byteLength: bytes.byteLength,
      kind: item.kind,
      requires: [...(item.requires ?? [])],
      status: "PENDING_LEDGER_NOT_INSPECTED"
    };
  });

  const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
  const body = {
    planSchemaVersion: 1,
    mode: "READ_ONLY_DRY_RUN",
    executionEnabled: false,
    target: safeTarget,
    streamId: manifest.streamId,
    sourceCommit: sourceCommit ?? null,
    runnerVersion,
    manifestSha256,
    migrations,
    databaseState: "NOT_INSPECTED_NO_D1_CONNECTION",
    ledgerState: "NOT_INSPECTED_NO_D1_CONNECTION",
    schemaFingerprint: null,
    note: "This planner does not connect to D1, acquire locks, inspect a ledger, or execute SQL."
  };
  const planSha256 = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return { ...body, planSha256, disposition: migrations.length ? "PLAN_ONLY_NOT_EXECUTABLE" : "NO_MIGRATIONS_DECLARED" };
}

export const stagingTarget = Object.freeze({
  environment: "staging",
  databaseId: STAGING_DATABASE_ID,
  worker: STAGING_WORKER
});
