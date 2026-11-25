import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildDryRunPlan, parseStrictJson, stagingTarget, rehearsalTarget } from "./planner.mjs";

const bytes=Buffer.from("CREATE TABLE example (id INTEGER PRIMARY KEY);\n");
const sha256=createHash("sha256").update(bytes).digest("hex");
const entry={sequence:1,migrationId:"forward.example-001",path:"001_example.sql",sha256,byteLength:bytes.length,kind:"sql",requires:[]};
const manifest=(migrations=[entry])=>({schemaVersion:1,streamId:"nature-frontiers.staging.forward-v1",target:{...stagingTarget},migrations});
const raw=m=>Buffer.from(JSON.stringify(m));
const plan=(m=manifest(),artifacts=new Map([["001_example.sql",bytes]]),target=stagingTarget,manifestBytes=raw(m))=>buildDryRunPlan({manifest:m,artifacts,target,manifestBytes,sourceCommit:"a".repeat(40)});

test("strict parser rejects duplicate object keys and malformed JSON",()=>{
  assert.throws(()=>parseStrictJson('{"x":1,"x":2}'),{code:"DUPLICATE_JSON_KEY"});
  assert.throws(()=>parseStrictJson('{"x":01}'),{code:"INVALID_JSON"});
});
test("manifest order is deterministic by explicit sequence, not filename or input order",()=>{
  const b=Buffer.from("CREATE TABLE second (id INTEGER);");
  const second={sequence:2,migrationId:"forward.example-002",path:"000_second.sql",sha256:createHash("sha256").update(b).digest("hex"),byteLength:b.length,kind:"sql"};
  const p=plan(manifest([second,entry]),new Map([[entry.path,bytes],[second.path,b]]));
  assert.deepEqual(p.migrations.map(x=>x.migrationId),[entry.migrationId,second.migrationId]);
  assert.equal(plan().planSha256,plan().planSha256);
});
test("rejects duplicate/gapped sequence, ID, path and dependency",()=>{
  assert.throws(()=>plan(manifest([entry,{...entry,migrationId:"forward.example-002",path:"002.sql"}])),{code:"DUPLICATE_SEQUENCE"});
  assert.throws(()=>plan(manifest([{...entry,sequence:2}])),{code:"SEQUENCE_GAP"});
  assert.throws(()=>plan(manifest([{...entry,requires:["forward.example-001","forward.example-001"]}])),{code:"DUPLICATE_DEPENDENCY"});
});
test("rejects unknown keys at every manifest level",()=>{
  assert.throws(()=>plan({...manifest(),surprise:true}),{code:"UNKNOWN_FIELD"});
  assert.throws(()=>plan(manifest(),new Map([[entry.path,bytes]]),{...stagingTarget,extra:"no"}),{code:"UNKNOWN_FIELD"});
  assert.throws(()=>plan(manifest([{...entry,unexpected:"no"}])),{code:"UNKNOWN_FIELD"});
});
test("verifies exact bytes, length, manifest bytes and declared artifact set",()=>{
  assert.throws(()=>plan(manifest(),new Map([[entry.path,Buffer.from("tampered")]])),{code:"BYTE_LENGTH_MISMATCH"});
  assert.throws(()=>plan(manifest(),new Map([[entry.path,bytes]]),stagingTarget,Buffer.from("{}")),{code:"MANIFEST_BYTES_OBJECT_MISMATCH"});
  assert.throws(()=>plan(manifest(),new Map([[entry.path,bytes],["extra.sql",bytes]])),{code:"UNREFERENCED_ARTIFACT"});
});
test("rejects unsafe targets, path traversal and missing dependencies",()=>{
  assert.throws(()=>plan(manifest(),new Map([[entry.path,bytes]]),{...stagingTarget,databaseId:"wrong"}),{code:"UNKNOWN_TARGET_DENIED"});
  assert.throws(()=>plan(manifest([{...entry,path:"../escape.sql"}])),{code:"PATH_TRAVERSAL"});
  assert.throws(()=>plan(manifest([{...entry,requires:["forward.missing"]}])),{code:"MISSING_DEPENDENCY"});
});
test("empty manifest is not schema or ledger verification",()=>{
  const p=plan(manifest([]),new Map());
  assert.equal(p.disposition,"NO_MIGRATIONS_DECLARED");
  assert.equal(p.databaseState,"NOT_INSPECTED_NO_D1_CONNECTION");
  assert.equal(p.schemaFingerprint,null);
});

test("planner accepts only the exact isolated rehearsal pair in addition to staging",()=>{
 const target={...rehearsalTarget};
 const m={...manifest([]),target};
 const p=plan(m,new Map(),target,raw(m));
 assert.equal(p.target.environment,"rehearsal");
 assert.throws(()=>plan(m,new Map(),{...target,worker:stagingTarget.worker},raw(m)),{code:"UNKNOWN_TARGET_DENIED"});
});
