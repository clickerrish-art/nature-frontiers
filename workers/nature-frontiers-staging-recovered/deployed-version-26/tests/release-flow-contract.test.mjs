import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const release=readFileSync(resolve(root,"media-release.js"),"utf8");
const runner=readFileSync(resolve(root,"runner.mjs"),"utf8");
const scheduling=readFileSync(resolve(root,"scheduling.js"),"utf8");

test("destination binding is owner-only and requires a verified exact Meta identity",()=>{
 assert.match(release,/targetMatch = path\.match/);
 assert.match(release,/BIND NATURE FRONTIERS /);
 assert.match(release,/status='verified'/);
 assert.match(release,/identity_verified_at IS NOT NULL/);
 assert.match(release,/permissions_verified_at IS NOT NULL/);
 assert.match(release,/instagram_identity_verified_at IS NOT NULL/);
 assert.match(release,/INSERT INTO content_targets/);
});

test("platform approval requires a bound verified target and promotes its target status",()=>{
 assert.match(release,/Bind and verify the exact Meta destination before approving this platform/);
 assert.match(release,/UPDATE content_targets SET status='approved'/);
 assert.match(release,/UPDATE content_items SET status='approved'/);
 assert.match(release,/approvalReset/);
});

test("dry-run queue independently rechecks current approved content, media, rights, approval and verified destination",()=>{
 assert.match(runner,/!\["approved","scheduled"\]\.includes\(content\.status\)/);
 assert.match(runner,/content\.revision_media_sha256!==content\.media_sha256/);
 assert.match(runner,/ct\.status='approved'/);
 assert.match(runner,/mc\.status='verified'/);
 assert.match(runner,/mc\.identity_verified_at IS NOT NULL/);
 assert.match(runner,/mc\.permissions_verified_at IS NOT NULL/);
 assert.match(runner,/mc\.instagram_identity_verified_at IS NOT NULL/);
});

test("approved content can be scheduled only into a held slot",()=>{
 assert.match(scheduling,/content\.status!=="approved"/);
 assert.match(scheduling,/VALUES\(\?,\?,\?,\?,\?,'held'/);
});
