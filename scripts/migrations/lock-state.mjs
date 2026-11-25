import { createHash, randomUUID } from "node:crypto";

const TARGET_ID = "89be73af-ebaf-4c19-b75a-9871adb8ba3c";
const WORKER = "nature-frontiers-staging";
const SHA = /^[a-f0-9]{64}$/;
const STATES = new Set(["PLANNED","APPROVED","LOCKED","PRECHECKED","REFUSED","FAILED_BEFORE_DDL","AMBIGUOUS","RELEASED"]);
const TRANSITIONS = {
  PLANNED: new Set(["APPROVED","REFUSED"]),
  APPROVED: new Set(["LOCKED","REFUSED"]),
  LOCKED: new Set(["PRECHECKED","FAILED_BEFORE_DDL","AMBIGUOUS","REFUSED"]),
  PRECHECKED: new Set(["RELEASED","AMBIGUOUS","REFUSED"]),
  REFUSED: new Set(), FAILED_BEFORE_DDL: new Set(), AMBIGUOUS: new Set(), RELEASED: new Set()
};
export class MigrationLockError extends Error {
  constructor(code,message){super(message);this.name="MigrationLockError";this.code=code;}
}
function fail(code,message){throw new MigrationLockError(code,message);}
function hashToken(token){return createHash("sha256").update(token).digest("hex");}
function assertTarget(target){
  if(!target || target.environment!=="staging" || target.databaseId!==TARGET_ID || target.worker!==WORKER) fail("TARGET_DENIED","Lock protocol is restricted to the pinned staging identity.");
}
function assertIso(value,label){
  if(typeof value!=="string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString()!==value) fail("INVALID_TIMESTAMP",`${label} must be canonical ISO-8601 UTC.`);
}
function clone(value){return value===undefined?undefined:structuredClone(value);}

/**
 * Adapter contract: claimIfAbsent(record), read(), releaseIfOwner(ownerHash),
 * and clearIfOwner(ownerHash, approvalId). Each mutation MUST be atomic in its
 * real implementation. This module intentionally ships no D1 adapter.
 */
export class InMemoryAtomicLockStore {
  #record = null;
  async claimIfAbsent(record) {
    if (this.#record !== null) return false;
    this.#record = clone(record);
    return true;
  }
  async read(){return clone(this.#record);}
  async releaseIfOwner(ownerTokenHash){
    if (!this.#record || this.#record.ownerTokenHash!==ownerTokenHash) return false;
    this.#record=null; return true;
  }
  async clearIfOwner(ownerTokenHash, approvalId){
    if (!this.#record || this.#record.ownerTokenHash!==ownerTokenHash || !approvalId) return false;
    this.#record=null; return true;
  }
}

export function createRunRecord({runId=randomUUID(),planSha256,manifestSha256,target,actor,createdAt=new Date().toISOString()}){
  assertTarget(target);
  if(typeof runId!=="string" || !/^[0-9a-f-]{36}$/.test(runId)) fail("INVALID_RUN_ID","runId must be a UUID.");
  if(!SHA.test(planSha256??"") || !SHA.test(manifestSha256??"")) fail("INVALID_PLAN_HASH","Plan and manifest hashes must be SHA-256.");
  if(typeof actor!=="string" || !actor.trim() || actor.length>200) fail("INVALID_ACTOR","An operator identity is required.");
  assertIso(createdAt,"createdAt");
  return Object.freeze({runId,planSha256,manifestSha256,target:{...target},actor,createdAt,state:"PLANNED",revision:0,events:[{state:"PLANNED",at:createdAt,reason:"dry-run plan created"}]});
}

export function transitionRun(record,nextState,{at=new Date().toISOString(),reason,approvalId}={}){
  if(!record || !STATES.has(record.state) || !STATES.has(nextState)) fail("INVALID_RUN_STATE","Unknown run state.");
  assertIso(at,"transition timestamp");
  if(!TRANSITIONS[record.state].has(nextState)) fail("INVALID_TRANSITION",`Transition ${record.state} -> ${nextState} is not permitted.`);
  if(typeof reason!=="string" || !reason.trim()) fail("MISSING_REASON","Every state transition requires an auditable reason.");
  if(record.state==="PLANNED" && nextState==="APPROVED" && (typeof approvalId!=="string" || !approvalId.trim())) fail("APPROVAL_REQUIRED","Approval transition requires an explicit approval reference.");
  const event={state:nextState,at,reason:reason.trim()};
  if(approvalId) event.approvalId=approvalId;
  return Object.freeze({...record,state:nextState,revision:record.revision+1,events:[...record.events,event]});
}

export class MigrationLockCoordinator {
  constructor(store){if(!store || !["claimIfAbsent","read","releaseIfOwner","clearIfOwner"].every(k=>typeof store[k]==="function")) fail("INVALID_LOCK_STORE","Atomic lock store adapter is incomplete.");this.store=store;}
  async acquire({run,target,token=randomUUID(),at=new Date().toISOString()}){
    assertTarget(target);
    if(!run || run.state!=="APPROVED" || run.target.databaseId!==target.databaseId || run.target.worker!==target.worker) fail("RUN_NOT_APPROVED","Only an approved run for the exact staging target may acquire the lock.");
    if(typeof token!=="string" || token.length<32) fail("INVALID_OWNER_TOKEN","Owner token must contain at least 32 characters.");
    assertIso(at,"lock timestamp");
    const ownerTokenHash=hashToken(token);
    const lockRecord={target:{...target},runId:run.runId,planSha256:run.planSha256,manifestSha256:run.manifestSha256,ownerTokenHash,acquiredAt:at,expiresAt:null};
    const claimed=await this.store.claimIfAbsent(lockRecord);
    if(!claimed) return {acquired:false,reason:"LOCK_ALREADY_HELD",current:await this.store.read()};
    const verified=await this.store.read();
    if(!verified || verified.ownerTokenHash!==ownerTokenHash || verified.runId!==run.runId) fail("LOCK_READBACK_MISMATCH","Lock claim could not be verified; do not continue.");
    return {acquired:true,ownerTokenHash,record:verified};
  }
  async release({ownerToken,runId,at=new Date().toISOString()}){
    assertIso(at,"release timestamp");
    if(typeof ownerToken!=="string" || ownerToken.length<32) fail("INVALID_OWNER_TOKEN","Owner token is required.");
    const digest=hashToken(ownerToken), current=await this.store.read();
    if(!current || current.ownerTokenHash!==digest || current.runId!==runId) return {released:false,reason:"OWNER_MISMATCH"};
    const released=await this.store.releaseIfOwner(digest);
    return {released,reason:released?"OWNER_RELEASED":"CONCURRENT_LOCK_CHANGE"};
  }
  async recoverStale({expectedOwnerTokenHash,processTerminationConfirmed,approvalId}){
    if(!SHA.test(expectedOwnerTokenHash??"")) fail("INVALID_OWNER_HASH","Expected owner hash must be SHA-256.");
    if(processTerminationConfirmed!==true) fail("PROCESS_STILL_POSSIBLY_ACTIVE","Cannot recover a lock without confirmation the original process cannot resume.");
    if(typeof approvalId!=="string" || !approvalId.trim()) fail("RECOVERY_APPROVAL_REQUIRED","Manual stale-lock recovery requires an approval reference.");
    const current=await this.store.read();
    if(!current || current.ownerTokenHash!==expectedOwnerTokenHash) return {cleared:false,reason:"LOCK_OWNER_CHANGED"};
    const cleared=await this.store.clearIfOwner(expectedOwnerTokenHash,approvalId.trim());
    return {cleared,reason:cleared?"MANUAL_RECOVERY_APPROVED":"LOCK_OWNER_CHANGED"};
  }
}

export const migrationRunStates=Object.freeze([...STATES]);
