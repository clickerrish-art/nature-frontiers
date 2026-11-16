import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import worker from "./worker.js";

const assetBytes = Buffer.from("jpeg-bytes");
const hash = createHash("sha256").update(assetBytes).digest("hex");
const makeRequest = (path, method = "GET", init = {}) => new Request(`https://publisher.example${path}`, { method, ...init });
const env = {
  DB: { prepare: () => ({ first: async () => ({ table_count: 6 }) }) },
  ASSETS: { fetch: async (request) => {
    assert.equal(request.method, "GET", "the Worker must fetch complete bytes to verify the hash, including for HEAD requests");
    return new Response(assetBytes, {
      status: 200,
      headers: { "content-type": "image/jpeg", "content-length": String(assetBytes.length), etag: '"asset-etag"' }
    });
  } }
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
assert.equal(media.headers.get("x-content-sha256"), hash);
assert.equal(await media.text(), "jpeg-bytes");
const head = await worker.fetch(makeRequest(mediaPath, "HEAD"), env);
assert.equal(head.status, 200);
assert.equal(await head.text(), "");

const wrongHash = hash === "0".repeat(64) ? "1".repeat(64) : "0".repeat(64);
const hashMismatch = await worker.fetch(makeRequest(`/media/instagram/media-${wrongHash}.jpg`), env);
assert.equal(hashMismatch.status, 502);
const oversizedAsset = await worker.fetch(makeRequest(`/media/instagram/media-${hash}.jpg`), {
  ...env,
  ASSETS: { fetch: async () => new Response("x", { headers: { "content-type": "image/jpeg", "content-length": String(25 * 1024 * 1024 + 1) } }) }
});
assert.equal(oversizedAsset.status, 413);

const missingBinding = await worker.fetch(makeRequest(mediaPath), { ...env, ASSETS: undefined });
assert.equal(missingBinding.status, 503);
const wrongType = await worker.fetch(makeRequest(mediaPath), { ...env, ASSETS: { fetch: async () => new Response("<html>fallback</html>", { headers: { "content-type": "text/html" } }) } });
assert.equal(wrongType.status, 415);
const extensionMismatch = await worker.fetch(makeRequest(`/media/instagram/media-${hash}.mp4`), env);
assert.equal(extensionMismatch.status, 415);
assert.equal((await worker.fetch(makeRequest("/media/instagram/media-not-a-hash.jpg"), env)).status, 404);
assert.equal((await worker.fetch(makeRequest(`/media/instagram/../media-${hash}.jpg`), env)).status, 404);
const post = await worker.fetch(makeRequest(mediaPath, "POST"), env);
assert.equal(post.status, 405);
assert.equal(post.headers.get("allow"), "GET, HEAD");
assert.equal((await worker.fetch(makeRequest("/anything"), env)).status, 404);

const verifyToken = "test-webhook-verify-token";
const appSecret = "test-meta-app-secret";
const webhookEvent = JSON.stringify({ object: "instagram", entry: [{ id: "account-id", time: 123 }] });
const signature = "sha256=" + createHmac("sha256", appSecret).update(webhookEvent).digest("hex");
const inserted = [];
const webhookEnv = {
  ...env,
  META_WEBHOOK_VERIFY_TOKEN: verifyToken,
  META_APP_SECRET: appSecret,
  DB: {
    prepare: (sql) => ({
      bind: (...values) => ({ run: async () => {
        inserted.push({ sql, values });
        return { success: true, meta: { changes: 1 } };
      } })
    })
  }
};
const challenge = await worker.fetch(makeRequest(`/webhooks/meta?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=challenge-123`), webhookEnv);
assert.equal(challenge.status, 200);
assert.equal(await challenge.text(), "challenge-123");
const rejectedChallenge = await worker.fetch(makeRequest("/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-123"), webhookEnv);
assert.equal(rejectedChallenge.status, 403);

const accepted = await worker.fetch(makeRequest("/webhooks/meta", "POST", {
  headers: { "content-type": "application/json", "x-hub-signature-256": signature },
  body: webhookEvent
}), webhookEnv);
assert.equal(accepted.status, 200);
assert.equal(await accepted.text(), "EVENT_RECEIVED");
assert.equal(inserted.length, 1);
assert.match(inserted[0].sql, /INSERT OR IGNORE INTO meta_webhook_events/);
assert.equal(inserted[0].values[2], "instagram");
assert.equal(inserted[0].values[3], 1);
assert.equal(inserted[0].values.length, 4, "raw webhook payload must not be retained");
assert.match(inserted[0].values[0], /^[a-f0-9]{64}$/);

const duplicateAccepted = await worker.fetch(makeRequest("/webhooks/meta", "POST", {
  headers: { "content-type": "application/json", "x-hub-signature-256": signature },
  body: webhookEvent
}), webhookEnv);
assert.equal(duplicateAccepted.status, 200);
assert.equal(inserted.length, 2);
assert.equal(inserted[0].values[0], inserted[1].values[0], "identical deliveries must share the same idempotency key");

const invalidSignature = await worker.fetch(makeRequest("/webhooks/meta", "POST", {
  headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) }, body: webhookEvent
}), webhookEnv);
assert.equal(invalidSignature.status, 401);
const invalidJsonBody = "{";
const invalidJsonSignature = "sha256=" + createHmac("sha256", appSecret).update(invalidJsonBody).digest("hex");
const invalidJson = await worker.fetch(makeRequest("/webhooks/meta", "POST", {
  headers: { "x-hub-signature-256": invalidJsonSignature }, body: invalidJsonBody
}), webhookEnv);
assert.equal(invalidJson.status, 400);

const failedPersistence = await worker.fetch(makeRequest("/webhooks/meta", "POST", {
  headers: { "x-hub-signature-256": signature }, body: webhookEvent
}), { ...webhookEnv, DB: { prepare: () => ({ bind: () => ({ run: async () => ({ success: false }) }) }) } });
assert.equal(failedPersistence.status, 503);
const missingWebhookConfig = await worker.fetch(makeRequest("/webhooks/meta", "POST", {
  headers: { "x-hub-signature-256": signature }, body: webhookEvent
}), { DB: webhookEnv.DB });
assert.equal(missingWebhookConfig.status, 503);
const tooLarge = await worker.fetch(makeRequest("/webhooks/meta", "POST", {
  headers: { "content-length": String(1024 * 1024 + 1), "x-hub-signature-256": signature }, body: webhookEvent
}), webhookEnv);
assert.equal(tooLarge.status, 413);
const streamedOversize = await worker.fetch(new Request("https://publisher.example/webhooks/meta", {
  method: "POST",
  body: new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024 + 1));
      controller.close();
    }
  }),
  duplex: "half"
}), webhookEnv);
assert.equal(streamedOversize.status, 413);
const webhookMethod = await worker.fetch(makeRequest("/webhooks/meta", "PUT"), webhookEnv);
assert.equal(webhookMethod.status, 405);

console.log("PASS: worker health/media routes and Meta webhook challenge, HMAC, schema, bounded body, minimal idempotent D1 persistence, and fail-closed acknowledgements");
