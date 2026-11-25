import test from "node:test";
import assert from "node:assert/strict";
import { D1MigrationRunStore } from "./d1-run-store.mjs";
import { stagingLockTarget } from "./d1-lock-adapter.mjs";
const hash="a".repeat(64), otherHash="b".repeat(64), runId="123e4567-e89b-42d3-a456-426614174099";
class Statement {constructor(db,sql,params=[]){this.db=db;this.sql=sql;this.params=params;}bind(...p){return new Statement(this.db,this.sql,p);}async first(){return this.db.row??null;}async all(){return {results:this.db.events??[]};}}
class DB {constructor(results=[]){this.results=results;this.calls=[];this.row=null;this.events=[];}prepare(sql){return new Statement(this,sql);}async batch(s){this.calls.push(s);return this.results.shift()??s.map(()=>({meta:{changes:0}}));}}
const r=n=>({meta:{changes:n}});
const base={runId,planSha256:hash,manifestSha256:otherHash,target:stagingLockTarget,actor:"plan-author",at:"2026-11-25T12:00:00.000Z"};
test("run store persists a planned record and initial event atomically",async()=>{
 const db=new DB([[r(1),r(1)]]),store=new D1MigrationRunStore(db);
 assert.deepEqual(await store.create(base),{created:true});
 assert.equal(db.calls[0].length,2);
 assert.match(db.calls[0][0].sql,/'PLANNED',0,NULL/);
 assert.match(db.calls[0][1].sql,/revision=0/);
});
test("approval is compare-and-swap against exact plan and manifest hashes",async()=>{
 const db=new DB([[r(1),r(1)]]),store=new D1MigrationRunStore(db);
 const args={runId,expectedPlanSha256:hash,expectedManifestSha256:otherHash,target:stagingLockTarget,actor:"approver",approvalId:"approval-1",at:"2026-11-25T12:01:00.000Z"};
 assert.equal((await store.approve(args)).approved,true);
 assert.match(db.calls[0][0].sql,/state='PLANNED'/);
 assert.match(db.calls[0][0].sql,/plan_sha256=\?/);
 assert.match(db.calls[0][0].sql,/manifest_sha256=\?/);
 assert.match(db.calls[0][1].sql,/actor/);
});
test("approval refuses missing evidence, wrong target, and malformed hashes before D1",async()=>{
 const db=new DB(),store=new D1MigrationRunStore(db);
 await assert.rejects(()=>store.approve({runId,expectedPlanSha256:hash,expectedManifestSha256:otherHash,target:stagingLockTarget,actor:"owner",approvalId:""}),{code:"APPROVAL_REQUIRED"});
 await assert.rejects(()=>store.approve({runId,expectedPlanSha256:hash,expectedManifestSha256:otherHash,target:{...stagingLockTarget,worker:"wrong"},actor:"owner",approvalId:"approval"}),{code:"TARGET_DENIED"});
 await assert.rejects(()=>store.approve({runId,expectedPlanSha256:"bad",expectedManifestSha256:otherHash,target:stagingLockTarget,actor:"owner",approvalId:"approval"}),{code:"INVALID_HASH"});
 assert.equal(db.calls.length,0);
});
test("stale or mismatched approval is a clean compare-and-swap miss",async()=>{
 const db=new DB([[r(0),r(0)]]),store=new D1MigrationRunStore(db);
 const result=await store.approve({runId,expectedPlanSha256:otherHash,expectedManifestSha256:hash,target:stagingLockTarget,actor:"owner",approvalId:"approval-2",at:"2026-11-25T12:01:00.000Z"});
 assert.deepEqual(result,{approved:false});
});
test("rejection is a durable PLANNED-to-REFUSED compare-and-swap transition",async()=>{
 const db=new DB([[r(1),r(1)]]),store=new D1MigrationRunStore(db);
 const result=await store.reject({runId,expectedPlanSha256:hash,expectedManifestSha256:otherHash,target:stagingLockTarget,actor:"reviewer",reason:"Evidence incomplete",at:"2026-11-25T12:02:00.000Z"});
 assert.deepEqual(result,{rejected:true});
 assert.match(db.calls[0][0].sql,/state='REFUSED'/);
 assert.match(db.calls[0][0].sql,/state='PLANNED'/);
 assert.match(db.calls[0][1].sql,/revision=1/);
});
test("run creation refuses unknown and production targets without writing",async()=>{
 const db=new DB(),store=new D1MigrationRunStore(db);
 await assert.rejects(()=>store.create({...base,target:{...stagingLockTarget,worker:"nature-frontiers-publisher"}}),{code:"TARGET_DENIED"});
 assert.equal(db.calls.length,0);
});
test("event history is ordered by revision and scoped to one run",async()=>{
 const db=new DB(),store=new D1MigrationRunStore(db);
 db.events=[{revision:0,state:"PLANNED"},{revision:1,state:"APPROVED"}];
 const events=await store.listEvents(runId);
 assert.equal(events.length,2);
 assert.match(db.calls?.[0]?.[0]?.sql??"",/ORDER BY revision/);
});
