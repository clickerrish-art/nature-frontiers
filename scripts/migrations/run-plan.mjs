#!/usr/bin/env node
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { orchestratePlanOnly } from "./plan-only-runner.mjs";
import { stagingTarget } from "./planner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OPTIONS = new Set(["--manifest", "--environment", "--database-id", "--worker"]);

function parseArgs(argv) {
  const parsed = Object.create(null);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!OPTIONS.has(key)) throw new Error(`Unknown argument: ${key}`);
    if (Object.hasOwn(parsed, key)) throw new Error(`Duplicate argument: ${key}`);
    if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`Missing value for ${key}`);
    parsed[key] = argv[++i];
  }
  for (const key of OPTIONS) if (!parsed[key]) throw new Error(`Required argument: ${key}`);
  return parsed;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const target = {
    environment: options["--environment"],
    databaseId: options["--database-id"],
    worker: options["--worker"]
  };
  // Reject a wrong target before touching manifest or artifact paths.
  if (JSON.stringify(target) !== JSON.stringify(stagingTarget)) {
    const error = new Error("Only the exact pinned staging target is permitted.");
    error.code = "TARGET_DENIED";
    throw error;
  }
  const manifestPath = path.resolve(ROOT, options["--manifest"]);
  if (!isInside(ROOT, manifestPath)) throw new Error("Manifest must be inside the repository.");
  const manifestRealPath = await realpath(manifestPath);
  if (!isInside(ROOT, manifestRealPath)) throw new Error("Manifest symlink escapes the repository.");
  const manifestBytes = await readFile(manifestRealPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const manifestDirectory = path.dirname(manifestRealPath);
  const artifacts = new Map();

  if (!Array.isArray(manifest.migrations)) throw new Error("Manifest migrations must be an array.");
  for (const entry of manifest.migrations) {
    if (typeof entry.path !== "string") throw new Error("Migration artifact path must be a string.");
    const artifactPath = path.resolve(manifestDirectory, entry.path);
    if (!isInside(manifestDirectory, artifactPath)) throw new Error(`Artifact path escapes manifest directory: ${entry.path}`);
    const artifactRealPath = await realpath(artifactPath);
    if (!isInside(manifestDirectory, artifactRealPath)) throw new Error(`Artifact symlink escapes manifest directory: ${entry.path}`);
    artifacts.set(entry.path, await readFile(artifactRealPath));
  }

  const result = orchestratePlanOnly({
    manifestBytes,
    artifacts,
    target,
    sourceCommit: process.env.GITHUB_SHA ?? null
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main().catch(error => {
  process.stderr.write(`REFUSED: ${error.code ? `[${error.code}] ` : ""}${error.message}\n`);
  process.exitCode = 2;
});
