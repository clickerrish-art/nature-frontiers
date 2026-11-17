import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./check-publishing-readiness.mjs", import.meta.url));
const base = {
  ...process.env,
  META_PAGE_ID: "123",
  META_PAGE_ACCESS_TOKEN: "test-only",
  META_GRAPH_API_VERSION: "v27.0",
  INSTAGRAM_ACCESS_TOKEN: "test-only",
  INSTAGRAM_USER_ID: "17841413164146618",
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
assert.match(fail.stdout, /Missing: INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID, META_GRAPH_API_VERSION/);

console.log("Publishing readiness variable mapping: PASS");
