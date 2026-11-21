import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { createPublicKey } from "node:crypto";
import { verifyCloudflareAccessIdentity } from "./cloudflare-access-auth.mjs";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" }
});
const publicJwk = createPublicJwk(publicKey);
function createPublicJwk(pem) {
  const key = requirePublicKey(pem);
  const jwk = key.export({ format: "jwk" });
  return { ...jwk, kid: "test-key-1", alg: "RS256", use: "sig" };
}
function requirePublicKey(pem) {
  return createPublicKey(pem);
}
const now = Math.floor(Date.now() / 1000);
const config = {
  CF_ACCESS_TEAM_DOMAIN: "test-team.cloudflareaccess.com",
  CF_ACCESS_AUD: "expected-audience",
  PUBLISHER_ACCESS_IDENTITY_ROLES_JSON: JSON.stringify({
    "editor@example.org": "editor",
    "rights@example.org": "rights_reviewer"
  })
};
function b64url(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}
function token(claimOverrides = {}, headerOverrides = {}) {
  const header = { alg: "RS256", typ: "JWT", kid: "test-key-1", ...headerOverrides };
  const claims = {
    iss: "https://test-team.cloudflareaccess.com", aud: ["expected-audience"],
    sub: "verified-subject", email: "editor@example.org", iat: now, nbf: now - 1, exp: now + 300,
    ...claimOverrides
  };
  const input = b64url(header) + "." + b64url(claims);
  return input + "." + sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url");
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  assert.equal(url, "https://test-team.cloudflareaccess.com/cdn-cgi/access/certs");
  return Response.json({ keys: [publicJwk] });
};
try {
  const requestFor = (jwt) => new Request("https://worker.example/api/content", {
    headers: jwt ? { authorization: "Bearer " + jwt } : {}
  });
  const valid = await verifyCloudflareAccessIdentity(requestFor(token()), config, now);
  assert.deepEqual(valid, { ok: true, identity: { role: "editor", actor: "editor@example.org" } });
  assert.equal((await verifyCloudflareAccessIdentity(requestFor(null), config, now)).status, 401);
  assert.equal((await verifyCloudflareAccessIdentity(requestFor("not.a.jwt"), config, now)).status, 401);
  assert.equal((await verifyCloudflareAccessIdentity(requestFor(token({ exp: now })), config, now)).status, 401);
  assert.equal((await verifyCloudflareAccessIdentity(requestFor(token({ nbf: now + 10 })), config, now)).status, 401);
  assert.equal((await verifyCloudflareAccessIdentity(requestFor(token({ iss: "https://attacker.cloudflareaccess.com" })), config, now)).status, 401);
  assert.equal((await verifyCloudflareAccessIdentity(requestFor(token({ aud: ["wrong-audience"] })), config, now)).status, 401);
  assert.equal((await verifyCloudflareAccessIdentity(requestFor(token({}, { alg: "none" })), config, now)).status, 401);
  const validToken = token();
  const tokenParts = validToken.split(".");
  tokenParts[2] = (tokenParts[2][0] === "A" ? "B" : "A") + tokenParts[2].slice(1);
  const tampered = tokenParts.join(".");
  assert.equal((await verifyCloudflareAccessIdentity(requestFor(tampered), config, now)).status, 401);
  assert.equal((await verifyCloudflareAccessIdentity(requestFor(token({ email: "unknown@example.org" })), config, now)).status, 403);
  const rights = await verifyCloudflareAccessIdentity(requestFor(token({ email: "rights@example.org" })), config, now);
  assert.deepEqual(rights.identity, { role: "rights_reviewer", actor: "rights@example.org" });
  assert.equal((await verifyCloudflareAccessIdentity(requestFor(token()), {
    ...config, PUBLISHER_ACCESS_IDENTITY_ROLES_JSON: "{"
  }, now)).status, 503);
  assert.equal((await verifyCloudflareAccessIdentity(requestFor(token()), {
    ...config, CF_ACCESS_AUD: ""
  }, now)).status, 503);
} finally {
  globalThis.fetch = originalFetch;
}
console.log("Cloudflare Access JWT authentication tests passed.");
