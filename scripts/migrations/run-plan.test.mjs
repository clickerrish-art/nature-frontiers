import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stagingTarget } from "./planner.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = path.join(REPO_ROOT, "scripts/migrations/run-plan.mjs");
const TEMP_ROOT = mkdtempSync(path.join(REPO_ROOT, ".tmp-plan-cli-"));
const EXTERNAL_ROOT = mkdtempSync(path.join(os.tmpdir(), "nf-plan-cli-external-"));
const TARGET_ARGS = [
  "--environment", stagingTarget.environment,
  "--database-id", stagingTarget.databaseId,
  "--worker", stagingTarget.worker
];

function runCli(args) {
  const env = { ...process.env };
  delete env.GITHUB_SHA;
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 10_000,
    env
  });
}
function writeManifest(name, value) {
  const file = path.join(TEMP_ROOT, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, value);
  return path.relative(REPO_ROOT, file);
}
function manifestObject(migrations = []) {
  return {
    schemaVersion: 1,
    streamId: "nature-frontiers.staging.forward-v1",
    target: { ...stagingTarget },
    migrations
  };
}
function migrationEntry(sql, relativePath = "0001_synthetic_check.sql") {
  return {
    sequence: 1,
    migrationId: "synthetic-check",
    path: relativePath,
    sha256: createHash("sha256").update(sql).digest("hex"),
    byteLength: Buffer.byteLength(sql),
    kind: "sql",
    requires: []
  };
}
function baseArgs(manifestPath) {
  return ["--manifest", manifestPath, ...TARGET_ARGS];
}

test.after(() => {
  rmSync(TEMP_ROOT, { recursive: true, force: true });
  rmSync(EXTERNAL_ROOT, { recursive: true, force: true });
});

test("CLI accepts the pinned empty manifest and emits explicit plan-only JSON", () => {
  const manifestPath = writeManifest("empty/manifest.json", JSON.stringify(manifestObject()));
  const result = runCli(baseArgs(manifestPath));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, "PLAN_ONLY");
  assert.equal(output.executionEnabled, false);
  assert.equal(output.plan.disposition, "NO_MIGRATIONS_DECLARED");
  assert.equal(output.sideEffects.d1Reads, false);
  assert.equal(output.sideEffects.d1Writes, false);
  assert.equal(output.sideEffects.sqlExecuted, false);
});

test("CLI accepts a synthetic non-empty manifest and validates artifact bytes", () => {
  const dir = path.join(TEMP_ROOT, "non-empty");
  mkdirSync(dir, { recursive: true });
  const sql = Buffer.from("-- fixture only\\nSELECT 1;\\n");
  writeFileSync(path.join(dir, "0001_synthetic_check.sql"), sql);
  const manifestPath = writeManifest("non-empty/manifest.json", JSON.stringify(manifestObject([migrationEntry(sql)])));
  const result = runCli(baseArgs(manifestPath));
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.plan.migrations.length, 1);
  assert.equal(output.plan.migrations[0].migrationId, "synthetic-check");
  assert.equal(output.plan.migrations[0].sha256, createHash("sha256").update(sql).digest("hex"));
});

test("CLI rejects unknown, duplicate, missing, and empty arguments with no success output", () => {
  const manifestPath = writeManifest("args/manifest.json", JSON.stringify(manifestObject()));
  const cases = [
    ["--bogus", "x", ...baseArgs(manifestPath)],
    ["--manifest", manifestPath, "--manifest", manifestPath, ...TARGET_ARGS],
    ["--manifest", ...TARGET_ARGS],
    ["--manifest", "", ...TARGET_ARGS]
  ];
  for (const args of cases) {
    const result = runCli(args);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^REFUSED:/);
  }
});

test("CLI rejects the wrong target before attempting to read the manifest", () => {
  const result = runCli([
    "--manifest", "does-not-exist/never-read.json",
    "--environment", "staging",
    "--database-id", "wrong-database",
    "--worker", stagingTarget.worker
  ]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /TARGET_DENIED/);
  assert.doesNotMatch(result.stderr, /ENOENT/);
});

test("CLI rejects manifest path traversal", () => {
  const result = runCli(baseArgs("../outside-manifest.json"));
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /MANIFEST_PATH_ESCAPE/);
});

test("CLI rejects a manifest symlink without reading its external target", () => {
  const external = path.join(EXTERNAL_ROOT, "manifest.json");
  writeFileSync(external, JSON.stringify(manifestObject()));
  const link = path.join(TEMP_ROOT, "manifest-link.json");
  symlinkSync(external, link);
  const result = runCli(baseArgs(path.relative(REPO_ROOT, link)));
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /ELOOP|SYMLINK|REFUSED/);
});

test("CLI rejects artifact path traversal before opening an artifact", () => {
  const manifestPath = writeManifest("artifact-traversal/manifest.json", JSON.stringify(manifestObject([{
    ...migrationEntry(Buffer.from("irrelevant")),
    path: "../outside.sql"
  }])));
  const result = runCli(baseArgs(manifestPath));
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /ARTIFACT_PATH_ESCAPE|PATH_TRAVERSAL/);
});

test("CLI rejects an artifact symlink to an external file", () => {
  const dir = path.join(TEMP_ROOT, "artifact-link");
  mkdirSync(dir, { recursive: true });
  const sql = Buffer.from("SELECT 1;");
  const external = path.join(EXTERNAL_ROOT, "outside.sql");
  writeFileSync(external, sql);
  symlinkSync(external, path.join(dir, "0001_synthetic_check.sql"));
  const manifestPath = writeManifest("artifact-link/manifest.json", JSON.stringify(manifestObject([migrationEntry(sql)])));
  const result = runCli(baseArgs(manifestPath));
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /ELOOP|SYMLINK|REFUSED/);
});

test("CLI rejects duplicate JSON keys before trying to load a referenced artifact", () => {
  const raw = '{"schemaVersion":1,"schemaVersion":1,"streamId":"nature-frontiers.staging.forward-v1","target":' +
    JSON.stringify(stagingTarget) + ',"migrations":[{"path":"missing.sql"}]}';
  const manifestPath = writeManifest("duplicate/manifest.json", raw);
  const result = runCli(baseArgs(manifestPath));
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /DUPLICATE_JSON_KEY/);
  assert.doesNotMatch(result.stderr, /missing.sql|ENOENT/);
});

test("CLI rejects malformed UTF-8 before JSON or artifact processing", () => {
  const file = path.join(TEMP_ROOT, "bad-utf8", "manifest.json");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from([0xff, 0xfe, 0xfd]));
  const result = runCli(baseArgs(path.relative(REPO_ROOT, file)));
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /REFUSED:/);
});

test("CLI rejects missing and checksum-mismatched artifacts without partial JSON", () => {
  const missingPath = writeManifest("missing/manifest.json", JSON.stringify(manifestObject([migrationEntry(Buffer.from("expected"))])));
  const missing = runCli(baseArgs(missingPath));
  assert.equal(missing.status, 2);
  assert.equal(missing.stdout, "");
  assert.match(missing.stderr, /ENOENT/);

  const dir = path.join(TEMP_ROOT, "mismatch");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "0001_synthetic_check.sql"), "different bytes");
  const mismatchPath = writeManifest("mismatch/manifest.json", JSON.stringify(manifestObject([migrationEntry(Buffer.from("expected"))])));
  const mismatch = runCli(baseArgs(mismatchPath));
  assert.equal(mismatch.status, 2);
  assert.equal(mismatch.stdout, "");
  assert.match(mismatch.stderr, /BYTE_LENGTH_MISMATCH|CHECKSUM_MISMATCH/);
});
