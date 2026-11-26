import { test } from "node:test";
import assert from "node:assert/strict";
import { handleMetaOAuth } from "./meta-oauth.js";

test("Facebook OAuth requests only Page permissions and leaves Instagram unverified", async () => {
  const db = {
    prepare(sql) {
      return {
        bind(...values) { this.values = values; return this; },
        async run() { return { meta: { changes: 1 } }; }
      };
    }
  };
  const env = {
    NF_META_APP_ID: "test-app-id",
    NF_META_APP_SECRET: "test-app-secret",
    NF_META_REDIRECT_URI: "https://nature-frontiers-staging.example.workers.dev/api/meta/oauth/callback",
    NF_ALLOWED_ORIGIN: "https://nature-frontiers-staging.example.workers.dev",
    NF_META_TOKEN_ENCRYPTION_KEY: "x".repeat(48),
    DB: db
  };
  const response = await handleMetaOAuth(
    new Request("https://nature-frontiers-staging.example.workers.dev/api/meta/oauth/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation: "START META ACCOUNT CONNECTION" })
    }),
    env,
    { user: { id: "nf-staging-owner" } }
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  const authorization = new URL(body.authorizationUrl);
  assert.equal(authorization.hostname, "www.facebook.com");
  assert.deepEqual(authorization.searchParams.get("scope").split(","), [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts"
  ]);
  assert.equal(body.instagramLoginRequired, true);
  assert.equal(body.providerMutations, false);
  assert.equal(body.publishingEnabled, false);
});


test("Facebook OAuth callback completes from one-time owner-bound state without requiring a browser session cookie", async () => {
  const state = "a".repeat(64);
  const stateHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state)))]
    .map(value => value.toString(16).padStart(2, "0")).join("");
  const owner = "nf-staging-owner";
  const auditRows = [];
  const stateRow = {
    state_hash: stateHash,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    consumed_at: null,
    redirect_uri: "https://nature-frontiers-staging.example.workers.dev/api/meta/oauth/callback",
    initiating_subject: owner
  };
  const db = {
    prepare(sql) {
      return {
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (sql.includes("FROM oauth_states")) return stateRow;
          if (sql.includes("FROM meta_connections")) return null;
          return null;
        },
        async run() {
          if (sql.startsWith("UPDATE oauth_states")) stateRow.consumed_at = this.values[0];
          if (sql.startsWith("INSERT INTO audit_events")) auditRows.push(this.values);
          return { meta: { changes: 1 } };
        }
      };
    }
  };
  const env = {
    NF_META_APP_ID: "test-app-id",
    NF_META_APP_SECRET: "test-app-secret",
    NF_META_REDIRECT_URI: "https://nature-frontiers-staging.example.workers.dev/api/meta/oauth/callback",
    NF_ALLOWED_ORIGIN: "https://nature-frontiers-staging.example.workers.dev",
    NF_META_TOKEN_ENCRYPTION_KEY: "x".repeat(48),
    DB: db
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/oauth/access_token") && url.searchParams.has("code")) {
      return Response.json({ access_token: "short-lived-test-token", expires_in: 3600 });
    }
    if (url.pathname.endsWith("/oauth/access_token") && url.searchParams.get("grant_type") === "fb_exchange_token") {
      return Response.json({ access_token: "long-lived-test-token", expires_in: 5_000_000 });
    }
    if (url.pathname.endsWith("/me/permissions")) {
      return Response.json({ data: [
        { permission: "pages_show_list", status: "granted" },
        { permission: "pages_read_engagement", status: "granted" },
        { permission: "pages_manage_posts", status: "granted" }
      ] });
    }
    if (url.pathname.endsWith("/me/accounts")) {
      return Response.json({ data: [{ id: "page-123", name: "Nature Frontiers", access_token: "page-token", tasks: ["CREATE_CONTENT"] }] });
    }
    throw new Error("Unexpected Meta test request: " + url.pathname);
  };
  try {
    const request = new Request(
      "https://nature-frontiers-staging.example.workers.dev/api/meta/oauth/callback?state=" + state + "&code=test-code"
    );
    const response = await handleMetaOAuth(request, env, null);
    assert.equal(response.status, 303);
    assert.equal(new URL(response.headers.get("Location")).pathname, "/");
    assert.equal(stateRow.consumed_at !== null, true);
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0][2], owner);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
