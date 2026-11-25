import test from "node:test";
import assert from "node:assert/strict";
import { D1MigrationLockStore, D1MigrationLockError, sha256Hex, stagingLockTarget, rehearsalLockTarget } from "./d1-lock-adapter.mjs";

const hash="a".repeat(64), owner="b".repeat(64);
const run={runId:"123e4567-e89b-42d3-a456-426614174000",planSha256:hash,manifestSha256:hash,target:stagingLockTarget,state:"APPROVED"};
class FakeStatement {
  constructor(db,sql,params=[]){this.db=db;this.sql=sql;this.params=params;}
  bind(...params){return new FakeStatement(this.db,this.sql,params);}
  async first(){return this.db.row??null;}
  async all(){return {results:[]};}
}
class FakeD1 {
  constructor(results=[]){this.results=results;this.calls=[];this.row=null;}
  prepare(sql){return new FakeStatement(this,sql);}
  async batch(statements){this.calls.push(statements);return this.results.shift()??statements.map(()=>({meta:{changes:0}}));}
}
const result=changes=>({meta:{changes}});

test("owner tokens are SHA-256 hashed and raw token is not returned",async()=>{
  const digest=await sha256Hex("owner-token-for-unit-test-000000000000");
  assert.equal(digest.length,64);
  assert.notEqual(digest,"owner-token-for-unit-test-000000000000");
  await assert.rejects(()=>sha256Hex("short"),{code:"INVALID_OWNER_TOKEN"});
});
test("constructor requires a real D1 binding contract",()=>{
  assert.throws(()=>new D1MigrationLockStore({prepare(){}}),{code:"INVALID_D1_BINDING"});
});
test("acquire is allowlist-only and issues a conditional singleton insert inside D1 batch",async()=>{
  const db=new FakeD1([[result(1),result(1),result(1),result(1)]]);
  db.row={run_id:run.runId,owner_token_hash:owner};
  const store=new D1MigrationLockStore(db);
  const answer=await store.acquire({run,target:stagingLockTarget,ownerTokenHash:owner,actor:"lock-owner",at:"2026-11-25T12:00:00.000Z"});
  assert.equal(answer.acquired,true);
  assert.match(db.calls[0][0].sql,/ON CONFLICT\(lock_key\) DO NOTHING/);
  assert.match(db.calls[0][0].sql,/state='APPROVED'/);
  assert.equal(db.calls[0].length,4);
  assert.match(db.calls[0][3].sql,/SELECT run_id,revision,state,updated_at,\?,reason/);
  await assert.rejects(()=>store.acquire({run,target:{...stagingLockTarget,worker:"nature-frontiers-publisher"},ownerTokenHash:owner,actor:"lock-owner"}),{code:"TARGET_DENIED"});
});
test("owner-only release is conditional on run ID and owner hash",async()=>{
  const db=new FakeD1([[result(0),result(0),result(0),result(0)]]);
  const store=new D1MigrationLockStore(db);
  const out=await store.release({runId:run.runId,ownerTokenHash:owner,actor:"lock-owner",at:"2026-11-25T12:01:00.000Z"});
  assert.equal(out.released,false);
  assert.match(db.calls[0][1].sql,/owner_token_hash=\?/);
  assert.match(db.calls[0][1].sql,/run_id=\?/);
});
test("interruption recovery refuses absent process-termination proof and approval",async()=>{
  const db=new FakeD1(),store=new D1MigrationLockStore(db);
  await assert.rejects(()=>store.recoverStale({runId:run.runId,ownerTokenHash:owner,processTerminationConfirmed:false,approvalId:"incident-1",actor:"recovery-operator"}),{code:"PROCESS_MAY_RESUME"});
  await assert.rejects(()=>store.recoverStale({runId:run.runId,ownerTokenHash:owner,processTerminationConfirmed:true,approvalId:"",actor:"recovery-operator"}),{code:"RECOVERY_APPROVAL_REQUIRED"});
  assert.equal(db.calls.length,0);
});
test("stale recovery is a conditional D1 batch with owner, approval and process proof",async()=>{
  const db=new FakeD1([[result(1),result(1),result(1),result(1),result(1)]]);
  const store=new D1MigrationLockStore(db);
  const out=await store.recoverStale({runId:run.runId,ownerTokenHash:owner,processTerminationConfirmed:true,approvalId:"incident-approval-9",actor:"recovery-operator",at:"2026-11-25T12:02:00.000Z"});
  assert.equal(out.recovered,true);
  assert.equal(db.calls[0].length,5);
  assert.match(db.calls[0][0].sql,/recovery_approval_id=\?/);
  assert.match(db.calls[0][2].sql,/owner_token_hash=\?/);
  assert.match(db.calls[0][2].sql,/recovery_approval_id=\?/);
});
test("no lock statement uses a lease or time-based expiry",()=>{
  const source=String(D1MigrationLockStore.prototype.acquire);
  assert.doesNotMatch(source,/expires_at\s*[<>=]/i);
  assert.match(source,/NULL,NULL/);
});

test("disposable rehearsal target is exact and staging target remains separately pinned",async()=>{
 const db=new FakeD1([[result(1),result(1),result(1),result(1)]]);
 db.row={run_id:run.runId,owner_token_hash:owner};
 const store=new D1MigrationLockStore(db);
 const rehearsalRun={...run,target:rehearsalLockTarget};
 const answer=await store.acquire({run:rehearsalRun,target:rehearsalLockTarget,ownerTokenHash:owner,actor:"lock-owner",at:"2026-11-25T12:04:00.000Z"});
 assert.equal(answer.acquired,true);
 await assert.rejects(()=>store.acquire({run:rehearsalRun,target:{...rehearsalLockTarget,worker:"nature-frontiers-staging"},ownerTokenHash:owner,actor:"lock-owner"}),{code:"TARGET_DENIED"});
});
