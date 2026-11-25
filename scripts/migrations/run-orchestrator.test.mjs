import test from "node:test";
import assert from "node:assert/strict";
import { D1MigrationRunOrchestrator } from "./run-orchestrator.mjs";
import { orchestratePlanOnly } from "./plan-only-runner.mjs";
import { stagingTarget } from "./planner.mjs";
import { rehearsalLockTarget } from "./d1-lock-adapter.mjs";

const bytes=Buffer.from(JSON.stringify({schemaVersion:1,streamId:"nature-frontiers.staging.forward-v1",target:stagingTarget,migrations:[]}));
const planResult=orchestratePlanOnly({manifestBytes:bytes,artifacts:new Map(),target:stagingTarget});
const runId="123e4567-e89b-42d3-a456-426614174099";
const initialRun={runId,planSha256:planResult.plan.planSha256,manifestSha256:planResult.plan.manifestSha256,target:stagingTarget,state:"PLANNED",revision:0};
class Store {
 constructor(){this.calls=[];this.run=null;this.events=[];}
 async create(args){this.calls.push(["create",args]);this.run={...initialRun,actor:args.actor};this.events=[{revision:0,state:"PLANNED",actor:args.actor}];return {created:true};}
 async approve(args){this.calls.push(["approve",args]);if(!this.run||this.run.state!=="PLANNED"||args.expectedPlanSha256!==this.run.planSha256||args.expectedManifestSha256!==this.run.manifestSha256)return {approved:false};this.run={...this.run,state:"APPROVED",revision:1,approvalId:args.approvalId};this.events.push({revision:1,state:"APPROVED",actor:args.actor,approvalId:args.approvalId});return {approved:true};}
 async reject(args){this.calls.push(["reject",args]);if(!this.run||this.run.state!=="PLANNED")return {rejected:false};this.run={...this.run,state:"REFUSED",revision:1,reason:args.reason};this.events.push({revision:1,state:"REFUSED",actor:args.actor});return {rejected:true};}
 async get(){return this.run;}
 async listEvents(){return this.events;}
}
const make= (runStore=new Store(),lockStore=null)=>({runStore,service:new D1MigrationRunOrchestrator({runStore,lockStore})});

