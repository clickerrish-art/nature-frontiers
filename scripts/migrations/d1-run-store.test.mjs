import test from "node:test";
import assert from "node:assert/strict";
import { D1MigrationRunStore } from "./d1-run-store.mjs";
import { stagingLockTarget } from "./d1-lock-adapter.mjs";
const hash="a".repeat(64), runId="123e4567-e89b-42d3-a456-426614174099";
class Statement {constructor(db,sql,params=[]){this.db=db;this.sql=sql;this.params=params;}bind(...p){return new Statement(this.db,this.sql,p);}async first(){return this.db.row??null;}}
class DB {constructor(results=[]){this.results=results;this.calls=[];}prepare(sql){return new Statement(this,sql);}async batch(s){this.calls.push(s);return this.results.shift()??s.map(()=>({meta:{changes:0}}));}}
const r=n=>({meta:{changes:n}});
test("run store persists a planned record and initial event in one D1 batch",async()=>{
 const db=new DB([[r(1),r(1)]]),store=new D1MigrationRunStore(db);
 assert.deepEqual(await store.create({runId,planSha256:hash,manifestSha256:hash,target:stagingLockTarget,actor:"owner",at:"2026-11-25T12:00:00.000Z"}),{created:true});
 assert.equal(db.calls[0].length,2);assert.match(db.calls[0][0].sql,/'PLANNED',0,NULL/);
});
test("approval is compare-and-swap from PLANNED and requires a reference",async()=>{
 const db=new DB([[r(1),r(1)]]),store=new D1MigrationRunStore(db);
 await assert.rejects(()=>store.approve({runId,actor:"owner",approvalId:""}),{code:"APPROVAL_REQUIRED"});
 assert.equal((await store.approve({runId,actor:"owner",approvalId:"approval-1",at:"2026-11-25T12:01:00.000Z"})).approved,true);
 assert.match(db.calls[0][0].sql,/state='PLANNED'/);
});
test("run creation refuses unknown and production targets",async()=>{
 const db=new DB(),store=new D1MigrationRunStore(db);
 await assert.rejects(()=>store.create({runId,planSha256:hash,manifestSha256:hash,target:{...stagingLockTarget,worker:"nature-frontiers-publisher"},actor:"owner",at:"2026-11-25T12:00:00.000Z"}),{code:"TARGET_DENIED"});
 assert.equal(db.calls.length,0);
});
