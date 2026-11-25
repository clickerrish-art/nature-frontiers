import { createHash } from "node:crypto";
import path from "node:path";

const STAGING_DATABASE_ID = "89be73af-ebaf-4c19-b75a-9871adb8ba3c";
const STAGING_WORKER = "nature-frontiers-staging";
const REHEARSAL_DATABASE_ID = "a12fb838-1bd1-4811-9cf1-2ad5b21089d4";
const REHEARSAL_WORKER = "nf-adapter-worker-rehearsal";
const ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const MANIFEST_KEYS = new Set(["schemaVersion", "streamId", "target", "migrations"]);
const TARGET_KEYS = new Set(["environment", "databaseId", "worker"]);
const MIGRATION_KEYS = new Set(["sequence", "migrationId", "path", "sha256", "byteLength", "kind", "requires"]);

export class MigrationPlanError extends Error {
  constructor(code, message) { super(message); this.name = "MigrationPlanError"; this.code = code; }
}
function fail(code, message) { throw new MigrationPlanError(code, message); }
function isPlainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function rejectUnknownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail("UNKNOWN_FIELD", `Unknown ${label} field: ${key}`);
}
function isBytes(value) { return value instanceof Uint8Array; }

/** Strict JSON grammar parser with duplicate-key rejection before JSON.parse. */
export function parseStrictJson(source) {
  if (typeof source !== "string") fail("INVALID_JSON", "JSON source must be a string.");
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
      if (c === "\\") { if (i >= source.length) fail("INVALID_JSON", "Unterminated JSON escape."); i++; }
      else if (c.charCodeAt(0) < 0x20) fail("INVALID_JSON", "Unescaped control character in JSON string.");
    }
    fail("INVALID_JSON", "Unterminated JSON string.");
  };
  const value = () => {
    ws();
    const c = source[i];
    if (c === "{") {
      i++; ws(); const keys = new Set();
      if (source[i] === "}") { i++; return; }
      while (i < source.length) {
        ws(); if (source[i] !== '"') fail("INVALID_JSON", "Object key must be a string.");
        const key = stringToken();
        if (keys.has(key)) fail("DUPLICATE_JSON_KEY", `Duplicate JSON object key: ${key}`);
        keys.add(key); ws();
        if (source[i++] !== ":") fail("INVALID_JSON", "Expected colon after object key.");
        value(); ws();
        if (source[i] === "}") { i++; return; }
        if (source[i++] !== ",") fail("INVALID_JSON", "Expected comma in object.");
      }
      fail("INVALID_JSON", "Unterminated JSON object.");
    }
    if (c === "[") {
      i++; ws(); if (source[i] === "]") { i++; return; }
      while (i < source.length) {
        value(); ws();
        if (source[i] === "]") { i++; return; }
        if (source[i++] !== ",") fail("INVALID_JSON", "Expected comma in array.");
      }
      fail("INVALID_JSON", "Unterminated JSON array.");
    }
    if (c === '"') { stringToken(); return; }
    const primitive = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(i));
    if (!primitive) fail("INVALID_JSON", `Unexpected token at character offset ${i}.`);
    i += primitive[0].length;
  };
  value(); ws();
  if (i !== source.length) fail("INVALID_JSON", "Unexpected trailing JSON content.");
  try { return JSON.parse(source); } catch { fail("INVALID_JSON", "Manifest is not valid JSON."); }
}

export function validateTarget(target) {
  if (!isPlainObject(target)) fail("INVALID_TARGET", "Target must be an object.");
  rejectUnknownKeys(target, TARGET_KEYS, "target");
  if (target.environment !== "staging" && target.environment !== "rehearsal") fail("TARGET_ENVIRONMENT_DENIED", "Only staging or the explicitly isolated rehearsal environment is permitted.");
  if (target.databaseId === "nature-frontiers-prod-state" || target.worker === "nature-frontiers-publisher") {
    fail("PRODUCTION_TARGET_DENIED", "Production resources are explicitly denied.");
  }
  const staging = target.environment === "staging" && target.databaseId === STAGING_DATABASE_ID && target.worker === STAGING_WORKER;
  const rehearsal = target.environment === "rehearsal" && target.databaseId === REHEARSAL_DATABASE_ID && target.worker === REHEARSAL_WORKER;
  if (!staging && !rehearsal) fail("UNKNOWN_TARGET_DENIED", "Target must exactly match the pinned staging pair or isolated disposable rehearsal pair.");
  return { environment: target.environment, databaseId: target.databaseId, worker: target.worker };
}

