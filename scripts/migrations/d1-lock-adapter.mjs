const STAGING_DATABASE_ID = "89be73af-ebaf-4c19-b75a-9871adb8ba3c";
const STAGING_WORKER = "nature-frontiers-staging";
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class D1MigrationLockError extends Error {
  constructor(code, message) { super(message); this.name = "D1MigrationLockError"; this.code = code; }
}
function fail(code, message) { throw new D1MigrationLockError(code, message); }
function assertTarget(target) {
  if (!target || target.environment !== "staging" || target.databaseId !== STAGING_DATABASE_ID || target.worker !== STAGING_WORKER) {
    fail("TARGET_DENIED", "Persistent migration locks are restricted to the pinned Nature Frontiers staging target.");
  }
}
function assertHash(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) fail("INVALID_HASH", `${label} must be a lowercase SHA-256 digest.`);
}
function assertIso(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail("INVALID_TIMESTAMP", `${label} must be canonical ISO-8601 UTC.`);
  }
}
function assertRun(run, target) {
  assertTarget(target);
  if (!run || !UUID.test(run.runId ?? "") || run.state !== "APPROVED") fail("RUN_NOT_APPROVED", "Only a persisted, approved run may acquire the D1 lock.");
  if (run.target?.databaseId !== target.databaseId || run.target?.worker !== target.worker || run.target?.environment !== target.environment) {
    fail("RUN_TARGET_MISMATCH", "Run target does not exactly match the pinned staging target.");
  }
  assertHash(run.planSha256, "planSha256");
  assertHash(run.manifestSha256, "manifestSha256");
}
function statement(db, sql, ...params) { return db.prepare(sql).bind(...params); }
function changes(result) { return Number(result?.meta?.changes ?? 0); }

