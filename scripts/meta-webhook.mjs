import { createHmac, createHash, timingSafeEqual } from "node:crypto";

const MAX_BODY_BYTES = 1024 * 1024;

function safeEqual(left, right) {
  const a = Buffer.from(String(left ?? ""));
  const b = Buffer.from(String(right ?? ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readRawBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Webhook body too large"), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function send(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, { "content-type": contentType, "cache-control": "no-store" });
  response.end(body);
}

export function createMetaWebhookHandler({ verifyToken, appSecret, persistEvent }) {
  if (!verifyToken || !appSecret) throw new Error("Meta webhook verification token and app secret are required.");
  if (typeof persistEvent !== "function") throw new Error("A durable, idempotent event persistence function is required.");

  return async function handleMetaWebhook(request, response) {
    const url = new URL(request.url ?? "/", "https://webhook.invalid");
    if (url.pathname !== "/webhooks/meta") return send(response, 404, "Not found");
    if (request.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const suppliedToken = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode !== "subscribe" || !safeEqual(suppliedToken, verifyToken) || !challenge || challenge.length > 2048) {
        return send(response, 403, "Webhook verification rejected");
      }
      return send(response, 200, challenge);
    }
    if (request.method !== "POST") {
      response.setHeader("allow", "GET, POST");
      return send(response, 405, "Method not allowed");
    }

    let rawBody;
    try { rawBody = await readRawBody(request); }
    catch (error) { return send(response, error.statusCode ?? 400, "Invalid webhook body"); }

    const signature = request.headers["x-hub-signature-256"];
    if (typeof signature !== "string" || !/^sha256=[a-f0-9]{64}$/i.test(signature)) {
      return send(response, 401, "Webhook signature missing or malformed");
    }
    const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
    if (!safeEqual(signature.toLowerCase(), expected.toLowerCase())) {
      return send(response, 401, "Webhook signature invalid");
    }

    let event;
    try { event = JSON.parse(rawBody.toString("utf8")); }
    catch { return send(response, 400, "Webhook JSON invalid"); }
    if (!event || typeof event !== "object" || Array.isArray(event) || typeof event.object !== "string" || !Array.isArray(event.entry)) {
      return send(response, 400, "Webhook event schema invalid");
    }

    const eventId = createHash("sha256").update(rawBody).digest("hex");
    try {
      await persistEvent({ event_id: eventId, received_at: new Date().toISOString(), object: event.object, entry_count: event.entry.length, event });
    } catch {
      // Do not acknowledge an event until durable persistence succeeds: Meta may retry delivery.
      return send(response, 503, "Webhook persistence unavailable");
    }
    return send(response, 200, "EVENT_RECEIVED");
  };
}
