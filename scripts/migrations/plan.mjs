#!/usr/bin/env node
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDryRunPlan, parseStrictJson, validateTarget } from "./planner.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const ALLOWED=new Set(["--manifest","--environment","--database-id","--worker"]);
function args(argv){
  const result=Object.create(null);
  for(let i=0;i<argv.length;i++){
    const key=argv[i];
    if(!ALLOWED.has(key)) throw new Error(`Unknown argument: ${key}`);
    if(Object.hasOwn(result,key)) throw new Error(`Duplicate argument: ${key}`);
    if(i+1>=argv.length || argv[i+1].startsWith("--")) throw new Error(`Missing value for ${key}`);
    result[key]=argv[++i];
  }
  return result;
}
function inside(parent,child){const rel=path.relative(parent,child);return rel!=="" && rel!==".." && !rel.startsWith(".."+path.sep) && !path.isAbsolute(rel);}
async function main(){
  const o=args(process.argv.slice(2));
  if(!o["--manifest"]||!o["--environment"]||!o["--database-id"]||!o["--worker"]) throw new Error("Required: --manifest, --environment, --database-id, --worker");
  const target=validateTarget({environment:o["--environment"],databaseId:o["--database-id"],worker:o["--worker"]});
  const manifestPath=path.resolve(ROOT,o["--manifest"]);
  if(!inside(ROOT,manifestPath)) throw new Error("Manifest must be a file inside the repository.");
  const manifestReal=await realpath(manifestPath);
  if(!inside(ROOT,manifestReal)) throw new Error("Manifest symlink resolves outside the repository.");
  const manifestBytes=await readFile(manifestReal);
  const manifest=parseStrictJson(manifestBytes.toString("utf8"));
  const manifestDir=path.dirname(manifestReal), artifacts=new Map();
  for(const entry of manifest.migrations??[]){
    const artifactPath=path.resolve(manifestDir,entry.path);
    if(!inside(manifestDir,artifactPath)) throw new Error(`Artifact path escapes migration directory: ${entry.path}`);
    const artifactReal=await realpath(artifactPath);
    if(!inside(manifestDir,artifactReal)) throw new Error(`Artifact symlink escapes migration directory: ${entry.path}`);
    artifacts.set(entry.path,await readFile(artifactReal));
  }
  const plan=buildDryRunPlan({manifest,artifacts,target,manifestBytes,sourceCommit:process.env.GITHUB_SHA??null});
  process.stdout.write(JSON.stringify(plan,null,2)+"\n");
}
main().catch(error=>{process.stderr.write(`REFUSED: ${error.code? `[${error.code}] `:""}${error.message}\n`);process.exitCode=2;});
