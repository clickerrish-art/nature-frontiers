import { test } from "node:test";
import assert from "node:assert/strict";
import { auth } from "./index.js";

const encoder = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
const sha = async value => hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
const hmac = async (keyValue, value) => {
  const key = await crypto.subtle.importKey("raw", encoder.encode(keyValue), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
};

async function fixture(csrf) {
  const token = "a".repeat(64);
  const secret = "session-secret-for-auth-regression-tests-32";
  const agent = "Nature Frontiers auth test";
  const row = {
    operator_id: "nf-staging-owner",
    role: "owner",
    csrf_hash: await sha(csrf),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    user_agent_hash: await hmac(secret, "session-ua:" + agent)
  };
  const db = {
    prepare(sql) {
      return {
        bind(...values) { this.values = values; return this; },
        async first() { return sql.startsWith("SELECT operator_id") ? row : null; },
        async run() { return { meta: { changes: 1 } }; }
      };
    }
  };
  return {
    token,
    agent,
    env: { DB: db, NF_OPERATOR_ID: "nf-staging-owner", NF_SESSION_SECRET: secret },
    headers: { Cookie: "__Host_nf_session=" + token, "User-Agent": agent }
  };
}

test("valid session and CSRF header authenticate without depending on a readable CSRF cookie", async () => {
  const csrf = "b".repeat(64);
  const f = await fixture(csrf);
  const request = new Request("https://nature-frontiers-staging.example.workers.dev/api/meta/oauth/start", {
    method: "POST",
    headers: { ...f.headers, "X-CSRF-Token": csrf }
  });
  const session = await auth(request, f.env, true);
  assert.equal(session.user.id, "nf-staging-owner");
  assert.equal(session.csrfInvalid, undefined);
});

test("mutating requests reject a missing or incorrect CSRF header", async () => {
  const csrf = "c".repeat(64);
  const f = await fixture(csrf);
  const missing = await auth(new Request("https://nature-frontiers-staging.example.workers.dev/api/meta/oauth/start", {
    method: "POST", headers: f.headers
  }), f.env, true);
  assert.equal(missing.csrfInvalid, true);
  const incorrect = await auth(new Request("https://nature-frontiers-staging.example.workers.dev/api/meta/oauth/start", {
    method: "POST", headers: { ...f.headers, "X-CSRF-Token": "d".repeat(64) }
  }), f.env, true);
  assert.equal(incorrect.csrfInvalid, true);
});

test("session restoration accepts the HttpOnly session cookie without requiring a CSRF cookie", async () => {
  const csrf = "e".repeat(64);
  const f = await fixture(csrf);
  const session = await auth(new Request("https://nature-frontiers-staging.example.workers.dev/api/auth/session", {
    method: "GET", headers: f.headers
  }), f.env, false);
  assert.equal(session.user.id, "nf-staging-owner");
  assert.equal(session.csrfHash, await sha(csrf));
});
