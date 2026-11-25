import { MigrationRunLifecycle } from "./migration-runner.mjs";
import { rehearsalLockTarget } from "./d1-lock-adapter.mjs";

const json=(value,status=200)=>new Response(JSON.stringify(value),{
  status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});
const interruptedOwnerToken="nf-job4b-interrupted-owner-token-00000000000000000000000000000000";
const services=env=>new MigrationRunLifecycle({db:env.DB,target:rehearsalLockTarget});
const now=()=>new Date().toISOString();

function planFor(runner){
  const manifest={schemaVersion:1,streamId:"nf.job4b.rehearsal",target:rehearsalLockTarget,migrations:[]};
  return runner.plan({manifestBytes:new TextEncoder().encode(JSON.stringify(manifest)),artifacts:new Map()});
}
async function recordApproved(env,suffix){
  const runner=services(env),runId=crypto.randomUUID(),planResult=planFor(runner);
  await runner.recordPlan({planResult,runId,actor:"job4b-planner-"+suffix,at:now(),reason:"Job 4B integrated runner rehearsal"});
  await runner.approve({runId,expectedPlanSha256:planResult.plan.planSha256,expectedManifestSha256:planResult.plan.manifestSha256,
    actor:"job4b-approver-"+suffix,approvalId:"job4b-approval-"+suffix,at:now(),reason:"Explicit disposable rehearsal approval"});
  return {runId,ownerToken:"job4b-owner-token-"+suffix+"-0123456789abcdef0123456789abcdef"};
}
async function dispatch(input,env){
  const runner=services(env);
  switch(input.action){
    case "health":{
      const row=await env.DB.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name LIKE 'nf_migration_%'").first();
      return {ok:true,target:rehearsalLockTarget,controlTables:row?.count??0,capabilities:runner.capabilities};
    }
    case "recordPlan":{
      const planResult=planFor(runner);
      return runner.recordPlan({planResult,runId:input.runId,actor:input.actor,at:input.at,reason:input.reason||"Job 4B plan-only runner rehearsal"});
    }
    case "approve":{
      const run=await runner.runStore.get(input.runId);
      if(!run)throw Object.assign(new Error("No persisted run exists."),{code:"RUN_NOT_FOUND"});
      return runner.approve({runId:run.runId,expectedPlanSha256:run.planSha256,expectedManifestSha256:run.manifestSha256,
        actor:input.actor,approvalId:input.approvalId,at:input.at,reason:input.reason||"Explicit rehearsal approval"});
    }
    case "acquire":
      return runner.acquire({runId:input.runId,ownerToken:input.ownerToken,actor:input.actor||"job4b-lock-owner",at:input.at});
    case "release":
      return runner.release({runId:input.runId,ownerToken:input.ownerToken,actor:input.actor||"job4b-lock-owner",at:input.at});
    case "recover":{
      const ownerTokenHash=await (await import("./d1-lock-adapter.mjs")).sha256Hex(input.ownerToken);
      return runner.recoverInterrupted({runId:input.runId,ownerTokenHash,processTerminationConfirmed:input.processTerminationConfirmed,
        approvalId:input.approvalId,actor:input.actor,at:input.at});
    }
    case "inspect":return runner.inspect(input.runId);
    default:throw Object.assign(new Error("Unknown runner action."),{code:"UNKNOWN_ACTION"});
  }
}

