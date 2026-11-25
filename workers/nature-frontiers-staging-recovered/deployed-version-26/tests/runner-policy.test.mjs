import test from "node:test";
import assert from "node:assert/strict";
import {runnerPolicy,classifyInterruptedAttempt} from "../runner.mjs";
import {evaluateMetaDispatchGate,dispatchMetaPost} from "../meta-dispatch.mjs";

test("runner only accepts exact fail-closed dry-run controls",()=>{
 assert.equal(runnerPolicy([{key:"emergency_stop",enabled:1},{key:"publishing_enabled",enabled:0},{key:"dry_run",enabled:1}]).mayRunDryRun,true);
 assert.equal(runnerPolicy([{key:"emergency_stop",enabled:0},{key:"publishing_enabled",enabled:0},{key:"dry_run",enabled:1}]).mayRunDryRun,false);
 assert.equal(runnerPolicy([{key:"emergency_stop",enabled:1},{key:"publishing_enabled",enabled:1},{key:"dry_run",enabled:0}]).mayRunDryRun,false);
 assert.equal(runnerPolicy([]).mayRunDryRun,false);
});
test("runner never authorizes provider publishing",()=>{
 assert.equal(runnerPolicy([{key:"emergency_stop",enabled:0},{key:"publishing_enabled",enabled:1},{key:"dry_run",enabled:0}]).mayPublish,false);
});
test("interrupted provider reservations become ambiguous and are never retried",()=>{
 assert.equal(classifyInterruptedAttempt({state:"reserved"}),"ambiguous_no_retry");
 assert.equal(classifyInterruptedAttempt({state:"confirmed"}),"ambiguous_no_retry");
 assert.equal(classifyInterruptedAttempt({state:"ambiguous"}),"ambiguous_no_retry");
 assert.equal(classifyInterruptedAttempt(null),"safe_to_hold");
 assert.equal(classifyInterruptedAttempt(null,"publishing"),"ambiguous_no_retry");
 assert.equal(classifyInterruptedAttempt({state:"failed"}),"safe_to_hold");
});
test("Meta dispatch fails closed with missing authorization and evidence",()=>{
 const gate=evaluateMetaDispatchGate();
 assert.equal(gate.allowed,false);
 assert.equal(gate.sideEffectPerformed,false);
 assert.ok(gate.blockers.includes("exact_one_shot_owner_authorization_missing"));
});
test("Meta dispatch adapter performs no network side effect",async()=>{
 const result=await dispatchMetaPost();
 assert.equal(result.ok,false);
 assert.equal(result.dispatchExecuted,false);
});

test("signed approval receipt must match the exact content, media and platform binding",async()=>{
 const receipt={id:"receipt-1",contentId:"content-1",platform:"facebook",decision:"approved",reviewerId:"owner",revision:2,payloadSha256:"a".repeat(64),mediaSha256:"b".repeat(64),rightsEvidenceSha256:"c".repeat(64),approvedAt:"2026-11-25T10:00:00.000Z",expiresAt:"2026-12-02T10:00:00.000Z",policyVersion:"nf-media-release-v1"};
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode("test-session-secret"),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const signature=[...new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(JSON.stringify(receipt))))].map(x=>x.toString(16).padStart(2,"0")).join("");
 const raw=JSON.stringify({...receipt,signature});
 assert.equal(await verifySignedApprovalReceipt(raw,"test-session-secret",receipt),true);
 assert.equal(await verifySignedApprovalReceipt(raw,"test-session-secret",{...receipt,mediaSha256:"d".repeat(64)}),false);
 assert.equal(await verifySignedApprovalReceipt(raw,"wrong-secret",receipt),false);
});
