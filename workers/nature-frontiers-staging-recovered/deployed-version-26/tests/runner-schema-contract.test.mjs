import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";

const schema=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),"../../schema.snapshot.sql"),"utf8");
function table(name){
 const start=schema.indexOf(`CREATE TABLE ${name} (`);
 assert.notEqual(start,-1,`schema snapshot is missing table ${name}`);
 const end=schema.indexOf("\n);",start);
 assert.notEqual(end,-1,`table ${name} has no closing declaration`);
 return schema.slice(start,end);
}
function hasColumns(name,columns){
 const sql=table(name);
 const declared=new Set(sql.split("\n").slice(1).map(line=>line.trim().match(/^([a-z_][a-z0-9_]*)\s+(?:TEXT|INTEGER)/i)?.[1]).filter(Boolean));
 for(const column of columns)assert.ok(declared.has(column),`${name} is missing column ${column}`);
}

test("runner SQL column contract matches the recovered schema snapshot",()=>{
 hasColumns("system_controls",["key","enabled"]);
 hasColumns("schedule_slots",["id","content_id","platform","scheduled_at","state","idempotency_key","attempt_count","max_attempts","lease_token_hash","lease_expires_at","last_error_code","updated_at"]);
 hasColumns("worker_runs",["id","schedule_slot_id","worker_id","state","started_at","heartbeat_at","finished_at","error_code"]);
 hasColumns("publication_attempts",["id","idempotency_key","state","started_at","finished_at","error_code"]);
 hasColumns("audit_events",["id","event_type","content_id","actor","details_json","created_at"]);
 hasColumns("content_items",["id","media_sha256","status"]);
 hasColumns("content_targets",["content_id","platform","account_id","status"]);
 hasColumns("meta_connections",["id","provider","page_id","instagram_business_account_id","status","identity_verified_at","permissions_verified_at","instagram_identity_verified_at","token_expires_at"]);
 hasColumns("content_revisions",["content_id","revision","payload_sha256"]);
 hasColumns("media_assets",["media_sha256","validation_status"]);
 hasColumns("media_rights_evidence",["id","media_sha256","rights_status","evidence_sha256","permitted_platforms_json","permitted_uses_json","expires_at","revoked_at","created_at"]);
 hasColumns("approval_receipts",["id","content_id","platform","decision","reviewer_id","payload_sha256","rights_evidence_sha256","policy_version","signed_receipt","approved_at","expires_at","revoked_at","created_at"]);
});

test("runner-required state and platform values are permitted by schema checks",()=>{
 assert.ok(table("schedule_slots").includes("CHECK (state IN ('held','ready','leased','publishing','published','failed','cancelled','dead_letter'))"));
 assert.ok(table("schedule_slots").includes("CHECK (platform IN ('facebook','instagram'))"));
 assert.ok(table("publication_attempts").includes("CHECK (state IN ('reserved','confirmed','ambiguous','failed'))"));
 assert.ok(table("worker_runs").includes("CHECK (state IN ('started','heartbeat','completed','failed','abandoned'))"));
});
