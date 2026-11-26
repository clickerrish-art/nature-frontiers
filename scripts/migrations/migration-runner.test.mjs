import test from "node:test";
import assert from "node:assert/strict";
import { MigrationRunLifecycle } from "./migration-runner.mjs";
import { rehearsalLockTarget } from "./d1-lock-adapter.mjs";

const runId="123e4567-e89b-42d3-a456-426614174099";
const ownerToken="job4b-owner-token-0123456789abcdef0123456789abcdef";
const manifest= new TextEncoder().encode(JSON.stringify({
  schemaVersion:1,streamId:"nf.job4b.rehearsal",target:rehearsalLockTarget,migrations:[]
}));
class RunStore {
  constructor(){this.run=null;this.events=[];}
  async create(a){this.run={runId:a.runId,planSha256:a.planSha256,manifestSha256:a.manifestSha256,target:a.target,state:"PLANNED",revision:0,actor:a.actor};this.events=[{revision:0,state:"PLANNED",actor:a.actor}];return {created:true};}
  async approve(a){if(this.run?.state!=="PLANNED"||this.run.planSha256!==a.expectedPlanSha256||this.run.manifestSha256!==a.expectedManifestSha256)return {approved:false};this.run={...this.run,state:"APPROVED",revision:1,approvalId:a.approvalId};this.events.push({revision:1,state:"APPROVED",actor:a.actor,approvalId:a.approvalId});return {approved:true};}
  async reject(a){if(this.run?.state!=="PLANNED")return {rejected:false};this.run={...this.run,state:"REFUSED",revision:1};this.events.push({revision:1,state:"REFUSED",actor:a.actor});return {rejected:true};}
  async get(){return this.run;}
  async listEvents(){return this.events;}
}
class LockStore {
  constructor(runStore){this.runStore=runStore;this.lock=null;this.events=[];}
  async read(){return this.lock;}
  async listEvents(){return this.events;}
  async recoverStale(){return {recovered:false};}
  async acquire(a){if(this.runStore.run.state!=="APPROVED")return {acquired:false};if(this.lock)return {acquired:false,alreadyOwned:false};this.lock={run_id:a.run.runId,owner_token_hash:a.ownerTokenHash};this.runStore.run={...this.runStore.run,state:"LOCKED",revision:2};this.events.push({event_type:"ACQUIRED",owner_token_hash:a.ownerTokenHash});this.runStore.events.push({revision:2,state:"LOCKED",actor:a.actor});return {acquired:true};}
  async release(a){if(this.lock?.run_id!==a.runId||this.lock.owner_token_hash!==a.ownerTokenHash)return {released:false};this.lock=null;this.runStore.run={...this.runStore.run,state:"RELEASED",revision:3};this.events.push({event_type:"RELEASED",owner_token_hash:a.ownerTokenHash});this.runStore.events.push({revision:3,state:"RELEASED",actor:a.actor});return {released:true};}
}
function setup(){const runStore=new RunStore();const lockStore=new LockStore(runStore);return {runStore,lockStore,runner:new MigrationRunLifecycle({runStore,lockStore,target:rehearsalLockTarget})};}

test("plan remains non-executable and advertises no DDL or deployment capability",()=>{
 const {runner}=setup();const result=runner.plan({manifestBytes:manifest,artifacts:new Map()});
 assert.equal(result.mode,"PLAN_ONLY");assert.equal(result.executionEnabled,false);
 assert.equal(result.sideEffects.sqlExecuted,false);assert.equal(runner.capabilities.ddlExecution,false);
 assert.equal(typeof runner.execute,"undefined");
});

test("approval gates lock acquisition; lifecycle persists planner, approver and owner events",async()=>{
 const {runner,runStore,lockStore}=setup();
 const planResult=runner.plan({manifestBytes:manifest,artifacts:new Map()});
 const created=await runner.recordPlan({planResult,runId,actor:"job4b-planner",at:"2026-11-25T12:00:00.000Z"});
 assert.equal(created.run.state,"PLANNED");
 await assert.rejects(()=>runner.acquire({runId,ownerToken,actor:"job4b-owner"}),{code:"RUN_NOT_APPROVED"});
 const approved=await runner.approve({runId,expectedPlanSha256:planResult.plan.planSha256,expectedManifestSha256:planResult.plan.manifestSha256,actor:"job4b-approver",approvalId:"job4b-approval",at:"2026-11-25T12:01:00.000Z"});
 assert.equal(approved.run.state,"APPROVED");
 const acquired=await runner.acquire({runId,ownerToken,actor:"job4b-lock-owner",at:"2026-11-25T12:02:00.000Z"});
 assert.equal(acquired.run.state,"LOCKED");assert.equal(acquired.lock.run_id,runId);
 const wrong=await runner.release({runId,ownerToken:"wrong-owner-token-0123456789abcdef0123456789abcdef",actor:"intruder",at:"2026-11-25T12:03:00.000Z"});
 assert.equal(wrong.released,false);assert.equal(wrong.lock.run_id,runId);
 const released=await runner.release({runId,ownerToken,actor:"job4b-lock-owner",at:"2026-11-25T12:04:00.000Z"});
 assert.equal(released.released,true);assert.equal(released.run.state,"RELEASED");
 assert.deepEqual(runStore.events.map(e=>e.state),["PLANNED","APPROVED","LOCKED","RELEASED"]);
 assert.deepEqual(lockStore.events.map(e=>e.event_type),["ACQUIRED","RELEASED"]);
 assert.equal(lockStore.lock,null);
});

test("runner target cannot mix rehearsal and staging identities",()=>{
 const {runStore,lockStore}=setup();
 assert.throws(()=>new MigrationRunLifecycle({runStore,lockStore,target:{...rehearsalLockTarget,worker:"nature-frontiers-staging"}}),{code:"TARGET_DENIED"});
});
