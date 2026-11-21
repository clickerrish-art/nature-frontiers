import assert from "node:assert/strict";
import { createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import worker from "./worker.js";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" }
});
const jwk = createPublicKey(publicKey).export({ format: "jwk" });
const signingKey = { ...jwk, kid: "route-test-key", use: "sig" };
const now = Math.floor(Date.now() / 1000);
const issuer = "https://route-test.cloudflareaccess.com";
const env = {
  DB: { prepare: () => ({ all: async () => ({ results: [] }) }) },
  CF_ACCESS_TEAM_DOMAIN: "route-test.cloudflareaccess.com",
  CF_ACCESS_AUD: "publisher-worker-audience",
  PUBLISHER_ACCESS_IDENTITY_ROLES_JSON: JSON.stringify({
    "editor@example.org": "editor",
    "rights@example.org": "rights_reviewer"
  })
};
function encode(value) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function jwt(email = "editor@example.org", audience = "publisher-worker-audience", subject = "subject-editor") {
  const header = encode({ alg: "RS256", kid: "route-test-key", typ: "JWT" });
  const claims = encode({
    iss: issuer, aud: [audience], sub: subject, email,
    iat: now, nbf: now - 1, exp: now + 300
  });
  const input = header + "." + claims;
  return input + "." + sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url");
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  assert.equal(url, issuer + "/cdn-cgi/access/certs");
  return Response.json({ keys: [signingKey] });
};
try {
  const call = (path, method, token, body) => worker.fetch(new Request("https://publisher-worker.kajiboye44.workers.dev" + path, {
    method,
    headers: {
      ...(token ? { authorization: "Bearer " + token } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }), env);
  const read = await call("/api/content", "GET", jwt());
  assert.equal(read.status, 200);
  assert.deepEqual((await read.json()).items, []);
  assert.equal((await call("/api/content", "GET", "legacy-static-test-token")).status, 401);
  assert.equal((await call("/api/content", "GET", jwt("editor@example.org", "wrong-audience"))).status, 401);
  assert.equal((await call("/api/content", "POST", jwt("rights@example.org"), {})).status, 403);
  assert.equal((await call("/api/content", "POST", jwt(), {})).status, 400);
  assert.equal((await call("/api/content", "GET", null)).status, 401);
  const revokedEnv = {
    ...env,
    PUBLISHER_ACCESS_REVOKED_SUBJECTS_JSON: JSON.stringify(["subject-editor"])
  };
  const revoked = await worker.fetch(new Request("https://publisher-worker.kajiboye44.workers.dev/api/content", {
    headers: { authorization: "Bearer " + jwt() }
  }), revokedEnv);
  assert.equal(revoked.status, 403);
  assert.equal((await revoked.json()).error, "identity_revoked");
  const unconfigured = await worker.fetch(new Request("https://publisher-worker.kajiboye44.workers.dev/api/content", {
    headers: { authorization: "Bearer " + jwt() }
  }), { ...env, CF_ACCESS_AUD: "" });
  assert.equal(unconfigured.status, 503);
} finally {
  globalThis.fetch = originalFetch;
}
console.log("Cloudflare Access publisher route integration tests passed.");
