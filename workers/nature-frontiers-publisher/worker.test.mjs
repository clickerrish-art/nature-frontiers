import assert from "node:assert/strict";
import worker from "./worker.js";

const hash = "a".repeat(64);
const makeRequest = (path, method = "GET") => new Request(`https://publisher.example${path}`, { method });
const env = {
  DB: { prepare: () => ({ first: async () => ({ table_count: 6 }) }) },
  ASSETS: { fetch: async (request) => new Response(request.method === "HEAD" ? null : "jpeg-bytes", {
    status: 200,
    headers: { "content-type": "image/jpeg", "content-length": "10", "etag": '"asset-etag"' }
  }) }
};

const health = await worker.fetch(makeRequest("/health"), env);
assert.equal(health.status, 200);
const healthBody = await health.json();
assert.equal(healthBody.publishingEnabled, false);
assert.equal(healthBody.dryRun, true);
assert.equal(healthBody.emergencyStop, true);

const mediaPath = `/media/instagram/media-${hash}.jpg`;
const media = await worker.fetch(makeRequest(mediaPath), env);
assert.equal(media.status, 200);
assert.equal(media.headers.get("content-type"), "image/jpeg");
assert.equal(media.headers.get("cache-control"), "public, max-age=31536000, immutable");
assert.equal(media.headers.get("x-content-type-options"), "nosniff");
assert.equal(await media.text(), "jpeg-bytes");

const head = await worker.fetch(makeRequest(mediaPath, "HEAD"), env);
assert.equal(head.status, 200);
assert.equal(await head.text(), "");

const missingBinding = await worker.fetch(makeRequest(mediaPath), { ...env, ASSETS: undefined });
assert.equal(missingBinding.status, 503);

const wrongType = await worker.fetch(makeRequest(mediaPath), {
  ...env,
  ASSETS: { fetch: async () => new Response("<html>fallback</html>", { headers: { "content-type": "text/html" } }) }
});
assert.equal(wrongType.status, 415);

const extensionMismatch = await worker.fetch(makeRequest(`/media/instagram/media-${hash}.mp4`), env);
assert.equal(extensionMismatch.status, 415);

const badHash = await worker.fetch(makeRequest("/media/instagram/media-not-a-hash.jpg"), env);
assert.equal(badHash.status, 404);

const traversal = await worker.fetch(makeRequest(`/media/instagram/../media-${hash}.jpg`), env);
assert.equal(traversal.status, 404);

const post = await worker.fetch(makeRequest(mediaPath, "POST"), env);
assert.equal(post.status, 405);
assert.equal(post.headers.get("allow"), "GET, HEAD");

const unknown = await worker.fetch(makeRequest("/anything"), env);
assert.equal(unknown.status, 404);

console.log("PASS: worker health safety flags, hash-addressed static media, GET/HEAD, missing binding, content-type checks, traversal rejection, and method restrictions");
