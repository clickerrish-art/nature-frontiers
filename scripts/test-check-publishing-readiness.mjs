import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./check-publishing-readiness.mjs", import.meta.url));
const base = {
  ...process.env,
  META_PAGE_ID: "123",
  META_EXPECTED_PAGE_ID: "123",
  META_PAGE_ACCESS_TOKEN: "test-only",
  META_GRAPH_API_VERSION: "v27.0",
  INSTAGRAM_ACCESS_TOKEN: "test-only",
  INSTAGRAM_USER_ID: "17841413164146618",
  META_EXPECTED_INSTAGRAM_USER_ID: "17841413164146618",
  PINTEREST_ACCESS_TOKEN: "",
  PINTEREST_BOARD_ID: "",
  TIKTOK_ACCESS_TOKEN: "",
  TIKTOK_OPEN_ID: ""
};

const pass = spawnSync(process.execPath, [script], { env: base, encoding: "utf8" });
assert.equal(pass.status, 0, pass.stderr);
assert.match(pass.stdout, /Instagram: CREDENTIALS PRESENT/);

const missingVersion = { ...base };
delete missingVersion.META_GRAPH_API_VERSION;
missingVersion.INSTAGRAM_GRAPH_API_VERSION = "v27.0";
const fail = spawnSync(process.execPath, [script], { env: missingVersion, encoding: "utf8" });
assert.equal(fail.status, 0, fail.stderr);
assert.match(fail.stdout, /Instagram: NOT READY/);
assert.match(fail.stdout, /Missing: META_GRAPH_API_VERSION/);

const wrongFacebookPage = spawnSync(process.execPath, [script], {
  env: { ...base, META_EXPECTED_PAGE_ID: "999" }, encoding: "utf8"
});
assert.equal(wrongFacebookPage.status, 0, wrongFacebookPage.stderr);
assert.match(wrongFacebookPage.stdout, /Meta \(Facebook Page\): IDENTITY MISMATCH — NOT READY/);

const wrongInstagramAccount = spawnSync(process.execPath, [script], {
  env: { ...base, META_EXPECTED_INSTAGRAM_USER_ID: "17841400000000000" }, encoding: "utf8"
});
assert.equal(wrongInstagramAccount.status, 0, wrongInstagramAccount.stderr);
assert.match(wrongInstagramAccount.stdout, /Instagram: IDENTITY MISMATCH — NOT READY/);

const missingExpectedPage = { ...base };
delete missingExpectedPage.META_EXPECTED_PAGE_ID;
const missingExpected = spawnSync(process.execPath, [script], { env: missingExpectedPage, encoding: "utf8" });
assert.equal(missingExpected.status, 0, missingExpected.stderr);
assert.match(missingExpected.stdout, /Missing: META_EXPECTED_PAGE_ID/);

console.log("Publishing readiness variable mapping: PASS");
