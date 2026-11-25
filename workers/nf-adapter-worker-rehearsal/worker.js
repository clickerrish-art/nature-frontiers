import { D1MigrationLockStore, sha256Hex, rehearsalLockTarget } from "./d1-lock-adapter.mjs";
import { D1MigrationRunStore } from "./d1-run-store.mjs";
import { D1MigrationRunOrchestrator } from "./run-orchestrator.mjs";

const json = (value, status=200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store" }
});
const fail = (code, message) => Object.assign(new Error(message), { code });

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return json({ error:"METHOD_NOT_ALLOWED" },405);
    if (!env.DB || !env.AUTH_TOKEN) return json({ error:"HARNESS_NOT_CONFIGURED" },503);
    const supplied = request.headers.get("authorization") || "";
    if (supplied !== `Bearer ${env.AUTH_TOKEN}`) return json({ error:"UNAUTHORIZED" },401);
    let input;
    try { input = await request.json(); } catch { return json({ error:"INVALID_JSON" },400); }
    const store = new D1MigrationRunStore(env.DB);
    const locks = new D1MigrationLockStore(env.DB);
    const orchestrator = new D1MigrationRunOrchestrator({ runStore:store, lockStore:locks, target:rehearsalLockTarget });
    try {
      switch (input.action) {
        case "health": {
          const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name LIKE 'nf_migration_%'").first();
          return json({ ok:true, target:rehearsalLockTarget, controlTables:row?.count ?? 0 });
        }
        case "recordPlan": {
          const result = await orchestrator.recordPlan({
            planResult: {
              mode:"PLAN_ONLY", executionEnabled:false,
              sideEffects:{d1Reads:false,d1Writes:false,lockAcquired:false,sqlExecuted:false,workerDeployed:false},
              plan:{ mode:"READ_ONLY_DRY_RUN", executionEnabled:false, target:rehearsalLockTarget,
                planSha256:input.planSha256, manifestSha256:input.manifestSha256 }
            },
            runId:input.runId, actor:input.actor, at:input.at, reason:input.reason || "Disposable D1 adapter rehearsal"
          });
          return json(result);
        }
        case "approve": {
          const run = await store.get(input.runId);
          if (!run) return json({ error:"RUN_NOT_FOUND" },404);
          return json(await orchestrator.approve({
            runId:run.runId, expectedPlanSha256:run.planSha256,
            expectedManifestSha256:run.manifestSha256, actor:input.actor,
            approvalId:input.approvalId, at:input.at, reason:input.reason
          }));
        }
        case "acquire": {
          const run = await store.get(input.runId);
          if (!run) return json({ error:"RUN_NOT_FOUND" },404);
          const ownerTokenHash = await sha256Hex(input.ownerToken);
          return json(await locks.acquire({ run, target:rehearsalLockTarget, ownerTokenHash, at:input.at }));
        }
        case "release": {
          const ownerTokenHash = await sha256Hex(input.ownerToken);
          return json(await locks.release({ runId:input.runId, ownerTokenHash, at:input.at }));
        }
        case "recover": {
          const ownerTokenHash = await sha256Hex(input.ownerToken);
          return json(await orchestrator.recoverInterrupted({
            runId:input.runId, ownerTokenHash,
            processTerminationConfirmed:input.processTerminationConfirmed,
            approvalId:input.approvalId, actor:input.actor, at:input.at
          }));
        }
        case "inspect": {
          const run = await orchestrator.inspect(input.runId);
          return json({ run, lock:await locks.read(), lockEvents:await locks.listEvents(input.runId) });
        }
        default: return json({ error:"UNKNOWN_ACTION" },400);
      }
    } catch (error) {
      return json({ error:error.code || "REHEARSAL_ERROR", message:error.message },400);
    }
  }
};
