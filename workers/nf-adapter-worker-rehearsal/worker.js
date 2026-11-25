import { D1MigrationLockStore, sha256Hex, rehearsalLockTarget } from "./d1-lock-adapter.mjs";
import { D1MigrationRunStore } from "./d1-run-store.mjs";
import { D1MigrationRunOrchestrator } from "./run-orchestrator.mjs";

const json = (value, status=200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store" }
});
const interruptedOwnerToken = "nf-job4a-interrupted-owner-token-00000000000000000000000000000000";

function services(env) {
  const store = new D1MigrationRunStore(env.DB);
  const locks = new D1MigrationLockStore(env.DB);
  const orchestrator = new D1MigrationRunOrchestrator({ runStore:store, lockStore:locks, target:rehearsalLockTarget });
  return { store, locks, orchestrator };
}

async function dispatch(input, env) {
  const {store,locks,orchestrator}=services(env);
  switch (input.action) {
    case "health": {
      const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name LIKE 'nf_migration_%'").first();
      return { ok:true, target:rehearsalLockTarget, controlTables:row?.count ?? 0 };
    }
    case "recordPlan": {
      return orchestrator.recordPlan({
        planResult: {
          mode:"PLAN_ONLY", executionEnabled:false,
          sideEffects:{d1Reads:false,d1Writes:false,lockAcquired:false,sqlExecuted:false,workerDeployed:false},
          plan:{ mode:"READ_ONLY_DRY_RUN", executionEnabled:false, target:rehearsalLockTarget,
            planSha256:input.planSha256, manifestSha256:input.manifestSha256 }
        },
        runId:input.runId, actor:input.actor, at:input.at, reason:input.reason || "Disposable D1 adapter rehearsal"
      });
    }
    case "approve": {
      const run=await store.get(input.runId);
      if(!run) throw Object.assign(new Error("No persisted run exists."),{code:"RUN_NOT_FOUND"});
      return orchestrator.approve({
        runId:run.runId,expectedPlanSha256:run.planSha256,
        expectedManifestSha256:run.manifestSha256,actor:input.actor,
        approvalId:input.approvalId,at:input.at,reason:input.reason
      });
    }
    case "acquire": {
      const run=await store.get(input.runId);
      if(!run) throw Object.assign(new Error("No persisted run exists."),{code:"RUN_NOT_FOUND"});
      const ownerTokenHash=await sha256Hex(input.ownerToken);
      return locks.acquire({run,target:rehearsalLockTarget,ownerTokenHash,at:input.at});
    }
    case "release": {
      const ownerTokenHash=await sha256Hex(input.ownerToken);
      return locks.release({runId:input.runId,ownerTokenHash,at:input.at});
    }
    case "recover": {
      const ownerTokenHash=await sha256Hex(input.ownerToken);
      return orchestrator.recoverInterrupted({
        runId:input.runId,ownerTokenHash,
        processTerminationConfirmed:input.processTerminationConfirmed,
        approvalId:input.approvalId,actor:input.actor,at:input.at
      });
    }
    case "inspect": {
      const run=await orchestrator.inspect(input.runId);
      return {run,lock:await locks.read(),lockEvents:await locks.listEvents(input.runId)};
    }
    default: throw Object.assign(new Error("Unknown rehearsal action."),{code:"UNKNOWN_ACTION"});
  }
}

async function createApprovedRun(env, suffix) {
  const runId=crypto.randomUUID();
  const planSha256="a".repeat(64), manifestSha256="b".repeat(64);
  const at=new Date().toISOString();
  await dispatch({action:"recordPlan",runId,planSha256,manifestSha256,actor:"job4a-planner-"+suffix,at},env);
  await dispatch({action:"approve",runId,actor:"job4a-owner-"+suffix,approvalId:"job4a-approval-"+suffix,at:new Date().toISOString()},env);
  return {runId,ownerToken:"job4a-owner-token-"+suffix+"-0123456789abcdef0123456789abcdef"};
}

