import { stagingLockTarget } from "./d1-lock-adapter.mjs";

export class MigrationRunOrchestrationError extends Error {
  constructor(code,message){super(message);this.name="MigrationRunOrchestrationError";this.code=code;}
}
function fail(code,message){throw new MigrationRunOrchestrationError(code,message);}
function assertPlanResult(result){
  if(!result||result.mode!=="PLAN_ONLY"||result.executionEnabled!==false||!result.plan) fail("NON_DRY_RUN_PLAN","Only a plan-only result may be persisted as a migration run.");
  const flags=result.sideEffects;
  const requiredFlags=["d1Reads","d1Writes","lockAcquired","sqlExecuted","workerDeployed"];
  if(!flags||Object.keys(flags).length!==requiredFlags.length||requiredFlags.some(key=>flags[key]!==false)) fail("SIDE_EFFECT_CAPABILITY_DENIED","Persisting a run requires the exact, all-false plan side-effect capability set.");
  const plan=result.plan;
  if(plan.mode!=="READ_ONLY_DRY_RUN"||plan.executionEnabled!==false) fail("EXECUTABLE_PLAN_DENIED","Plan payload is not an explicitly non-executable dry-run.");
  if(plan.target?.environment!==stagingLockTarget.environment||plan.target?.databaseId!==stagingLockTarget.databaseId||plan.target?.worker!==stagingLockTarget.worker) fail("TARGET_DENIED","Plan target is not the pinned Nature Frontiers staging target.");
  if(!/^[a-f0-9]{64}$/.test(plan.planSha256??"")||!/^[a-f0-9]{64}$/.test(plan.manifestSha256??"")) fail("INVALID_PLAN_HASH","Plan and manifest SHA-256 values are required.");
  return plan;
}

/**
 * Durable run-record and human-approval orchestration only.
 * It never executes migration SQL, deploys a Worker, or creates a lock.
 * Lock recovery is a separate, explicit operation requiring process-death
 * confirmation plus a recovery approval reference and named operator.
 */
export class D1MigrationRunOrchestrator {
  constructor({runStore,lockStore=null}){
    if(!runStore||typeof runStore.create!=="function"||typeof runStore.approve!=="function"||typeof runStore.reject!=="function"||typeof runStore.get!=="function"||typeof runStore.listEvents!=="function") fail("INVALID_RUN_STORE","A complete D1MigrationRunStore adapter is required.");
    if(lockStore!==null&&typeof lockStore.recoverStale!=="function") fail("INVALID_LOCK_STORE","Optional lock store must expose recoverStale().");
    this.runStore=runStore;this.lockStore=lockStore;
  }

  async recordPlan({planResult,runId,actor,at,reason}){
    const plan=assertPlanResult(planResult);
    const result=await this.runStore.create({
      runId,planSha256:plan.planSha256,manifestSha256:plan.manifestSha256,
      target:plan.target,actor,at,reason
    });
    const run=await this.runStore.get(runId);
    return {created:result.created,run,events:await this.runStore.listEvents(runId)};
  }

  async approve({runId,expectedPlanSha256,expectedManifestSha256,actor,approvalId,at,reason}){
    const result=await this.runStore.approve({
      runId,expectedPlanSha256,expectedManifestSha256,target:stagingLockTarget,
      actor,approvalId,at,reason
    });
    const run=await this.runStore.get(runId);
    return {approved:result.approved,run,events:await this.runStore.listEvents(runId)};
  }

  async reject({runId,expectedPlanSha256,expectedManifestSha256,actor,at,reason}){
    const result=await this.runStore.reject({
      runId,expectedPlanSha256,expectedManifestSha256,target:stagingLockTarget,
      actor,at,reason
    });
    const run=await this.runStore.get(runId);
    return {rejected:result.rejected,run,events:await this.runStore.listEvents(runId)};
  }

  async recoverInterrupted({runId,ownerTokenHash,processTerminationConfirmed,approvalId,actor,at}){
    if(!this.lockStore) fail("LOCK_STORE_REQUIRED","Interrupted locked-run recovery requires the persistent D1 lock adapter.");
    const run=await this.runStore.get(runId);
    if(!run) fail("RUN_NOT_FOUND","No persisted run exists for the supplied run ID.");
    if(run.state!=="LOCKED") fail("RUN_NOT_LOCKED","Only a run in LOCKED state can enter stale-lock recovery.");
    const result=await this.lockStore.recoverStale({
      runId,ownerTokenHash,processTerminationConfirmed,approvalId,actor,at
    });
    const recoveredRun=await this.runStore.get(runId);
    if(result.recovered===true&&recoveredRun?.state!=="AMBIGUOUS") fail("RECOVERY_STATE_MISMATCH","Lock adapter reported recovery without persisting AMBIGUOUS run state.");
    return {
      recovered:result.recovered,
      run:recoveredRun,
      events:await this.runStore.listEvents(runId),
      lockEvents:await this.lockStore.listEvents(runId)
    };
  }

  async inspect(runId){
    const run=await this.runStore.get(runId);
    if(!run)return null;
    return {run,events:await this.runStore.listEvents(runId)};
  }
}
