import test from "node:test";
import assert from "node:assert/strict";
import {runnerPolicy,classifyInterruptedAttempt} from "../workers/nature-frontiers-staging-recovered/deployed-version-26/runner.mjs";
import {evaluateMetaDispatchGate,dispatchMetaPost} from "../workers/nature-frontiers-staging-recovered/deployed-version-26/meta-dispatch.mjs";

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
