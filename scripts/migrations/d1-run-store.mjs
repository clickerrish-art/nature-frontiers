const DB_ID = "89be73af-ebaf-4c19-b75a-9871adb8ba3c";
const WORKER = "nature-frontiers-staging";
const REHEARSAL_DB_ID = "a12fb838-1bd1-4811-9cf1-2ad5b21089d4";
const REHEARSAL_WORKER = "nf-adapter-worker-rehearsal";
function allowedTarget(target) { return Boolean(target && ((target.environment==="staging" && target.databaseId===DB_ID && target.worker===WORKER) || (target.environment==="rehearsal" && target.databaseId===REHEARSAL_DB_ID && target.worker===REHEARSAL_WORKER))); }
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class D1MigrationRunError extends Error {
  constructor(code, message) { super(message); this.name = "D1MigrationRunError"; this.code = code; }
}
function fail(code, message) { throw new D1MigrationRunError(code, message); }
function validate({runId,planSha256,manifestSha256,target,actor,at,reason}) {
  if (!UUID.test(runId ?? "")) fail("INVALID_RUN_ID","runId must be a UUID.");
  if (!SHA.test(planSha256 ?? "") || !SHA.test(manifestSha256 ?? "")) fail("INVALID_HASH","Plan and manifest must be SHA-256.");
  if (!allowedTarget(target)) fail("TARGET_DENIED","Target must exactly match the pinned staging or isolated disposable rehearsal resource.");
  if (typeof actor !== "string" || !actor.trim() || actor.length > 200) fail("INVALID_ACTOR","An auditable actor is required.");
  if (typeof reason !== "string" || !reason.trim() || reason.length > 1000) fail("INVALID_REASON","An auditable reason is required.");
  if (typeof at !== "string" || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) fail("INVALID_TIMESTAMP","Timestamp must be canonical ISO-8601 UTC.");
}
function validateTransition({runId,expectedPlanSha256,expectedManifestSha256,target,actor,approvalId,at,reason}, needsApproval) {
  if (!UUID.test(runId ?? "")) fail("INVALID_RUN_ID","runId must be a UUID.");
  if (!SHA.test(expectedPlanSha256 ?? "") || !SHA.test(expectedManifestSha256 ?? "")) fail("INVALID_HASH","Expected plan and manifest hashes must be SHA-256.");
  if (!allowedTarget(target)) fail("TARGET_DENIED","Transition target must exactly match the pinned staging or isolated disposable rehearsal resource.");
  if (typeof actor !== "string" || !actor.trim() || actor.length > 200) fail("INVALID_ACTOR","An auditable transition actor is required.");
  if (needsApproval && (typeof approvalId !== "string" || !approvalId.trim() || approvalId.length > 200)) fail("APPROVAL_REQUIRED","An explicit approval reference is required.");
  if (typeof reason !== "string" || !reason.trim() || reason.length > 1000) fail("INVALID_REASON","An auditable reason is required.");
  if (typeof at !== "string" || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) fail("INVALID_TIMESTAMP","Timestamp must be canonical ISO-8601 UTC.");
}
const stmt=(db,sql,...params)=>db.prepare(sql).bind(...params);
const changes=result=>Number(result?.meta?.changes??0);

