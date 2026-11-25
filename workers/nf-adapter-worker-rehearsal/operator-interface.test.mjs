import test from "node:test";
import assert from "node:assert/strict";
import { dispatchOperatorAction, isOperatorAuthorized, operatorHtml, operatorLimits } from "./operator-interface.mjs";

const planHash="a".repeat(64),manifestHash="b".repeat(64),runId="123e4567-e89b-42d3-a456-426614174099";
function fakeRunner(){
 const calls=[];
 return {calls,capabilities:{planOnly:true,ddlExecution:false,schemaMutation:false,workerDeployment:false},
  plan(input){calls.push(["plan",input]);return {mode:"PLAN_ONLY",executionEnabled:false,plan:{planSha256:planHash,manifestSha256:manifestHash}};},
  async recordPlan(input){calls.push(["recordPlan",input]);return {run:{runId,state:"PLANNED"},events:[]};},
  async approve(input){calls.push(["approve",input]);return {approved:true};},
  async acquire(input){calls.push(["acquire",input]);return {acquired:true};},
  async release(input){calls.push(["release",input]);return {released:true};},
  async inspect(id){calls.push(["inspect",id]);return {run:{runId:id},events:[],lock:null,lockEvents:[]};},
  async recoverInterrupted(input){calls.push(["recover",input]);return {recovered:true};}
 };
}
test("plan creation uses exact UTF-8 manifest and decoded artifact bytes, then persists PLANNED",async()=>{
 const runner=fakeRunner(),manifestText='{"migrations":[]}',artifact=new TextEncoder().encode("SELECT 1;");
 const result=await dispatchOperatorAction(runner,{action:"createPlan",runId,actor:"planner",reason:"rehearsal",manifestText,artifactsBase64:{"m/1.sql":btoa(String.fromCharCode(...artifact))}});
 assert.equal(result.run.state,"PLANNED");assert.equal(runner.calls[0][1].manifestBytes instanceof Uint8Array,true);
 assert.equal(new TextDecoder().decode(runner.calls[0][1].manifestBytes),manifestText);
 assert.equal(new TextDecoder().decode(runner.calls[0][1].artifacts.get("m/1.sql")),"SELECT 1;");
});
test("approval forwards both operator-supplied exact hashes; it does not fetch and substitute them",async()=>{
 const runner=fakeRunner();
 await dispatchOperatorAction(runner,{action:"approve",runId,expectedPlanSha256:planHash,expectedManifestSha256:manifestHash,actor:"reviewer",approvalId:"approval-4c",reason:"hash review"});
 const call=runner.calls[0];assert.equal(call[0],"approve");assert.equal(call[1].expectedPlanSha256,planHash);assert.equal(call[1].expectedManifestSha256,manifestHash);
});
test("approval rejects absent or malformed hashes before calling runner",async()=>{
 const runner=fakeRunner();
 await assert.rejects(()=>dispatchOperatorAction(runner,{action:"approve",runId,actor:"reviewer",approvalId:"a",reason:"r"}),{code:"INVALID_HASH"});
 assert.equal(runner.calls.length,0);
});
test("recovery requires explicit process termination confirmation and approval",async()=>{
 const runner=fakeRunner(),ownerToken="x".repeat(40);
 await assert.rejects(()=>dispatchOperatorAction(runner,{action:"recover",runId,ownerToken,processTerminationConfirmed:false,approvalId:"recovery-1",actor:"operator"},{hashOwnerToken:async()=> "c".repeat(64)}),{code:"PROCESS_MAY_RESUME"});
 assert.equal(runner.calls.length,0);
 const result=await dispatchOperatorAction(runner,{action:"recover",runId,ownerToken,processTerminationConfirmed:true,approvalId:"recovery-1",actor:"operator"},{hashOwnerToken:async()=> "c".repeat(64)});
 assert.equal(result.recovered,true);assert.equal(runner.calls[0][0],"recover");assert.equal(runner.calls[0][1].processTerminationConfirmed,true);
});
test("owner operations require caller-supplied owner token and named actor",async()=>{
 const runner=fakeRunner();
 await assert.rejects(()=>dispatchOperatorAction(runner,{action:"release",runId,ownerToken:"short",actor:"operator"}),{code:"INVALID_OWNER_TOKEN"});
 assert.equal(runner.calls.length,0);
});
test("operator HTML keeps bearer and owner tokens ephemeral and contains no browser storage",()=>{
 const html=operatorHtml("testnonce");
 assert.match(html,/nonce="testnonce"/);assert.match(html,/authorization/);
 assert.doesNotMatch(html,/localStorage|sessionStorage|indexedDB/);
 assert.match(html,/expectedPlanSha256/);assert.match(html,/processTerminationConfirmed/);
 assert.equal(operatorLimits.bodyBytes,1024*1024);
});
test("unknown fields and unsupported actions fail closed",async()=>{
 const runner=fakeRunner();
 await assert.rejects(()=>dispatchOperatorAction(runner,{action:"executeDDL"}),{code:"UNKNOWN_ACTION"});
 await assert.rejects(()=>dispatchOperatorAction(runner,{action:"inspect",runId,sql:"DROP TABLE x"}),{code:"UNKNOWN_FIELD"});
 assert.equal(runner.calls.length,0);
});

test("operator authentication requires exact bearer token and rejects missing or wrong tokens",()=>{
 const secret="rehearsal-auth-token-that-is-at-least-32-characters";
 const request=authorization=>new Request("https://example.invalid/api/operator",{method:"POST",headers:authorization?{authorization}:{}});
 assert.equal(isOperatorAuthorized(request(null),secret),false);
 assert.equal(isOperatorAuthorized(request("Bearer wrong"),secret),false);
 assert.equal(isOperatorAuthorized(request("Bearer "+secret),secret),true);
 assert.equal(isOperatorAuthorized(request("Bearer "+secret),"short"),false);
});
