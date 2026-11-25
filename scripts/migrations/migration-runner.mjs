import { orchestratePlanOnly } from "./plan-only-runner.mjs";
import { D1MigrationLockStore, sha256Hex, stagingLockTarget } from "./d1-lock-adapter.mjs";
import { D1MigrationRunStore } from "./d1-run-store.mjs";
import { D1MigrationRunOrchestrator } from "./run-orchestrator.mjs";

export class MigrationRunLifecycleError extends Error {
  constructor(code,message){super(message);this.name="MigrationRunLifecycleError";this.code=code;}
}
function fail(code,message){throw new MigrationRunLifecycleError(code,message);}

/**
 * Durable, plan-only runner lifecycle. This class can persist approvals and
 * acquire/release a coordination lock, but intentionally exposes no SQL,
 * DDL, migration-execution, schema-mutation, or Worker-deployment operation.
 */
export class MigrationRunLifecycle {
  constructor({db,runStore,lockStore,target=stagingLockTarget}){
    this.runStore=runStore??new D1MigrationRunStore(db);
    this.lockStore=lockStore??new D1MigrationLockStore(db);
    this.orchestrator=new D1MigrationRunOrchestrator({runStore:this.runStore,lockStore:this.lockStore,target});
    this.target=Object.freeze({...target});
    this.capabilities=Object.freeze({
      planOnly:true,approvalRequired:true,persistentLock:true,
      d1MigrationSqlExecution:false,ddlExecution:false,schemaMutation:false,workerDeployment:false
    });
  }

  plan({manifestBytes,artifacts,sourceCommit=null,runnerVersion="0.1.0"}){
    return orchestratePlanOnly({manifestBytes,artifacts,target:this.target,sourceCommit,runnerVersion});
  }

  recordPlan(args){return this.orchestrator.recordPlan(args);}
  approve(args){return this.orchestrator.approve(args);}
  reject(args){return this.orchestrator.reject(args);}

  async acquire({runId,ownerToken,actor,at=new Date().toISOString()}){
    if(typeof actor!=="string"||!actor.trim()) fail("INVALID_ACTOR","A named lock owner is required for the audit event.");
    const run=await this.runStore.get(runId);
    if(!run) fail("RUN_NOT_FOUND","No persisted run exists for the supplied run ID.");
    if(run.state!=="APPROVED") fail("RUN_NOT_APPROVED","A persisted human-approved run is required before lock acquisition.");
    const ownerTokenHash=await sha256Hex(ownerToken);
    const result=await this.lockStore.acquire({run,target:this.target,ownerTokenHash,actor:actor.trim(),at});
    const current=await this.inspect(runId);
    return {...result,...current};
  }

  async release({runId,ownerToken,actor,at=new Date().toISOString()}){
    if(typeof actor!=="string"||!actor.trim()) fail("INVALID_ACTOR","A named lock owner is required for the audit event.");
    const ownerTokenHash=await sha256Hex(ownerToken);
    const result=await this.lockStore.release({runId,ownerTokenHash,actor:actor.trim(),at});
    const current=await this.inspect(runId);
    return {...result,...current};
  }

  recoverInterrupted(args){return this.orchestrator.recoverInterrupted(args);}

  async inspect(runId){
    const run=await this.runStore.get(runId);
    if(!run)return null;
    return {
      run,events:await this.runStore.listEvents(runId),
      lock:await this.lockStore.read(),
      lockEvents:await this.lockStore.listEvents(runId),
      capabilities:this.capabilities
    };
  }
}
