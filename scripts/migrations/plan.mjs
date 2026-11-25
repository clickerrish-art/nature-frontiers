#!/usr/bin/env node
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDryRunPlan, parseStrictJson, stagingTarget, validateTarget } from "./planner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function args(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--") || i + 1 >= argv.length || argv[i + 1].startsWith("--")) {
      throw new Error(`Invalid argument near ${key}`);
    }
    if (result[key]) throw new Error(`Duplicate argument: ${key}`);
    result[key] = argv[++i];
  }
  return result;
}

async function main() {
  const options = args(process.argv.slice(2));
  const manifestArg = options["--manifest"];
  const environment = options["--environment"];
  const databaseId = options["--database-id"];
  const worker = options["--worker"];
  if (!manifestArg || !environment || !databaseId || !worker) {
    throw new Error("Usage: node scripts/migrations/plan.mjs --manifest <repo-relative-path> --environment staging --database-id <staging-id> --worker nature-frontiers-staging");
  }

  // Refuse unsafe targets before opening manifest or artifact paths.
  const target = validateTarget({ environment, databaseId, worker });
  const manifestPath = path.resolve(ROOT, manifestArg);
  const relativeManifest = path.relative(ROOT, manifestPath);
  if (relativeManifest.startsWith("..") || path.isAbsolute(relativeManifest)) throw new Error("Manifest path must remain inside the repository.");
  const manifestReal = await realpath(manifestPath);
  if (!manifestReal.startsWith(ROOT + path.sep)) throw new Error("Manifest symlink resolves outside the repository.");
  const manifestBytes = await readFile(manifestReal);
  const manifest = parseStrictJson(manifestBytes.toString("utf8"));
  const manifestDir = path.dirname(manifestReal);
  const artifacts = new Map();

  for (const entry of manifest.migrations ?? []) {
    const artifactPath = path.resolve(manifestDir, entry.path);
    const relativeArtifact = path.relative(manifestDir, artifactPath);
    if (relativeArtifact.startsWith("..") || path.isAbsolute(relativeArtifact)) throw new Error(`Artifact path escapes migration directory: ${entry.path}`);
    const artifactReal = await realpath(artifactPath);
    if (!artifactReal.startsWith(manifestDir + path.sep)) throw new Error(`Artifact symlink escapes migration directory: ${entry.path}`);
    artifacts.set(entry.path, await readFile(artifactReal));
  }

  const plan = buildDryRunPlan({
    manifest,
    artifacts,
    target,
    manifestBytes,
    sourceCommit: process.env.GITHUB_SHA ?? null
  });
  process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
}

main().catch(error => {
  process.stderr.write(`REFUSED: ${error.code ? `[${error.code}] ` : ""}${error.message}\n`);
  process.exitCode = 2;
});