/** SHA-256 owner-token digest; never persist or log the raw token. */
export async function sha256Hex(value) {
  if (typeof value !== "string" || value.length < 32) fail("INVALID_OWNER_TOKEN", "Owner token must contain at least 32 characters.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Persistent Cloudflare D1 lock adapter.
 *
 * Requires the schema in d1-lock-schema.sql. All multi-statement mutations use
 * D1Database.batch(), whose transaction/rollback behavior must be verified on
 * disposable D1 before any live runner integration. No DDL is issued here.
 */
export class D1MigrationLockStore {
  constructor(db) {
    if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
      fail("INVALID_D1_BINDING", "A Cloudflare D1Database binding with prepare() and batch() is required.");
    }
    this.db = db;
  }

  async read() {
    return this.db.prepare(`SELECT lock_key, target_database_id, worker_name, run_id, plan_sha256, manifest_sha256, owner_token_hash, acquired_at, expires_at, recovery_approval_id FROM nf_migration_lock WHERE lock_key='global'`).first();
  }

  async acquire({ run, target, ownerTokenHash, at = new Date().toISOString() }) {
    assertRun(run, target);
    assertHash(ownerTokenHash, "ownerTokenHash");
    assertIso(at, "acquiredAt");
    const eventKey = `${run.runId}:ACQUIRED:${ownerTokenHash}`;
    const results = await this.db.batch([
      statement(this.db, `INSERT INTO nf_migration_lock(lock_key,target_database_id,worker_name,run_id,plan_sha256,manifest_sha256,owner_token_hash,acquired_at,expires_at,recovery_approval_id)
        SELECT 'global',target_database_id,worker_name,run_id,plan_sha256,manifest_sha256,?,?,NULL,NULL
        FROM nf_migration_runs
        WHERE run_id=? AND state='APPROVED' AND target_database_id=? AND worker_name=? AND plan_sha256=? AND manifest_sha256=?
        ON CONFLICT(lock_key) DO NOTHING`,
        ownerTokenHash, at, run.runId, target.databaseId, target.worker, run.planSha256, run.manifestSha256),
      statement(this.db, `INSERT OR IGNORE INTO nf_migration_lock_events(event_key,run_id,event_type,owner_token_hash,occurred_at,approval_id)
        SELECT ?,run_id,'ACQUIRED',owner_token_hash,acquired_at,NULL FROM nf_migration_lock
        WHERE lock_key='global' AND run_id=? AND owner_token_hash=? AND acquired_at=?`,
        eventKey, run.runId, ownerTokenHash, at),
      statement(this.db, `UPDATE nf_migration_runs SET state='LOCKED',revision=revision+1,updated_at=?,reason='Persistent D1 lock acquired'
        WHERE run_id=? AND state='APPROVED' AND EXISTS(SELECT 1 FROM nf_migration_lock WHERE lock_key='global' AND run_id=? AND owner_token_hash=?)`,
        at, run.runId, run.runId, ownerTokenHash),
      statement(this.db, `INSERT OR IGNORE INTO nf_migration_run_events(run_id,revision,state,occurred_at,actor,reason,approval_id)
        SELECT run_id,revision,state,updated_at,actor,reason,approval_id FROM nf_migration_runs WHERE run_id=? AND state='LOCKED'`,
        run.runId)
    ]);
    const current = await this.read();
    const acquired = changes(results[0]) === 1 && changes(results[2]) === 1;
    const alreadyOwned = Boolean(current && current.run_id === run.runId && current.owner_token_hash === ownerTokenHash);
    return { acquired, alreadyOwned, lock: current };
  }

  async release({ runId, ownerTokenHash, at = new Date().toISOString() }) {
    if (!UUID.test(runId ?? "")) fail("INVALID_RUN_ID", "runId must be a UUID.");
    assertHash(ownerTokenHash, "ownerTokenHash");
    assertIso(at, "releasedAt");
    const eventKey = `${runId}:RELEASED:${ownerTokenHash}`;
    const results = await this.db.batch([
      statement(this.db, `INSERT OR IGNORE INTO nf_migration_lock_events(event_key,run_id,event_type,owner_token_hash,occurred_at,approval_id)
        SELECT ?,run_id,'RELEASED',owner_token_hash,?,NULL FROM nf_migration_lock
        WHERE lock_key='global' AND run_id=? AND owner_token_hash=? AND recovery_approval_id IS NULL`,
        eventKey, at, runId, ownerTokenHash),
      statement(this.db, `DELETE FROM nf_migration_lock WHERE lock_key='global' AND run_id=? AND owner_token_hash=? AND recovery_approval_id IS NULL`,
        runId, ownerTokenHash),
      statement(this.db, `UPDATE nf_migration_runs SET state='RELEASED',revision=revision+1,updated_at=?,reason='Persistent D1 lock released by owner'
        WHERE run_id=? AND state='LOCKED' AND NOT EXISTS(SELECT 1 FROM nf_migration_lock WHERE lock_key='global')
        AND EXISTS(SELECT 1 FROM nf_migration_lock_events WHERE event_key=? AND event_type='RELEASED')`,
        at, runId, eventKey),
      statement(this.db, `INSERT OR IGNORE INTO nf_migration_run_events(run_id,revision,state,occurred_at,actor,reason,approval_id)
        SELECT run_id,revision,state,updated_at,actor,reason,approval_id FROM nf_migration_runs WHERE run_id=? AND state='RELEASED' AND updated_at=?`,
        runId, at)
    ]);
    return { released: changes(results[1]) === 1 };
  }

  async recoverStale({ runId, ownerTokenHash, processTerminationConfirmed, approvalId, actor, at = new Date().toISOString() }) {
    if (!UUID.test(runId ?? "")) fail("INVALID_RUN_ID", "runId must be a UUID.");
    assertHash(ownerTokenHash, "ownerTokenHash");
    assertIso(at, "recoveredAt");
    if (processTerminationConfirmed !== true) fail("PROCESS_MAY_RESUME", "Stale-lock recovery requires confirmation the original process cannot resume.");
    if (typeof approvalId !== "string" || !approvalId.trim() || approvalId.length > 200) fail("RECOVERY_APPROVAL_REQUIRED", "A bounded, explicit recovery approval reference is required.");
    const approval = approvalId.trim();
    if (typeof actor !== "string" || !actor.trim() || actor.length > 200) fail("INVALID_ACTOR", "An auditable recovery operator identity is required.");
    const eventKey = `${runId}:STALE_RECOVERED:${ownerTokenHash}:${approval}`;
    const results = await this.db.batch([
      statement(this.db, `UPDATE nf_migration_lock SET recovery_approval_id=?
        WHERE lock_key='global' AND run_id=? AND owner_token_hash=? AND recovery_approval_id IS NULL`,
        approval, runId, ownerTokenHash),
      statement(this.db, `INSERT OR IGNORE INTO nf_migration_lock_events(event_key,run_id,event_type,owner_token_hash,occurred_at,approval_id)
        SELECT ?,run_id,'STALE_RECOVERED',owner_token_hash,?,recovery_approval_id FROM nf_migration_lock
        WHERE lock_key='global' AND run_id=? AND owner_token_hash=? AND recovery_approval_id=?`,
        eventKey, at, runId, ownerTokenHash, approval),
      statement(this.db, `DELETE FROM nf_migration_lock WHERE lock_key='global' AND run_id=? AND owner_token_hash=? AND recovery_approval_id=?`,
        runId, ownerTokenHash, approval),
      statement(this.db, `UPDATE nf_migration_runs SET state='AMBIGUOUS',revision=revision+1,updated_at=?,reason='Stale lock recovered; run requires manual reconciliation'
        WHERE run_id=? AND state='LOCKED' AND NOT EXISTS(SELECT 1 FROM nf_migration_lock WHERE lock_key='global')
        AND EXISTS(SELECT 1 FROM nf_migration_lock_events WHERE event_key=? AND event_type='STALE_RECOVERED' AND approval_id=?)`,
        at, runId, eventKey, approval),
      statement(this.db, `INSERT OR IGNORE INTO nf_migration_run_events(run_id,revision,state,occurred_at,actor,reason,approval_id)
        SELECT run_id,revision,state,updated_at,?,reason,approval_id FROM nf_migration_runs WHERE run_id=? AND state='AMBIGUOUS' AND updated_at=?`,
        actor.trim(), runId, at)
    ]);
    return { recovered: changes(results[2]) === 1 };
  }

  async listEvents(runId) {
    if (!UUID.test(runId ?? "")) fail("INVALID_RUN_ID", "runId must be a UUID.");
    const result = await this.db.prepare(`SELECT event_type,owner_token_hash,occurred_at,approval_id FROM nf_migration_lock_events WHERE run_id=? ORDER BY occurred_at,event_key`).bind(runId).all();
    return result.results ?? [];
  }
}

export const stagingLockTarget = Object.freeze({ environment:"staging", databaseId:STAGING_DATABASE_ID, worker:STAGING_WORKER });
