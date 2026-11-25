const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256=/^[a-f0-9]{64}$/;
const MAX_MANIFEST_BYTES=128*1024;
const MAX_ARTIFACT_BYTES=768*1024;
const MAX_BODY_BYTES=1024*1024;

function fail(code,message){throw Object.assign(new Error(message),{code});}
function requiredString(value,label,max=200){
 if(typeof value!=="string"||!value.trim()||value.length>max)fail("INVALID_"+label.toUpperCase().replaceAll(" ","_"),label+" is required and must be at most "+max+" characters.");
 return value.trim();
}
function requiredOwnerToken(value){\n const token=requiredString(value,"owner token",512);\n if(token.length<32)fail("INVALID_OWNER_TOKEN","Owner token must contain at least 32 characters.");\n return token;\n}\nfunction requiredHash(value,label){
 if(typeof value!=="string"||!SHA256.test(value))fail("INVALID_HASH",label+" must be the exact lowercase SHA-256 hash displayed for this plan.");
 return value;
}
function decodeBase64(value,label){
 if(typeof value!=="string"||value.length%4!==0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))fail("INVALID_BASE64",label+" must be canonical base64.");
 let binary;try{binary=atob(value);}catch{fail("INVALID_BASE64",label+" is not valid base64.");}
 return Uint8Array.from(binary,char=>char.charCodeAt(0));
}
function assertKeys(input,allowed){
 for(const key of Object.keys(input))if(!allowed.includes(key))fail("UNKNOWN_FIELD","Unsupported field: "+key);
}
const at=()=>new Date().toISOString();

export async function dispatchOperatorAction(runner,input,{hashOwnerToken}={}){
 if(!input||typeof input!=="object"||Array.isArray(input))fail("INVALID_INPUT","Request body must be a JSON object.");
 const action=requiredString(input.action,"action",40);
 switch(action){
  case "createPlan":{
   assertKeys(input,["action","runId","actor","reason","manifestText","artifactsBase64","sourceCommit","runnerVersion"]);
   const manifestText=requiredString(input.manifestText,"manifest text",MAX_MANIFEST_BYTES);
   const manifestBytes=new TextEncoder().encode(manifestText);
   if(manifestBytes.byteLength>MAX_MANIFEST_BYTES)fail("MANIFEST_TOO_LARGE","Manifest exceeds the 128 KiB limit.");
   let supplied=input.artifactsBase64??{};
   if(!supplied||typeof supplied!=="object"||Array.isArray(supplied))fail("INVALID_ARTIFACT_MAP","artifactsBase64 must be an object mapping manifest paths to base64 bytes.");
   const artifacts=new Map();let total=0;
   for(const [path,encoded] of Object.entries(supplied)){
    if(typeof path!=="string"||!path||path.length>500)fail("INVALID_ARTIFACT_PATH","Artifact path is invalid.");
    const bytes=decodeBase64(encoded,"Artifact "+path);total+=bytes.byteLength;
    if(total>MAX_ARTIFACT_BYTES)fail("ARTIFACTS_TOO_LARGE","Combined artifact bytes exceed 768 KiB.");
    artifacts.set(path,bytes);
   }
   const runId=input.runId?requiredString(input.runId,"run ID",36):crypto.randomUUID();
   if(!UUID.test(runId))fail("INVALID_RUN_ID","runId must be a UUID.");
   const actor=requiredString(input.actor,"actor");
   const reason=requiredString(input.reason,"reason",1000);
   const planResult=runner.plan({manifestBytes,artifacts,sourceCommit:input.sourceCommit??null,runnerVersion:input.runnerVersion??"0.1.0"});
   const persisted=await runner.recordPlan({planResult,runId,actor,at:at(),reason});
   return {plan:planResult.plan,run:persisted.run,events:persisted.events,capabilities:runner.capabilities};
  }
  case "approve":{
   assertKeys(input,["action","runId","expectedPlanSha256","expectedManifestSha256","actor","approvalId","reason"]);
   const runId=requiredString(input.runId,"run ID",36);
   return runner.approve({runId,expectedPlanSha256:requiredHash(input.expectedPlanSha256,"Plan hash"),
    expectedManifestSha256:requiredHash(input.expectedManifestSha256,"Manifest hash"),
    actor:requiredString(input.actor,"actor"),approvalId:requiredString(input.approvalId,"approval ID"),
    reason:requiredString(input.reason,"reason",1000),at:at()});
  }
  case "acquire":{
   assertKeys(input,["action","runId","ownerToken","actor"]);
   return runner.acquire({runId:requiredString(input.runId,"run ID",36),
    ownerToken:requiredOwnerToken(input.ownerToken),actor:requiredString(input.actor,"actor"),at:at()});
  }
  case "release":{
   assertKeys(input,["action","runId","ownerToken","actor"]);
   return runner.release({runId:requiredString(input.runId,"run ID",36),
    ownerToken:requiredString(input.ownerToken,"owner token",512),actor:requiredString(input.actor,"actor"),at:at()});
  }
  case "inspect":{
   assertKeys(input,["action","runId"]);
   const result=await runner.inspect(requiredString(input.runId,"run ID",36));
   if(!result)fail("RUN_NOT_FOUND","No persisted run exists for this ID.");
   return result;
  }
  case "recover":{
   assertKeys(input,["action","runId","ownerToken","processTerminationConfirmed","approvalId","actor"]);
   if(input.processTerminationConfirmed!==true)fail("PROCESS_MAY_RESUME","Confirm that the original process cannot resume before recovery.");
   const ownerToken=requiredString(input.ownerToken,"owner token",512);
   return runner.recoverInterrupted({runId:requiredString(input.runId,"run ID",36),
    ownerTokenHash:await (await import("./d1-lock-adapter.mjs")).sha256Hex(ownerToken),
    processTerminationConfirmed:true,approvalId:requiredString(input.approvalId,"recovery approval ID"),
    actor:requiredString(input.actor,"actor"),at:at()});
  }
  default:fail("UNKNOWN_ACTION","Unsupported operator action.");
 }
}

