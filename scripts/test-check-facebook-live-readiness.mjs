import assert from "node:assert/strict";
import { checkFacebookLiveReadiness } from "./check-facebook-live-readiness.mjs";

const base = {
  apiVersion: "v27.0",
  pageId: "1431329126735709",
  expectedPageId: "1431329126735709",
  accessToken: "fake-token"
};
function fakeFetch(next, calls) {
  return async (url, options) => {
    calls.push({ url, options });
    return { ok: next.ok ?? true, status: next.status ?? 200, json: async () => next.body };
  };
}
const tests = [
  ["matching Page ID passes with one GET only", async () => {
    const calls = [];
    const result = await checkFacebookLiveReadiness({
      ...base, fetchImpl: fakeFetch({ body: { id: base.expectedPageId, name: "Nature Frontiers" } }, calls)
    });
    assert.equal(result.status, "READ_ONLY_PASS");
    assert.equal(result.pageId, base.expectedPageId);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, "GET");
    assert.match(calls[0].url, /fields=id,name/);
  }],
  ["wrong configured destination is blocked before network", async () => {
    let called = false;
    await assert.rejects(() => checkFacebookLiveReadiness({
      ...base, expectedPageId: "999", fetchImpl: async () => { called = true; }
    }), /does not match the owner-approved expected ID/);
    assert.equal(called, false);
  }],
  ["Meta response for a different Page is rejected", async () => {
    const calls = [];
    await assert.rejects(() => checkFacebookLiveReadiness({
      ...base, fetchImpl: fakeFetch({ body: { id: "999", name: "Other Page" } }, calls)
    }), /different from the owner-approved expected ID/);
  }],
  ["invalid token or permissions fail closed", async () => {
    await assert.rejects(() => checkFacebookLiveReadiness({
      ...base, fetchImpl: fakeFetch({ ok: false, status: 401, body: { error: { code: 190 } } }, [])
    }), /HTTP 401, code 190/);
  }],
  ["missing token is blocked before network", async () => {
    let called = false;
    await assert.rejects(() => checkFacebookLiveReadiness({
      ...base, accessToken: "", fetchImpl: async () => { called = true; }
    }), /META_PAGE_ACCESS_TOKEN/);
    assert.equal(called, false);
  }],
  ["transport outage does not expose token", async () => {
    await assert.rejects(() => checkFacebookLiveReadiness({
      ...base, fetchImpl: async () => { throw new TypeError("offline"); }
    }), /transport level/);
  }]
];
let failures = 0;
for (const [name, run] of tests) {
  try { await run(); console.log("PASS:", name); }
  catch (error) { failures++; console.error("FAIL:", name, error); }
}
if (failures) process.exit(1);
console.log("Facebook live readiness tests: " + (tests.length - failures) + "/" + tests.length + " passed. All Meta calls were mocked.");
