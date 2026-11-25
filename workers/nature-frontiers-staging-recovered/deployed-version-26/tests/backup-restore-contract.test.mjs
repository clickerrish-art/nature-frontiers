import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const backup=readFileSync(resolve(root,"backups.js"),"utf8");
const schema=readFileSync(resolve(root,"../schema.snapshot.sql"),"utf8");
const tables=[...schema.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+([a-z_][a-z0-9_]*)/gi)].map(x=>x[1]);
const backupTables=backup.match(/const TABLES=\[(.*?)\];/s)[1].replace(/"/g,"").split(",").map(x=>x.trim());

test("backup table manifest matches the recovered schema and excludes ephemeral sessions",()=>{
 for(const name of backupTables)assert.ok(tables.includes(name),`backup table ${name} is absent from schema snapshot`);
 for(const name of ["operator_sessions","login_rate_limits","oauth_states"])assert.ok(!backupTables.includes(name),`${name} must not be restored as durable backup state`);
 assert.match(backup,/DELETE FROM operator_sessions/);
 assert.match(backup,/DELETE FROM login_rate_limits/);
 assert.match(backup,/DELETE FROM oauth_states/);
});

test("restore preserves published history and never revives active schedule leases",()=>{
 assert.match(backup,/row\.state==="published"\?"published"/);
 assert.match(backup,/row\.state==="cancelled"\?"cancelled"/);
 assert.match(backup,/row\.state==="dead_letter"\?"dead_letter"/);
 assert.match(backup,/state='dead_letter'.*state IN \('held','ready','leased','publishing'\)/s);
 assert.match(backup,/state='held'.*state IN \('ready','leased','publishing'\)/s);
 assert.match(backup,/UPDATE worker_runs SET state='abandoned'/);
});

test("restore invalidates release authority and verifies fail-closed controls",()=>{
 assert.match(backup,/UPDATE publication_attempts SET state='ambiguous'.*WHERE state='reserved'/s);
 assert.match(backup,/UPDATE content_targets SET status='held'/);
 assert.match(backup,/UPDATE content_items SET status='needs_review'/);
 assert.match(backup,/UPDATE approval_receipts SET revoked_at=/);
 assert.match(backup,/UPDATE media_rights_evidence SET revoked_at=/);
 assert.match(backup,/UPDATE meta_connections SET status='unverified'/);
 assert.match(backup,/unheld_targets/);
 assert.match(backup,/active_runs/);
 assert.match(backup,/reserved_attempts/);
});
