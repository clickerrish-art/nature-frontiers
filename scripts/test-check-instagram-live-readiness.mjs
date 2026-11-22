import assert from "node:assert/strict";
import { checkInstagramLiveReadiness } from "./check-instagram-live-readiness.mjs";

const base = { apiVersion: "v27.0", instagramUserId: "17841413164146618", accessToken: "fake-token" };
function fakeFetch(responses, calls) {
  return async (url, options) => {
    calls.push({ url, options });
    const next = responses.shift();
    return { ok: next.ok ?? true, status: next.status ?? 200, json: async () => next.body };
  };
}
const tests = [
  ["valid SUAT scopes, account, quota and media read pass with GET only", async () => {
    const calls = [];
    const fetchImpl = fakeFetch([
      { body: { data: [{ permission: "instagram_basic", status: "granted" }, { permission: "instagram_content_publish", status: "granted" }] } },
      { body: { id: base.instagramUserId } },
      { body: { data: [{ quota_usage: 3, config: { quota_total: 50, quota_duration: 86400 } }] } },
      { body: { data: [] } }
    ], calls);
    const result = await checkInstagramLiveReadiness({ ...base, fetchImpl });
    assert.equal(result.status, "READ_ONLY_PASS");
    assert.equal(result.quotaTotal, 50);
    assert.equal(calls.length, 4);
    assert.ok(calls.every((call) => call.options.method === "GET"));
  }],
  ["missing content-publish permission blocks before account calls", async () => {
    const calls = [];
    const fetchImpl = fakeFetch([{ body: { data: [{ permission: "instagram_basic", status: "granted" }] } }], calls);
    await assert.rejects(() => checkInstagramLiveReadiness({ ...base, fetchImpl }), /instagram_content_publish/);
    assert.equal(calls.length, 1);
  }],
  ["mismatched Instagram account ID is blocked", async () => {
    const calls = [];
    const fetchImpl = fakeFetch([
      { body: { data: [{ permission: "instagram_basic", status: "granted" }, { permission: "instagram_content_publish", status: "granted" }] } },
      { body: { id: "17841400000000000" } }
    ], calls);
    await assert.rejects(() => checkInstagramLiveReadiness({ ...base, fetchImpl }), /different Instagram account ID/);
    assert.equal(calls.length, 2);
  }],
  ["missing token is blocked without network request", async () => {
    let called = false;
    await assert.rejects(() => checkInstagramLiveReadiness({ ...base, accessToken: "", fetchImpl: async () => { called = true; } }), /INSTAGRAM_ACCESS_TOKEN/);
    assert.equal(called, false);
  }],
  ["invalid quota response is blocked", async () => {
    const fetchImpl = fakeFetch([
      { body: { data: [{ permission: "instagram_basic", status: "granted" }, { permission: "instagram_content_publish", status: "granted" }] } },
      { body: { id: base.instagramUserId } },
      { body: { data: [{ quota_usage: 3, config: { quota_total: 0, quota_duration: 86400 } }] } }
    ], []);
    await assert.rejects(() => checkInstagramLiveReadiness({ ...base, fetchImpl }), /valid quota values/);
  }]
];
let failures = 0;
for (const [name, run] of tests) { try { await run(); console.log("PASS:", name); } catch (error) { failures++; console.error("FAIL:", name, error); } }
if (failures) process.exit(1);
console.log(`Instagram live readiness tests: ${tests.length - failures}/${tests.length} passed. All Meta calls were mocked; no publish endpoint was called.`);
