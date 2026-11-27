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

test("Unified Login start creates owner-bound state and keeps publishing disabled", async () => {
  const writes = [];
  const db = {
    prepare(sql) {
      return {
        bind(...values) { this.values = values; return this; },
        async run() { writes.push({ sql, values: this.values }); return { meta: { changes: 1 } }; }
      };
    }
  };
  const response = await handleMetaInstagramUnified(new Request(origin + "/api/meta/instagram/unified/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
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
  const remainingMs = new Date(body.stateExpiresAt).getTime() - Date.now();
  assert.ok(remainingMs > 29 * 60 * 1000 && remainingMs <= 30 * 60 * 1000, "state should remain valid for approximately 30 minutes");
  assert.equal(writes.length, 1);
  assert.match(writes[0].sql, /meta_instagram_unified_states/);
});

test("Unified Login start rejects missing owner confirmation without writing state", async () => {
  let writes = 0;
  const db = {
    prepare() {
      return {
        bind() { return this; },
        async run() { writes++; return { meta: { changes: 1 } }; }
      };
    }
  };
  await assert.rejects(
    () => handleMetaInstagramUnified(new Request(origin + "/api/meta/instagram/unified/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    }), envFor(db), { user: { id: owner } }),
    error => error?.status === 403
  );
  assert.equal(writes, 0);
});

test("Identity verification rejects any username other than the configured Nature Frontiers account", async () => {
  let reads = 0;
  const db = {
    prepare() {
      return {
        bind() { return this; },
        async first() { reads++; return null; }
      };
    }
  };
  await assert.rejects(
    () => handleMetaInstagramUnified(new Request(origin + "/api/meta/instagram/unified/connections/111111111111111/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        confirmation: "VERIFY NATURE FRONTIERS INSTAGRAM",
        expectedUsername: "someone_else"
      })
    }), envFor(db), { user: { id: owner } }),
    error => error?.status === 403
  );
  assert.equal(reads, 0);
});

test("Unified Login callback saves only the exact expected account and does not verify it automatically", async () => {
  const state = "b".repeat(64);
  const stateHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state)))]
    .map(value => value.toString(16).padStart(2, "0")).join("");
  const stateRow = {
    state_hash: stateHash,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    consumed_at: null,
    redirect_uri: origin + "/api/meta/oauth/callback",
    initiating_subject: owner,
    config_id: configId
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
  const requests = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    requests.push({ url, method: init.method || "GET" });
    if (url.pathname.endsWith("/oauth/access_token")) return Response.json({ access_token: "test-token", expires_in: 3600 });
    if (url.pathname.endsWith("/me")) return Response.json({ client_business_id: "987654321" });
    if (url.pathname.endsWith("/me/assigned_instagram_accounts")) return Response.json({ data: [
      { id: "111111111111111", username: "naturefrontieers2026" },
      { id: "222222222222222", username: "other_account" }
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
    assert.equal(requests.every(item => item.method === "GET"), true);
    assert.equal(requests.some(item => item.url.pathname.includes("media_publish")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("Read-only token health check verifies token, scopes, profile and media without database writes", async () => {
  const accountId = "17841413164146618";
  const secret = envFor({}).NF_META_TOKEN_ENCRYPTION_KEY;
  const businessId = "987654321";
  const aad = accountId + ":" + businessId + ":" + configId;
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt"]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: new TextEncoder().encode(aad) }, key, new TextEncoder().encode("test-instagram-token"));
  const toB64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const row = { instagram_account_id: accountId, username: "naturefrontieers2026", config_id: configId, client_business_id: businessId,
    access_token_ciphertext: toB64(encrypted), access_token_nonce: toB64(nonce), identity_verified_at: "2026-11-27T00:08:27.587Z" };
  let writes = 0, reads = 0;
  const db = { prepare(sql) { return { bind(...values) { this.values = values; return this; },
    async first() { reads++; assert.match(sql, /SELECT \* FROM meta_instagram_unified_connections/); assert.deepEqual(this.values, [accountId]); return row; },
    async run() { writes++; return { meta: { changes: 1 } }; } }; } };
  const originalFetch = globalThis.fetch, requests = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input)); requests.push({ url, method: init.method || "GET", authorization: new Headers(init.headers).get("Authorization") });
    if (url.pathname.endsWith("/debug_token")) return Response.json({ data: { is_valid: true, app_id: "test-app-id", scopes: ["instagram_basic", "instagram_content_publish"], expires_at: 1893456000, data_access_expires_at: 1893456000 } });
    if (url.pathname.endsWith("/" + accountId)) return Response.json({ id: accountId, username: "naturefrontieers2026" });
    if (url.pathname.endsWith("/" + accountId + "/media")) return Response.json({ data: [{ id: "media-1", media_type: "IMAGE", timestamp: "2026-11-26T10:00:00+0000" }] });
    throw new Error("Unexpected Meta request " + url.pathname);
  };
  try {
    const response = await handleMetaInstagramUnified(new Request(origin + "/api/meta/instagram/unified/connections/" + accountId + "/health"), envFor(db), { user: { id: owner } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.readOnly, true);
    assert.equal(body.databaseMutations, false);
    assert.equal(body.token.valid, true);
    assert.equal(body.permissions.allRequiredGranted, true);
    assert.equal(body.profile.matchesExpectedAccount, true);
    assert.equal(body.media.accessible, true);
    assert.equal(body.media.sampleCount, 1);
    assert.equal(body.safety.publishingEnabled, false);
    assert.equal(body.safety.dryRun, true);
    assert.equal(body.safety.emergencyStop, true);
    assert.equal(reads, 1);
    assert.equal(writes, 0);
    assert.equal(requests.length, 3);
    assert.ok(requests.every(request => request.method === "GET"));
    assert.equal(requests[0].authorization, "Bearer test-app-id|test-app-secret");
    assert.equal(requests.slice(1).every(request => request.authorization === "Bearer test-instagram-token"), true);
  } finally { globalThis.fetch = originalFetch; }
});