async function selfTestConcurrency(env) {
  const [a,b]=await Promise.all([createApprovedRun(env,"A"),createApprovedRun(env,"B")]);
  const [acquireA,acquireB]=await Promise.all([
    dispatch({action:"acquire",runId:a.runId,ownerToken:a.ownerToken,at:new Date().toISOString()},env),
    dispatch({action:"acquire",runId:b.runId,ownerToken:b.ownerToken,at:new Date().toISOString()},env)
  ]);
  const winners=[{...a,result:acquireA},{...b,result:acquireB}].filter(x=>x.result.acquired===true);
  if(winners.length!==1) throw Object.assign(new Error("Concurrent acquisition did not produce exactly one winner."),{code:"CONCURRENCY_ASSERTION_FAILED",details:{a:acquireA.acquired,b:acquireB.acquired}});
  const winner=winners[0];
  const wrongOwner=await dispatch({action:"release",runId:winner.runId,ownerToken:"wrong-owner-token-0123456789abcdef0123456789abcdef",at:new Date().toISOString()},env);
  const afterWrong=await services(env).locks.read();
  const ownerRelease=await dispatch({action:"release",runId:winner.runId,ownerToken:winner.ownerToken,at:new Date().toISOString()},env);
  const winnerInspect=await dispatch({action:"inspect",runId:winner.runId},env);
  const loser=[a,b].find(x=>x.runId!==winner.runId);
  const loserInspect=await dispatch({action:"inspect",runId:loser.runId},env);
  return {
    exactlyOneConcurrentWinner:winners.length===1,
    winnerRunId:winner.runId,loserRunId:loser.runId,
    wrongOwnerReleaseRejected:wrongOwner.released===false,
    lockRetainedAfterWrongOwner:afterWrong?.run_id===winner.runId,
    correctOwnerReleaseSucceeded:ownerRelease.released===true,
    lockAbsentAfterOwnerRelease:winnerInspect.lock===null,
    winnerFinalState:winnerInspect.run?.state,
    winnerLockEvents:winnerInspect.lockEvents,
    loserFinalState:loserInspect.run?.state
  };
}

export default {
  async fetch(request, env) {
    if (!env.DB) return json({error:"HARNESS_NOT_CONFIGURED"},503);
    const url=new URL(request.url);
    if (request.method==="GET" && url.pathname==="/health") {
      try { return json(await dispatch({action:"health"},env)); }
      catch(error) { return json({error:error.code||"HEALTH_ERROR",message:error.message},500); }
    }
    if (request.method==="GET" && url.pathname==="/__selftest/concurrency") {
      if (!env.AUTH_TOKEN || url.searchParams.get("key")!==env.AUTH_TOKEN) return json({error:"UNAUTHORIZED"},401);
      try { return json(await selfTestConcurrency(env)); }
      catch(error) { return json({error:error.code||"SELFTEST_ERROR",message:error.message,details:error.details},500); }
    }
    if (request.method==="GET" && url.pathname==="/__selftest/interrupt") {
      if (!env.AUTH_TOKEN || url.searchParams.get("key")!==env.AUTH_TOKEN) return json({error:"UNAUTHORIZED"},401);
      try {
        const runId=crypto.randomUUID(),at=new Date().toISOString();
        await dispatch({action:"recordPlan",runId,planSha256:"c".repeat(64),manifestSha256:"d".repeat(64),actor:"job4a-interruption-planner",at},env);
        await dispatch({action:"approve",runId,actor:"job4a-interruption-owner",approvalId:"job4a-interruption-approval",at:new Date().toISOString()},env);
        const acquired=await dispatch({action:"acquire",runId,ownerToken:interruptedOwnerToken,at:new Date().toISOString()},env);
        return json({acquired:acquired.acquired,runId,runState:(await services(env).store.get(runId))?.state,lock:acquired.lock});
      } catch(error) { return json({error:error.code||"INTERRUPTION_SETUP_FAILED",message:error.message},500); }
    }
    if (request.method==="GET" && url.pathname==="/__selftest/recover") {
      if (!env.AUTH_TOKEN || url.searchParams.get("key")!==env.AUTH_TOKEN) return json({error:"UNAUTHORIZED"},401);
      try {
        const runId=url.searchParams.get("runId");
        const recovered=await dispatch({
          action:"recover",runId,ownerToken:interruptedOwnerToken,
          processTerminationConfirmed:true,approvalId:"job4a-recovery-approval",
          actor:"job4a-recovery-operator",at:new Date().toISOString()
        },env);
        return json(recovered);
      } catch(error) { return json({error:error.code||"RECOVERY_FAILED",message:error.message},500); }
    }
    if (request.method!=="POST") return json({error:"METHOD_NOT_ALLOWED"},405);
    if (!env.AUTH_TOKEN) return json({error:"HARNESS_NOT_CONFIGURED"},503);
    if (request.headers.get("authorization")!==`Bearer ${env.AUTH_TOKEN}`) return json({error:"UNAUTHORIZED"},401);
    let input;
    try { input=await request.json(); } catch { return json({error:"INVALID_JSON"},400); }
    try { return json(await dispatch(input,env)); }
    catch(error) { return json({error:error.code||"REHEARSAL_ERROR",message:error.message},400); }
  }
};