test("records only an explicitly non-executable plan and preserves its exact hashes",async()=>{
 const {runStore,service}=make();
 const result=await service.recordPlan({planResult,runId,actor:"planner",at:"2026-11-25T12:00:00.000Z"});
 assert.equal(result.created,true);
 assert.equal(result.run.state,"PLANNED");
 assert.equal(result.run.planSha256,planResult.plan.planSha256);
 assert.equal(result.run.manifestSha256,planResult.plan.manifestSha256);
 assert.equal(result.events[0].actor,"planner");
 assert.equal(runStore.calls[0][0],"create");
});
test("refuses plan result with any side-effect capability or execution flag",async()=>{
 const {service}=make();
 await assert.rejects(()=>service.recordPlan({planResult:{...planResult,sideEffects:{...planResult.sideEffects,d1Writes:true}},runId,actor:"planner"}),{code:"SIDE_EFFECT_CAPABILITY_DENIED"});
 await assert.rejects(()=>service.recordPlan({planResult:{...planResult,executionEnabled:true},runId,actor:"planner"}),{code:"NON_DRY_RUN_PLAN"});
});
test("approval is bound to the persisted plan and manifest hashes and records approver identity",async()=>{
 const {service}=make();
 await service.recordPlan({planResult,runId,actor:"planner"});
 const result=await service.approve({runId,expectedPlanSha256:planResult.plan.planSha256,expectedManifestSha256:planResult.plan.manifestSha256,actor:"owner",approvalId:"owner-approval-2026-11-25",at:"2026-11-25T12:01:00.000Z"});
 assert.equal(result.approved,true);
 assert.equal(result.run.state,"APPROVED");
 assert.equal(result.events[1].actor,"owner");
 assert.equal(result.run.approvalId,"owner-approval-2026-11-25");
});
test("stale plan approval does not advance state",async()=>{
 const {service}=make();
 await service.recordPlan({planResult,runId,actor:"planner"});
 const result=await service.approve({runId,expectedPlanSha256:"f".repeat(64),expectedManifestSha256:planResult.plan.manifestSha256,actor:"owner",approvalId:"approval"});
 assert.equal(result.approved,false);
 assert.equal(result.run.state,"PLANNED");
});
test("rejection is persisted as REFUSED with named reviewer and reason",async()=>{
 const {service}=make();
 await service.recordPlan({planResult,runId,actor:"planner"});
 const result=await service.reject({runId,expectedPlanSha256:planResult.plan.planSha256,expectedManifestSha256:planResult.plan.manifestSha256,actor:"reviewer",reason:"Owner approval absent",at:"2026-11-25T12:02:00.000Z"});
 assert.equal(result.rejected,true);
 assert.equal(result.run.state,"REFUSED");
 assert.equal(result.events[1].actor,"reviewer");
});
test("interrupted locked run requires lock adapter, dead-process proof, owner hash and recovery approval",async()=>{
 const {runStore,service}=make();
 await service.recordPlan({planResult,runId,actor:"planner"});
 await service.approve({runId,expectedPlanSha256:planResult.plan.planSha256,expectedManifestSha256:planResult.plan.manifestSha256,actor:"owner",approvalId:"approval"});
 runStore.run={...runStore.run,state:"LOCKED",revision:2};
 const ownerHash="a".repeat(64), lockEvents=[{event_type:"STALE_RECOVERED",owner_token_hash:ownerHash,approval_id:"incident-approval"}];
 const lockStore={async recoverStale(args){assert.equal(args.processTerminationConfirmed,true);assert.equal(args.actor,"incident-operator");runStore.run={...runStore.run,state:"AMBIGUOUS",revision:runStore.run.revision+1};runStore.events.push({revision:runStore.run.revision,state:"AMBIGUOUS",actor:args.actor});return {recovered:true};},async listEvents(){return lockEvents;}};
 const recovery=new D1MigrationRunOrchestrator({runStore,lockStore});
 const result=await recovery.recoverInterrupted({runId,ownerTokenHash:ownerHash,processTerminationConfirmed:true,approvalId:"incident-approval",actor:"incident-operator",at:"2026-11-25T12:03:00.000Z"});
 assert.equal(result.recovered,true);
 assert.equal(result.lockEvents[0].approval_id,"incident-approval");
});
test("interruption recovery refuses a run not durably locked",async()=>{
 const {service}=make();
 await assert.rejects(()=>service.recoverInterrupted({runId,ownerTokenHash:"a".repeat(64),processTerminationConfirmed:true,approvalId:"approval",actor:"operator"}),{code:"LOCK_STORE_REQUIRED"});
});

test("does not report recovery unless the run store confirms AMBIGUOUS",async()=>{
 const {runStore,service}=make();
 await service.recordPlan({planResult,runId,actor:"planner"});
 await service.approve({runId,expectedPlanSha256:planResult.plan.planSha256,expectedManifestSha256:planResult.plan.manifestSha256,actor:"owner",approvalId:"approval"});
 runStore.run={...runStore.run,state:"LOCKED",revision:2};
 const lockStore={async recoverStale(){return {recovered:true};},async listEvents(){return [];}};
 const recovery=new D1MigrationRunOrchestrator({runStore,lockStore});
 await assert.rejects(()=>recovery.recoverInterrupted({runId,ownerTokenHash:"a".repeat(64),processTerminationConfirmed:true,approvalId:"incident",actor:"operator"}),{code:"RECOVERY_STATE_MISMATCH"});
});

test("orchestrator can be explicitly pinned to the isolated disposable rehearsal target",async()=>{
 const runStore=new Store();
 const rehearsalPlan={...planResult,plan:{...planResult.plan,target:rehearsalLockTarget}};
 const service=new D1MigrationRunOrchestrator({runStore,target:rehearsalLockTarget});
 await service.recordPlan({planResult:rehearsalPlan,runId,actor:"rehearsal-operator"});
 assert.equal(runStore.calls[0][1].target.databaseId,rehearsalLockTarget.databaseId);
 assert.equal(runStore.calls[0][1].target.worker,rehearsalLockTarget.worker);
 assert.throws(()=>new D1MigrationRunOrchestrator({runStore,target:{...rehearsalLockTarget,worker:"nature-frontiers-staging"}}),{code:"TARGET_DENIED"});
});
