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