export default {
 async fetch(request,env){
  if(!env.DB)return json({error:"HARNESS_NOT_CONFIGURED"},503);
  const url=new URL(request.url);
  if(request.method==="GET"&&url.pathname==="/health"){
   try{return json(await dispatch({action:"health"},env));}
   catch(error){return json({error:error.code||"HEALTH_ERROR",message:error.message},500);}
  }
  const selfTest=url.pathname.startsWith("/__selftest/");
  if(selfTest&&(!env.AUTH_TOKEN||url.searchParams.get("key")!==env.AUTH_TOKEN))return json({error:"UNAUTHORIZED"},401);
  if(request.method==="GET"&&url.pathname==="/__selftest/prepare-race"){
   try{
    const ids=[url.searchParams.get("runA"),url.searchParams.get("runB")];
    if(ids.some(id=>!id))return json({error:"TWO_RUN_IDS_REQUIRED"},400);
    const prepared=[];
    for(let i=0;i<ids.length;i++){
      const runner=services(env);let run=await runner.runStore.get(ids[i]);
      if(!run){
       const planResult=planFor(runner);
       await runner.recordPlan({planResult,runId:ids[i],actor:"job4b-race-planner-"+i,at:now()});
       await runner.approve({runId:ids[i],expectedPlanSha256:planResult.plan.planSha256,expectedManifestSha256:planResult.plan.manifestSha256,
        actor:"job4b-race-approver-"+i,approvalId:"job4b-race-approval-"+i,at:now()});
       run=await runner.runStore.get(ids[i]);
      }
      prepared.push({runId:run.runId,state:run.state});
    }
    return json({prepared});
   }catch(error){return json({error:error.code||"RACE_PREPARE_FAILED",message:error.message},500);}
  }
  if(request.method==="GET"&&url.pathname==="/__selftest/race-acquire"){
   try{
    const runId=url.searchParams.get("runId"),runner=services(env),run=await runner.runStore.get(runId);
    if(!run)return json({error:"RUN_NOT_FOUND"},404);
    if(run.state==="LOCKED")return json({acquired:false,alreadyOwned:false,lock:await runner.lockStore.read()});
    if(run.state!=="APPROVED")return json({acquired:false,state:run.state,lock:await runner.lockStore.read()});
    const ownerToken="job4b-race-owner-token-"+runId+"-0123456789abcdef";
    return json(await runner.acquire({runId,ownerToken,actor:"job4b-race-lock-owner",at:now()}));
   }catch(error){return json({error:error.code||"RACE_ACQUIRE_FAILED",message:error.message},500);}
  }
  if(request.method==="GET"&&url.pathname==="/__selftest/race-release"){
   try{
    const runId=url.searchParams.get("runId"),runner=services(env),run=await runner.runStore.get(runId);
    if(run?.state==="RELEASED")return json({released:false,alreadyReleased:true});
    const ownerToken="job4b-race-owner-token-"+runId+"-0123456789abcdef";
    return json(await runner.release({runId,ownerToken,actor:"job4b-race-lock-owner",at:now()}));
   }catch(error){return json({error:error.code||"RACE_RELEASE_FAILED",message:error.message},500);}
  }
  if(request.method==="GET"&&url.pathname==="/__selftest/concurrency"){
   try{
    const a=await recordApproved(env,"A");
    const b=await recordApproved(env,"B");
    const [ra,rb]=await Promise.all([
      dispatch({action:"acquire",runId:a.runId,ownerToken:a.ownerToken,actor:"job4b-owner-A",at:now()},env),
      dispatch({action:"acquire",runId:b.runId,ownerToken:b.ownerToken,actor:"job4b-owner-B",at:now()},env)
    ]);
    const winners=[{...a,result:ra},{...b,result:rb}].filter(x=>x.result.acquired===true);
    if(winners.length!==1)throw Object.assign(new Error("Expected exactly one D1 lock winner."),{code:"CONCURRENCY_ASSERTION_FAILED"});
    const winner=winners[0],loser=[a,b].find(x=>x.runId!==winner.runId);
    const wrong=await dispatch({action:"release",runId:winner.runId,ownerToken:"wrong-owner-token-0123456789abcdef0123456789abcdef",actor:"job4b-intruder",at:now()},env);
    const retained=await services(env).lockStore.read();
    const released=await dispatch({action:"release",runId:winner.runId,ownerToken:winner.ownerToken,actor:"job4b-owner",at:now()},env);
    const winnerFinal=await dispatch({action:"inspect",runId:winner.runId},env);
    const loserFinal=await dispatch({action:"inspect",runId:loser.runId},env);
    return json({exactlyOneWinner:winners.length===1,winnerRunId:winner.runId,loserRunId:loser.runId,
      wrongOwnerRejected:wrong.released===false,lockRetainedAfterWrongOwner:retained?.run_id===winner.runId,
      ownerReleaseSucceeded:released.released===true,winnerState:winnerFinal.run.state,loserState:loserFinal.run.state,
      runEvents:winnerFinal.events,lockEvents:winnerFinal.lockEvents});
   }catch(error){return json({error:error.code||"SELFTEST_ERROR",message:error.message,stack:error.stack},200);}
  }
  if(request.method==="GET"&&url.pathname==="/__selftest/interrupt"){
   try{
    const runId=url.searchParams.get("runId")||crypto.randomUUID(),runner=services(env);
    let run=await runner.runStore.get(runId);
    if(!run){
      const planResult=planFor(runner);
      await runner.recordPlan({planResult,runId,actor:"job4b-interruption-planner",at:now()});
      await runner.approve({runId,expectedPlanSha256:planResult.plan.planSha256,expectedManifestSha256:planResult.plan.manifestSha256,
       actor:"job4b-interruption-approver",approvalId:"job4b-interruption-approval",at:now()});
    }
    run=await runner.runStore.get(runId);
    if(run.state==="APPROVED")await runner.acquire({runId,ownerToken:interruptedOwnerToken,actor:"job4b-interruption-owner",at:now()});
    const result=await runner.inspect(runId);
    return json({runId,runState:result.run.state,lock:result.lock,events:result.events,lockEvents:result.lockEvents});
   }catch(error){return json({error:error.code||"INTERRUPTION_SETUP_FAILED",message:error.message},500);}
  }
  if(request.method==="GET"&&url.pathname==="/__selftest/recover"){
   try{
    const runId=url.searchParams.get("runId"),runner=services(env);
    const ownerTokenHash=await (await import("./d1-lock-adapter.mjs")).sha256Hex(interruptedOwnerToken);
    const result=await runner.recoverInterrupted({runId,ownerTokenHash,processTerminationConfirmed:true,
      approvalId:"job4b-recovery-approval",actor:"job4b-recovery-operator",at:now()});
    return json(result);
   }catch(error){return json({error:error.code||"RECOVERY_FAILED",message:error.message},500);}
  }
  if(request.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);
  if(!env.AUTH_TOKEN||request.headers.get("authorization")!==`Bearer ${env.AUTH_TOKEN}`)return json({error:"UNAUTHORIZED"},401);
  let input;try{input=await request.json();}catch{return json({error:"INVALID_JSON"},400);}
  try{return json(await dispatch(input,env));}
  catch(error){return json({error:error.code||"RUNNER_ERROR",message:error.message},400);}
 }
};
