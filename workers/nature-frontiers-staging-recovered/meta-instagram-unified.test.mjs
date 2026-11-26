import { test } from "node:test";
import assert from "node:assert/strict";
import { handleMetaInstagramUnified } from "./meta-instagram-unified.js";

const origin = "https://nature-frontiers-staging.kajiboye44.workers.dev";
const owner = "nf-staging-owner";
const configId = "123456789012345";

function envFor(db) {
  return {
    NF_META_APP_ID: "test-app-id",
    NF_META_APP_SECRET: "test-app-secret",
    NF_META_UNIFIED_LOGIN_CONFIG_ID: configId,
    NF_META_REDIRECT_URI: origin + "/api/meta/oauth/callback",
    NF_ALLOWED_ORIGIN: origin,
    NF_META_TOKEN_ENCRYPTION_KEY: "test-encryption-key-".repeat(3),
    NF_META_GRAPH_API_VERSION: "v27.0",
    DB: db
  };
}

test("Unified Login start is owner-confirmed and returns the configured Meta flow without enabling publishing", async () => {
  const writes = [];
  const db = { prepare(sql) { return { bind(...values) { this.values = values; return this; }, async run() { writes.push({ sql, values: this.values }); return { meta: { changes: 1 } }; } }; } };
  await assert.rejects(() => handleMetaInstagramUnified(new Request(origin + "/api/meta/instagram/unified/start", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirmation: "START INSTAGRAM UNIFIED LOGIN" })
  }), envFor(db), { user: { id: owner } });
  assert.equal(response.status, 200);
  const body = await response.json();
  const authorization = new URL(body.authorizationUrl);
  assert.equal(authorization.hostname, "www.facebook.com");
  assert.equal(authorization.searchParams.get("config_id"), configId);
  assert.equal(authorization.searchParams.get("redirect_uri"), origin + "/api/meta/oauth/callback");
  assert.equal(body.providerMutations, false);
  assert.equal(body.publishingEnabled, false);
  assert.equal(body.dryRun, true);
  assert.equal(body.emergencyStop, true);
  assert.equal(writes.length, 1);
  assert.match(writes[0].sql, /meta_instagram_unified_states/);
});

test("Unified Login start rejects missing owner confirmation without writing state", async () => {
  let writes = 0;
  const db = { prepare() { return { bind() { return this; }, async run() { writes++; return { meta: { changes: 1 } }; } }; } };
  const response = await handleMetaInstagramUnified(new Request(origin + "/api/meta/instagram/unified/start", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({})
  }), envFor(db), { user: { id: owner } });
  }), error => error?.status === 403);
  assert.equal(writes, 0);
});

test("Unified Login callback stores only the exact expected Instagram username and leaves identity unverified", async () => {
  const state = "a".repeat(64);
  const stateHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state)))]
    .map(value => value.toString(16).padStart(2, "0")).join("");
  const stateRow = {
    state_hash: stateHash, expires_at: new Date(Date.now() + 60_000).toISOString(),
    consumed_at: null, redirect_uri: origin + "/api/meta/oauth/callback",
    initiating_subject: owner, config_id: configId
  };
  const writes = [];
  const db = {
    prepare(sql) {
      return {
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() { return sql.includes("meta_instagram_unified_states") ? stateRow : null; },
        async run() {
          writes.push({ sql, values: this.values });
          if (sql.startsWith("UPDATE meta_instagram_unified_states")) stateRow.consumed_at = this.values[0];
          return { meta: { changes: 1 } };
        }
      };
    }
  };
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input)); requested.push({ url, method: init.method || "GET" });
    if (url.pathname.endsWith("/oauth/access_token")) return Response.json({ access_token: "test-token", expires_in: 3600 });
    if (url.pathname.endsWith("/me")) return Response.json({ client_business_id: "987654321" });
    if (url.pathname.endsWith("/me/assigned_instagram_accounts")) return Response.json({ data: [
      { id: "111111111111111", username: "naturefrontieers2026" },
      { id: "222222222222222", username: "different_account" }
    ] });
    throw new Error("Unexpected Meta request " + url.pathname);
  };
  try {
    const response = await handleMetaInstagramUnified(new Request(origin + "/api/meta/oauth/callback?state=" + state + "&code=test-code"), envFor(db), { user: { id: owner } });
    assert.equal(response.status, 303);
    assert.equal(new URL(response.headers.get("Location")).searchParams.get("instagram"), "connected");
    const insert = writes.find(item => item.sql.includes("INSERT INTO meta_instagram_unified_connections"));
    assert.ok(insert);
    assert.equal(insert.values[3], "naturefrontieers2026");
    assert.ok(insert.sql.includes("VALUES(?,?,?,?,?,?,?,?,?,NULL,?,?)"));
    assert.equal(requested.every(item => item.method === "GET"), true);
    assert.equal(requested.some(item => item.url.pathname.includes("/media_publish")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Identity verification rejects any username other than the configured Nature Frontiers account", async () => {
  let reads = 0;
  const db = { prepare() { return { bind() { return this; }, async first() { reads++; return null; } }; } };
  await assert.rejects(() => handleMetaInstagramUnified(new Request(origin + "/api/meta/instagram/unified/connections/111111111111111/verify", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirmation: "VERIFY NATURE FRONTIERS INSTAGRAM", expectedUsername: "someone_else" })
  }), envFor(db), { user: { id: owner } });
  }), error => error?.status === 403);
  assert.equal(reads, 0);
});