export class D1MigrationRunStore {
  constructor(db) {
    if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") fail("INVALID_D1_BINDING","A Cloudflare D1Database binding is required.");
    this.db=db;
  }
  async create({runId,planSha256,manifestSha256,target,actor,at=new Date().toISOString(),reason="Offline dry-run plan recorded"}) {
    validate({runId,planSha256,manifestSha256,target,actor,at,reason});
    const r=await this.db.batch([
      stmt(this.db,`INSERT INTO nf_migration_runs(run_id,plan_sha256,manifest_sha256,target_database_id,worker_name,actor,state,revision,approval_id,created_at,updated_at,reason) VALUES(?,?,?,?,?,?,'PLANNED',0,NULL,?,?,?)`,runId,planSha256,manifestSha256,target.databaseId,target.worker,actor.trim(),at,at,reason.trim()),
      stmt(this.db,`INSERT INTO nf_migration_run_events(run_id,revision,state,occurred_at,actor,reason,approval_id) SELECT run_id,revision,state,created_at,actor,reason,NULL FROM nf_migration_runs WHERE run_id=? AND state='PLANNED' AND revision=0`,runId)
    ]);
    return {created:changes(r[0])===1 && changes(r[1])===1};
  }
  async approve({runId,expectedPlanSha256,expectedManifestSha256,target,actor,approvalId,at=new Date().toISOString(),reason="Explicit owner approval recorded"}) {
    validateTransition({runId,expectedPlanSha256,expectedManifestSha256,target,actor,approvalId,at,reason},true);
    const approval=approvalId.trim();
    const r=await this.db.batch([
      stmt(this.db,`UPDATE nf_migration_runs SET state='APPROVED',revision=revision+1,approval_id=?,updated_at=?,reason=? WHERE run_id=? AND state='PLANNED' AND revision=0 AND plan_sha256=? AND manifest_sha256=? AND target_database_id=? AND worker_name=?`,approval,at,reason.trim(),runId,expectedPlanSha256,expectedManifestSha256,target.databaseId,target.worker),
      stmt(this.db,`INSERT OR IGNORE INTO nf_migration_run_events(run_id,revision,state,occurred_at,actor,reason,approval_id) SELECT run_id,revision,state,updated_at,?,reason,approval_id FROM nf_migration_runs WHERE run_id=? AND state='APPROVED' AND revision=1 AND updated_at=? AND approval_id=? AND plan_sha256=? AND manifest_sha256=?`,actor.trim(),runId,at,approval,expectedPlanSha256,expectedManifestSha256)
    ]);
    return {approved:changes(r[0])===1 && changes(r[1])===1};
  }
  async reject({runId,expectedPlanSha256,expectedManifestSha256,target,actor,at=new Date().toISOString(),reason}) {
    validateTransition({runId,expectedPlanSha256,expectedManifestSha256,target,actor,at,reason},false);
    const r=await this.db.batch([
      stmt(this.db,`UPDATE nf_migration_runs SET state='REFUSED',revision=revision+1,approval_id=NULL,updated_at=?,reason=? WHERE run_id=? AND state='PLANNED' AND revision=0 AND plan_sha256=? AND manifest_sha256=? AND target_database_id=? AND worker_name=?`,at,reason.trim(),runId,expectedPlanSha256,expectedManifestSha256,target.databaseId,target.worker),
      stmt(this.db,`INSERT OR IGNORE INTO nf_migration_run_events(run_id,revision,state,occurred_at,actor,reason,approval_id) SELECT run_id,revision,state,updated_at,?,reason,NULL FROM nf_migration_runs WHERE run_id=? AND state='REFUSED' AND revision=1 AND updated_at=? AND plan_sha256=? AND manifest_sha256=?`,actor.trim(),runId,at,expectedPlanSha256,expectedManifestSha256)
    ]);
    return {rejected:changes(r[0])===1 && changes(r[1])===1};
  }
  async get(runId) {
    if (!UUID.test(runId??"")) fail("INVALID_RUN_ID","runId must be a UUID.");
    const row=await this.db.prepare(`SELECT run_id,plan_sha256,manifest_sha256,target_database_id,worker_name,actor,state,revision,approval_id,created_at,updated_at,reason FROM nf_migration_runs WHERE run_id=?`).bind(runId).first();
    if (!row) return null;
    return {runId:row.run_id,planSha256:row.plan_sha256,manifestSha256:row.manifest_sha256,target:{environment:row.target_database_id===REHEARSAL_DB_ID?"rehearsal":"staging",databaseId:row.target_database_id,worker:row.worker_name},actor:row.actor,state:row.state,revision:row.revision,approvalId:row.approval_id,createdAt:row.created_at,updatedAt:row.updated_at,reason:row.reason};
  }
  async listEvents(runId) {
    if (!UUID.test(runId??"")) fail("INVALID_RUN_ID","runId must be a UUID.");
    const result=await this.db.prepare(`SELECT run_id,revision,state,occurred_at,actor,reason,approval_id FROM nf_migration_run_events WHERE run_id=? ORDER BY revision`).bind(runId).all();
    return result.results ?? [];
  }
}