export function operatorHtml(nonce){
 const manifest=JSON.stringify({schemaVersion:1,streamId:"nf.job4c.rehearsal",target:{environment:"rehearsal",databaseId:"a12fb838-1bd1-4811-9cf1-2ad5b21089d4",worker:"nf-adapter-worker-rehearsal"},migrations:[]},null,2);
 return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nature Frontiers · Migration Run Operator</title>
<style nonce="${nonce}">
:root{color-scheme:dark;font:16px/1.5 system-ui,sans-serif;background:#101820;color:#eef3f7}body{max-width:980px;margin:2rem auto;padding:0 1rem}h1,h2{line-height:1.2}section{border:1px solid #3b4b59;border-radius:12px;padding:1rem;margin:1rem 0;background:#18232d}label{display:block;margin:.65rem 0 .2rem}input,textarea,button{font:inherit;color:inherit;background:#0e171f;border:1px solid #526575;border-radius:7px;padding:.6rem;width:100%;box-sizing:border-box}textarea{min-height:7rem;font-family:ui-monospace,monospace}button{width:auto;cursor:pointer;background:#244e69;margin-top:.7rem}button:disabled{opacity:.5;cursor:wait}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem}.hint{color:#b6c6d2;font-size:.9rem}.danger{color:#ffc58f}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0a1117;border-radius:8px;padding:1rem;max-height:28rem;overflow:auto}.inline{display:flex;gap:.5rem;align-items:center}.inline input{width:auto}.status{min-height:1.5rem;color:#a8d8b0}
</style></head><body>
<h1>Migration run operator</h1>
<p class="hint">Authenticated, plan-only controls for the disposable rehearsal target. This interface cannot execute SQL/DDL or deploy a Worker. Do not use a production or staging credential here.</p>
<section><h2>Authentication</h2><label for="token">Rehearsal operator bearer token</label><input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="Paste the AUTH_TOKEN secret">
<p class="hint">Held only in this page's memory. It is not written to browser storage. Clear it and close this page when finished.</p><div class="status" id="status" role="status"></div></section>
<section><h2>1 · Create and persist a plan</h2><label for="manifest">Exact UTF-8 manifest JSON</label><textarea id="manifest">${manifest}</textarea>
<label for="artifacts">Artifact bytes as JSON: path → base64 (use {} for an empty plan)</label><textarea id="artifacts">{}</textarea>
<div class="grid"><div><label for="runId">Run ID (optional UUID)</label><input id="runId" placeholder="Generated if blank"></div><div><label for="actor">Operator / planner identity</label><input id="actor" value="job4c-operator"></div></div>
<label for="reason">Planning reason</label><input id="reason" value="Operator-created rehearsal dry-run plan">
<button id="create">Create plan · persist PLANNED</button>
<p class="hint">Manifest bytes are the exact UTF-8 bytes of the text above. Every declared migration must have its exact artifact bytes supplied as base64.</p></section>
<section><h2>2 · Approve exact hashes</h2><label for="approveRun">Run ID</label><input id="approveRun"><label for="planHash">Expected plan SHA-256</label><input id="planHash" spellcheck="false"><label for="manifestHash">Expected manifest SHA-256</label><input id="manifestHash" spellcheck="false"><label for="approvalId">Approval reference</label><input id="approvalId"><label for="approver">Approver identity</label><input id="approver" value="job4c-approver"><label for="approvalReason">Approval reason</label><input id="approvalReason" value="Reviewed exact plan and manifest hashes"><button id="approve">Approve these exact hashes</button></section>
<section><h2>3 · Lock ownership</h2><label for="lockRun">Run ID</label><input id="lockRun"><label for="ownerToken">Owner token (minimum 32 characters)</label><input id="ownerToken" type="password" autocomplete="off"><label for="owner">Named lock operator</label><input id="owner" value="job4c-lock-owner"><div class="grid"><button id="acquire">Acquire lock (approved runs only)</button><button id="release">Release own lock only</button></div></section>
<section><h2>4 · Inspect persisted history</h2><label for="inspectRun">Run ID</label><input id="inspectRun"><button id="inspect">Inspect run, lock and audit events</button></section>
<section><h2>5 · Approved interruption recovery</h2><p class="danger">Recovery removes a stale lock and marks the run AMBIGUOUS. It does not retry or resume migration work.</p><label for="recoverRun">Run ID</label><input id="recoverRun"><label for="recoverOwner">Original lock owner token</label><input id="recoverOwner" type="password" autocomplete="off"><label for="recoveryApproval">Recovery approval reference</label><input id="recoveryApproval"><label for="recoveryActor">Recovery operator identity</label><input id="recoveryActor" value="job4c-recovery-operator"><label class="inline"><input id="terminationConfirmed" type="checkbox"> I confirm the original process has terminated and cannot resume.</label><button id="recover">Recover to AMBIGUOUS</button></section>
<section><h2>Result / audit output</h2><pre id="output" aria-live="polite">No operation submitted.</pre></section>
<script nonce="${nonce}">
(()=>{
 const el=id=>document.getElementById(id),out=el("output"),status=el("status");
 async function call(payload){
  const token=el("token").value;
  if(!token){status.textContent="Enter the rehearsal bearer token first.";return;}
  status.textContent="Submitting authenticated request…";
  const response=await fetch("/api/operator",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+token},body:JSON.stringify(payload),cache:"no-store",credentials:"same-origin"});
  const body=await response.json().catch(()=>({error:"INVALID_RESPONSE"}));
  out.textContent=JSON.stringify(body,null,2);status.textContent=response.ok?"Request completed (HTTP "+response.status+").":"Request refused (HTTP "+response.status+").";
  return body;
 }
 function bind(id,fn){el(id).addEventListener("click",async()=>{try{el(id).disabled=true;await fn();}catch(e){status.textContent="Request failed: "+e.message;}finally{el(id).disabled=false;}});}
 bind("create",async()=>{
  const body=await call({action:"createPlan",manifestText:el("manifest").value,artifactsBase64:JSON.parse(el("artifacts").value),runId:el("runId").value||undefined,actor:el("actor").value,reason:el("reason").value});
  if(body?.run){el("approveRun").value=body.run.runId;el("lockRun").value=body.run.runId;el("inspectRun").value=body.run.runId;el("recoverRun").value=body.run.runId;el("planHash").value=body.plan.planSha256;el("manifestHash").value=body.plan.manifestSha256;}
 });
 bind("approve",()=>call({action:"approve",runId:el("approveRun").value,expectedPlanSha256:el("planHash").value,expectedManifestSha256:el("manifestHash").value,approvalId:el("approvalId").value,actor:el("approver").value,reason:el("approvalReason").value}));
 bind("acquire",()=>call({action:"acquire",runId:el("lockRun").value,ownerToken:el("ownerToken").value,actor:el("owner").value}));
 bind("release",()=>call({action:"release",runId:el("lockRun").value,ownerToken:el("ownerToken").value,actor:el("owner").value}));
 bind("inspect",()=>call({action:"inspect",runId:el("inspectRun").value}));
 bind("recover",()=>call({action:"recover",runId:el("recoverRun").value,ownerToken:el("recoverOwner").value,processTerminationConfirmed:el("terminationConfirmed").checked,approvalId:el("recoveryApproval").value,actor:el("recoveryActor").value}));
 window.addEventListener("pagehide",()=>{el("token").value="";el("ownerToken").value="";el("recoverOwner").value="";});
})();
</script></body></html>`;
}
export const operatorLimits=Object.freeze({manifestBytes:MAX_MANIFEST_BYTES,artifactBytes:MAX_ARTIFACT_BYTES,bodyBytes:MAX_BODY_BYTES});