function validateManifest(manifest) {
  if (!isPlainObject(manifest)) fail("INVALID_MANIFEST", "Manifest root must be an object.");
  rejectUnknownKeys(manifest, MANIFEST_KEYS, "manifest");
  if (manifest.schemaVersion !== 1) fail("UNSUPPORTED_MANIFEST_VERSION", "Only manifest schemaVersion 1 is supported.");
  if (typeof manifest.streamId !== "string" || !ID_PATTERN.test(manifest.streamId)) fail("INVALID_STREAM_ID", "streamId must be a canonical lowercase identifier.");
  if (!isPlainObject(manifest.target)) fail("INVALID_TARGET", "Manifest target must be an object.");
  rejectUnknownKeys(manifest.target, TARGET_KEYS, "target");
  if (!Array.isArray(manifest.migrations)) fail("INVALID_MIGRATIONS", "migrations must be an array.");

  const ids = new Set(), paths = new Set(), sequences = new Set();
  for (const item of manifest.migrations) {
    if (!isPlainObject(item)) fail("INVALID_MIGRATION", "Each migration entry must be an object.");
    rejectUnknownKeys(item, MIGRATION_KEYS, "migration");
    if (!Number.isSafeInteger(item.sequence) || item.sequence < 1) fail("INVALID_SEQUENCE", "Migration sequence must be a positive safe integer.");
    if (sequences.has(item.sequence)) fail("DUPLICATE_SEQUENCE", `Duplicate sequence: ${item.sequence}`);
    sequences.add(item.sequence);
    if (typeof item.migrationId !== "string" || !ID_PATTERN.test(item.migrationId)) fail("INVALID_MIGRATION_ID", "migrationId is not canonical.");
    if (ids.has(item.migrationId)) fail("DUPLICATE_MIGRATION_ID", `Duplicate migrationId: ${item.migrationId}`);
    ids.add(item.migrationId);
    if (typeof item.path !== "string" || !item.path || item.path.includes("\\") || path.posix.isAbsolute(item.path)) fail("INVALID_MIGRATION_PATH", "Migration path must be a non-empty relative POSIX path.");
    if (item.path.split("/").some(part => !part || part === "." || part === "..")) fail("PATH_TRAVERSAL", "Migration path contains an unsafe segment.");
    if (!item.path.endsWith(".sql")) fail("INVALID_MIGRATION_PATH", "Only .sql migration artifacts are accepted.");
    if (paths.has(item.path)) fail("DUPLICATE_MIGRATION_PATH", `Duplicate migration path: ${item.path}`);
    paths.add(item.path);
    if (item.kind !== "sql") fail("UNSUPPORTED_MIGRATION_KIND", "Only kind=sql is supported.");
    if (typeof item.sha256 !== "string" || !SHA256_PATTERN.test(item.sha256)) fail("INVALID_CHECKSUM", `Invalid SHA-256 for ${item.migrationId}.`);
    if (!Number.isSafeInteger(item.byteLength) || item.byteLength < 0) fail("INVALID_BYTE_LENGTH", "byteLength must be a non-negative safe integer.");
    if (item.requires !== undefined) {
      if (!Array.isArray(item.requires) || item.requires.some(x => typeof x !== "string" || !ID_PATTERN.test(x))) fail("INVALID_DEPENDENCIES", "requires must contain canonical migration IDs.");
      if (new Set(item.requires).size !== item.requires.length) fail("DUPLICATE_DEPENDENCY", `Duplicate dependency in ${item.migrationId}.`);
    }
  }
  const ordered = [...manifest.migrations].sort((a, b) => a.sequence - b.sequence);
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

export function buildDryRunPlan({ manifest, artifacts, target, manifestBytes, sourceCommit = null, runnerVersion = "0.1.0" }) {
  const safeTarget = validateTarget(target);
  if (manifest?.target?.environment !== safeTarget.environment || manifest?.target?.databaseId !== safeTarget.databaseId || manifest?.target?.worker !== safeTarget.worker) {
    fail("MANIFEST_TARGET_MISMATCH", "Manifest target does not exactly match the allowlisted CLI target.");
  }
  if (!isBytes(manifestBytes)) fail("INVALID_MANIFEST_BYTES", "manifestBytes must be the exact raw manifest bytes as a Uint8Array.");
  if (sourceCommit !== null && (typeof sourceCommit !== "string" || !COMMIT_PATTERN.test(sourceCommit))) fail("INVALID_SOURCE_COMMIT", "sourceCommit must be a full lowercase Git SHA or null.");
  if (typeof runnerVersion !== "string" || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/.test(runnerVersion)) fail("INVALID_RUNNER_VERSION", "runnerVersion must be a canonical semantic version.");
  const ordered = validateManifest(manifest);
  const artifactMap = artifacts instanceof Map ? artifacts : new Map(Object.entries(artifacts ?? {}));
  const expectedPaths = new Set(ordered.map(item => item.path));
  for (const suppliedPath of artifactMap.keys()) if (!expectedPaths.has(suppliedPath)) fail("UNREFERENCED_ARTIFACT", `Artifact supplied but not declared in manifest: ${suppliedPath}`);
  const migrations = ordered.map(item => {
    const bytes = artifactMap.get(item.path);
    if (!isBytes(bytes)) fail("MISSING_ARTIFACT", `Artifact bytes unavailable: ${item.path}`);
    if (bytes.byteLength !== item.byteLength) fail("BYTE_LENGTH_MISMATCH", `Byte length mismatch: ${item.path}`);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== item.sha256) fail("CHECKSUM_MISMATCH", `SHA-256 mismatch: ${item.path}`);
    return { sequence:item.sequence, migrationId:item.migrationId, path:item.path, sha256, byteLength:bytes.byteLength, kind:item.kind, requires:[...(item.requires ?? [])], status:"PENDING_LEDGER_NOT_INSPECTED" };
  });
  const rawManifest = Buffer.from(manifestBytes);
  const parsedFromBytes = parseStrictJson(rawManifest.toString("utf8"));
  if (JSON.stringify(parsedFromBytes) !== JSON.stringify(manifest)) fail("MANIFEST_BYTES_OBJECT_MISMATCH", "Parsed raw manifest bytes do not match the supplied manifest object.");
  const manifestSha256 = createHash("sha256").update(rawManifest).digest("hex");
  const body = {
    planSchemaVersion:1, mode:"READ_ONLY_DRY_RUN", executionEnabled:false, target:safeTarget,
    streamId:manifest.streamId, sourceCommit, runnerVersion, manifestSha256, migrations,
    databaseState:"NOT_INSPECTED_NO_D1_CONNECTION", ledgerState:"NOT_INSPECTED_NO_D1_CONNECTION",
    schemaFingerprint:null, note:"No D1 connection, lock acquisition, ledger inspection, or SQL execution occurs."
  };
  const planSha256 = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return { ...body, planSha256, disposition:migrations.length ? "PLAN_ONLY_NOT_EXECUTABLE" : "NO_MIGRATIONS_DECLARED" };
}
export const stagingTarget = Object.freeze({ environment:"staging", databaseId:STAGING_DATABASE_ID, worker:STAGING_WORKER });
export const rehearsalTarget = Object.freeze({ environment:"rehearsal", databaseId:REHEARSAL_DATABASE_ID, worker:REHEARSAL_WORKER });
