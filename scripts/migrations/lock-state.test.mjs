import test from "node:test";
import assert from "node:assert/strict";
import { createRunRecord, transitionRun, InMemoryAtomicLockStore, MigrationLockCoordinator } from "./lock-state.mjs";
import { stagingTarget } from "./planner.mjs";

const hash="a".repeat(64), token="t".repeat(48), now="2026-11-25T12:00:00.000Z";
function run(){return transitionRun(createRunRecord({planSha256:hash,manifestSha256:hash,target:stagingTarget,actor:"owner@example.invalid",createdAt:now}),"APPROVED",{at:now,reason:"owner approved offline runner protocol",approvalId:"approval-001"});}

test("run records require exact staging target, hashes, actor and canonical timestamps",()=>{
  assert.throws(()=>createRunRecord({planSha256:"x",manifestSha256:hash,target:stagingTarget,actor:"owner",createdAt:now}),{code:"INVALID_PLAN_HASH"});
  assert.throws(()=>createRunRecord({planSha256:hash,manifestSha256:hash,target:{...stagingTarget,databaseId:"wrong"},actor:"owner",createdAt:now}),{code:"TARGET_DENIED"});
});
test("state transitions require explicit approval and auditable reasons",()=>{
  const planned=createRunRecord({planSha256:hash,manifestSha256:hash,target:stagingTarget,actor:"owner",createdAt:now});
  assert.throws(()=>transitionRun(planned,"APPROVED",{at:now,reason:"approve"}),{code:"APPROVAL_REQUIRED"});
  const approved=transitionRun(planned,"APPROVED",{at:now,reason:"owner approved",approvalId:"approval-001"});
  assert.equal(approved.revision,1);
  assert.throws(()=>transitionRun(approved,"APPLIED",{at:now,reason:"pretend DDL applied"}),{code:"INVALID_RUN_STATE"});
});
test("only an approved run for exact staging target can acquire a lock",async()=>{
  const store=new InMemoryAtomicLockStore(), coordinator=new MigrationLockCoordinator(store);
  const result=await coordinator.acquire({run:run(),target:stagingTarget,token,at:now});
  assert.equal(result.acquired,true);
  assert.equal(result.record.expiresAt,null);
  assert.notEqual(result.record.ownerTokenHash,token);
});
test("concurrent acquisitions produce exactly one owner",async()=>{
  const store=new InMemoryAtomicLockStore(), coordinator=new MigrationLockCoordinator(store);
  const first=run(), second=run();
  const results=await Promise.all([
    coordinator.acquire({run:first,target:stagingTarget,token:"a".repeat(48),at:now}),
    coordinator.acquire({run:second,target:stagingTarget,token:"b".repeat(48),at:now})
  ]);
  assert.equal(results.filter(x=>x.acquired).length,1);
  assert.equal(results.filter(x=>!x.acquired).length,1);
});
test("wrong owner cannot release; exact owner can release",async()=>{
  const store=new InMemoryAtomicLockStore(), coordinator=new MigrationLockCoordinator(store);
  const r=run(); await coordinator.acquire({run:r,target:stagingTarget,token,at:now});
  assert.deepEqual(await coordinator.release({ownerToken:"z".repeat(48),runId:r.runId,at:now}),{released:false,reason:"OWNER_MISMATCH"});
  assert.equal((await coordinator.release({ownerToken:token,runId:r.runId,at:now})).released,true);
});
test("stale lock is never expired or stolen automatically",async()=>{
  const store=new InMemoryAtomicLockStore(), coordinator=new MigrationLockCoordinator(store);
  const r=run(); await coordinator.acquire({run:r,target:stagingTarget,token,at:now});
  await assert.rejects(()=>coordinator.recoverStale({expectedOwnerTokenHash:"b".repeat(64),processTerminationConfirmed:false,approvalId:"approval"}),{code:"PROCESS_STILL_POSSIBLY_ACTIVE"});
  const next=await coordinator.acquire({run:run(),target:stagingTarget,token:"c".repeat(48),at:now});
  assert.equal(next.acquired,false);
});
test("stale-lock recovery requires process termination, exact owner hash and approval",async()=>{
  const store=new InMemoryAtomicLockStore(), coordinator=new MigrationLockCoordinator(store);
  const r=run(), acquired=await coordinator.acquire({run:r,target:stagingTarget,token,at:now});
  assert.equal((await coordinator.recoverStale({expectedOwnerTokenHash:acquired.ownerTokenHash,processTerminationConfirmed:true,approvalId:"incident-approval-7"})).cleared,true);
});
test("lock coordinator refuses production and unknown targets",async()=>{
  const coordinator=new MigrationLockCoordinator(new InMemoryAtomicLockStore());
  await assert.rejects(()=>coordinator.acquire({run:run(),target:{...stagingTarget,worker:"nature-frontiers-publisher"},token,at:now}),{code:"TARGET_DENIED"});
});
