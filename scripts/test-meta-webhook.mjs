import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { createMetaWebhookHandler } from "./meta-webhook.mjs";

const verifyToken = "test-verify-token";
const appSecret = "test-app-secret";
const saved = new Map();
let failPersistence = false;
const server = createServer(createMetaWebhookHandler({
  verifyToken,
  appSecret,
  persistEvent: async (item) => { if (failPersistence) throw new Error("database unavailable"); if (!saved.has(item.event_id)) saved.set(item.event_id, item); }
}));
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = "http://127.0.0.1:" + server.address().port;
try {
  const challenge = await fetch(base + "/webhooks/meta?hub.mode=subscribe&hub.verify_token=" + verifyToken + "&hub.challenge=challenge-123");
  assert.equal(challenge.status, 200);
  assert.equal(await challenge.text(), "challenge-123");

  const rejectedChallenge = await fetch(base + "/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123");
  assert.equal(rejectedChallenge.status, 403);

  const event = JSON.stringify({ object: "page", entry: [{ id: "page-test", changes: [{ field: "feed" }] }] });
  const signature = "sha256=" + createHmac("sha256", appSecret).update(event).digest("hex");
  const accepted = await fetch(base + "/webhooks/meta", { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": signature }, body: event });
  assert.equal(accepted.status, 200);
  assert.equal(await accepted.text(), "EVENT_RECEIVED");
  assert.equal(saved.size, 1);
  const firstSaved = [...saved.values()][0];
  assert.equal(firstSaved.object, "page");
  assert.equal(firstSaved.event.entry.length, 1);

  const duplicate = await fetch(base + "/webhooks/meta", { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": signature }, body: event });
  assert.equal(duplicate.status, 200);
  assert.equal(saved.size, 1, "the persistence adapter must deduplicate the deterministic event ID");
  assert.equal([...saved.values()][0].event_id, firstSaved.event_id);

  const badSignature = await fetch(base + "/webhooks/meta", { method: "POST", headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) }, body: event });
  assert.equal(badSignature.status, 401);
  assert.equal(saved.size, 1);

  const invalidSchemaBody = JSON.stringify({ object: "page", entry: {} });
  const invalidSchemaSignature = "sha256=" + createHmac("sha256", appSecret).update(invalidSchemaBody).digest("hex");
  const invalidSchema = await fetch(base + "/webhooks/meta", { method: "POST", headers: { "x-hub-signature-256": invalidSchemaSignature }, body: invalidSchemaBody });
  assert.equal(invalidSchema.status, 400);

  const wrongMethod = await fetch(base + "/webhooks/meta", { method: "PUT" });
  assert.equal(wrongMethod.status, 405);

  const oversized = Buffer.alloc(1024 * 1024 + 1, 65);
  const tooLarge = await fetch(base + "/webhooks/meta", { method: "POST", body: oversized });
  assert.equal(tooLarge.status, 413);

  const malformedBody = "not-json";
  const malformedSignature = "sha256=" + createHmac("sha256", appSecret).update(malformedBody).digest("hex");
  const malformed = await fetch(base + "/webhooks/meta", { method: "POST", headers: { "x-hub-signature-256": malformedSignature }, body: malformedBody });
  assert.equal(malformed.status, 400);

  failPersistence = true;
  const unavailable = await fetch(base + "/webhooks/meta", { method: "POST", headers: { "x-hub-signature-256": signature }, body: event });
  assert.equal(unavailable.status, 503);

  const wrongPath = await fetch(base + "/wrong");
  assert.equal(wrongPath.status, 404);
  console.log("Meta webhook tests: PASS (signature, challenge, schema, size, idempotency and persistence).");
} finally {
  server.close();
  await once(server, "close");
}
