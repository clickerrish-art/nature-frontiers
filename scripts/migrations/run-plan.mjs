#!/usr/bin/env node
import { constants as fsConstants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { orchestratePlanOnly } from "./plan-only-runner.mjs";
import { parseStrictJson, stagingTarget } from "./planner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OPTIONS = new Set(["--manifest", "--environment", "--database-id", "--worker"]);

function refuse(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parseArgs(argv) {
  const parsed = Object.create(null);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!OPTIONS.has(key)) refuse("UNKNOWN_ARGUMENT", `Unknown argument: ${key}`);
    if (Object.hasOwn(parsed, key)) refuse("DUPLICATE_ARGUMENT", `Duplicate argument: ${key}`);
    if (!argv[i + 1] || argv[i + 1].startsWith("--")) refuse("MISSING_ARGUMENT_VALUE", `Missing value for ${key}`);
    parsed[key] = argv[++i];
  }
  for (const key of OPTIONS) if (!parsed[key]) refuse("REQUIRED_ARGUMENT", `Required argument: ${key}`);
  return parsed;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/**
 * Open once, reject a symlink at the leaf, then validate the opened inode
 * against its canonical in-root pathname. Bytes are read from that same
 * descriptor, so a later path replacement cannot change the bytes consumed.
 * Intermediate symlinks are permitted only when their resolved target stays
 * inside allowedRoot. Unsupported O_NOFOLLOW platforms fail closed.
 */
async function readContainedFile(requestedPath, allowedRoot) {
  if (typeof fsConstants.O_NOFOLLOW !== "number") {
    refuse("SAFE_OPEN_UNSUPPORTED", "This platform does not support O_NOFOLLOW; refusing filesystem input.");
  }
  const rootRealPath = await realpath(allowedRoot);
  const absolutePath = path.resolve(requestedPath);
  if (!isInside(rootRealPath, absolutePath)) refuse("PATH_ESCAPE", "Requested file is outside its permitted directory.");

  const handle = await open(absolutePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const openedStat = await handle.stat();
    if (!openedStat.isFile()) refuse("NOT_REGULAR_FILE", "Only regular files are accepted.");
    const canonicalPath = await realpath(absolutePath);
    if (!isInside(rootRealPath, canonicalPath)) refuse("SYMLINK_ESCAPE", "Resolved file is outside its permitted directory.");
    const canonicalHandle = await open(canonicalPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    let canonicalStat;
    try { canonicalStat = await canonicalHandle.stat(); } finally { await canonicalHandle.close(); }
    if (openedStat.dev !== canonicalStat.dev || openedStat.ino !== canonicalStat.ino) {
      refuse("PATH_CHANGED_DURING_OPEN", "File path changed while validating the opened descriptor.");
    }
    return { bytes: await handle.readFile(), realPath: canonicalPath };
  } finally {
    await handle.close();
  }
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
    refuse("TARGET_DENIED", "Only the exact pinned staging target is permitted.");
  }

  const rootRealPath = await realpath(ROOT);
  const manifestPath = path.resolve(rootRealPath, options["--manifest"]);
  if (!isInside(rootRealPath, manifestPath)) refuse("MANIFEST_PATH_ESCAPE", "Manifest must be inside the repository.");
  const manifestRead = await readContainedFile(manifestPath, rootRealPath);
  const manifestBytes = manifestRead.bytes;
  const manifest = parseStrictJson(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes));
  const manifestDirectory = path.dirname(manifestRead.realPath);
  const artifacts = new Map();

  if (!Array.isArray(manifest.migrations)) refuse("INVALID_MIGRATIONS", "Manifest migrations must be an array.");
  for (const entry of manifest.migrations) {
    if (typeof entry.path !== "string") refuse("INVALID_ARTIFACT_PATH", "Migration artifact path must be a string.");
    const artifactPath = path.resolve(manifestDirectory, entry.path);
    if (!isInside(manifestDirectory, artifactPath)) refuse("ARTIFACT_PATH_ESCAPE", `Artifact path escapes manifest directory: ${entry.path}`);
    const artifactRead = await readContainedFile(artifactPath, manifestDirectory);
    artifacts.set(entry.path, artifactRead.bytes);
  }

  const result = orchestratePlanOnly({
    manifestBytes,
    artifacts,
    target,
    sourceCommit: process.env.GITHUB_SHA ?? null
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\\n");
}

main().catch(error => {
  process.stderr.write(`REFUSED: ${error.code ? `[${error.code}] ` : ""}${error.message}\\n`);
  process.exitCode = 2;
});
