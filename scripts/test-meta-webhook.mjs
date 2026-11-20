import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { createMetaWebhookHandler } from "./meta-webhook.mjs";

const verifyToken = "test-verify-token";
const appSecret = "test-app-secret";
const saved = [];
let failPersistence = false;
const server = createServer(createMetaWebhookHandler({
  verifyToken,
  appSecret,
  persistEvent: async (item) => { if (failPersistence) throw new Error("database unavailable"); saved.push(item); }
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
  assert.equal(saved.length, 1);
  assert.equal(saved[0].object, "page");
  assert.equal(saved[0].event.entry.length, 1);

  const badSignature = await fetch(base + "/webhooks/meta", { method: "POST", headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) }, body: event });
  assert.equal(badSignature.status, 401);
  assert.equal(saved.length, 1);

  const malformedBody = "not-json";
  const malformedSignature = "sha256=" + createHmac("sha256", appSecret).update(malformedBody).digest("hex");
  const malformed = await fetch(base + "/webhooks/meta", { method: "POST", headers: { "x-hub-signature-256": malformedSignature }, body: malformedBody });
  assert.equal(malformed.status, 400);

  failPersistence = true;
  const unavailable = await fetch(base + "/webhooks/meta", { method: "POST", headers: { "x-hub-signature-256": signature }, body: event });
  assert.equal(unavailable.status, 503);

  const wrongPath = await fetch(base + "/wrong");
  assert.equal(wrongPath.status, 404);
  console.log("Meta webhook tests: 7/7 passed.");
} finally {
  server.close();
  await once(server, "close");
}
