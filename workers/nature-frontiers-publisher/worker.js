const MEDIA_PATH = /^\/media\/instagram\/media-([a-f0-9]{64})\.(jpg|jpeg|mp4)$/i;
const ALLOWED_TYPES = new Set(["image/jpeg", "video/mp4"]);
const MAX_WEBHOOK_BYTES = 1024 * 1024;

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function toHex(bytes) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(bytes) {
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

async function verifyMetaSignature(rawBody, signature, appSecret) {
  if (typeof signature !== "string" || !/^sha256=[a-f0-9]{64}$/i.test(signature) || typeof appSecret !== "string" || !appSecret) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, rawBody);
  return constantTimeEqual(signature.toLowerCase(), `sha256=${toHex(digest)}`);
}

async function readBoundedBody(request, limit) {
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error("Webhook body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

async function handleMetaWebhook(request, env) {
  const url = new URL(request.url);
  if (request.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode !== "subscribe" || !constantTimeEqual(token, env.META_WEBHOOK_VERIFY_TOKEN) || !challenge || challenge.length > 2048) {
      return new Response("Webhook verification rejected", { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST", "Cache-Control": "no-store" } });
  if (!env.META_APP_SECRET || !env.META_WEBHOOK_VERIFY_TOKEN || !env.DB) return json({ ok: false, error: "webhook_configuration_unavailable" }, 503);

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_WEBHOOK_BYTES) return new Response("Webhook body too large", { status: 413, headers: { "Cache-Control": "no-store" } });
  let rawBody;
  try { rawBody = await readBoundedBody(request, MAX_WEBHOOK_BYTES); }
  catch { return new Response("Webhook body too large", { status: 413, headers: { "Cache-Control": "no-store" } }); }
  const signature = request.headers.get("x-hub-signature-256");
  if (!(await verifyMetaSignature(rawBody, signature, env.META_APP_SECRET))) {
    return new Response("Webhook signature invalid", { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  let event;
  try { event = JSON.parse(new TextDecoder().decode(rawBody)); }
  catch { return new Response("Webhook JSON invalid", { status: 400, headers: { "Cache-Control": "no-store" } }); }
  if (!event || typeof event !== "object" || Array.isArray(event) || typeof event.object !== "string" || !Array.isArray(event.entry)) {
    return new Response("Webhook event schema invalid", { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const eventId = await sha256Hex(rawBody);
    const result = await env.DB.prepare(
      "INSERT OR IGNORE INTO meta_webhook_events (event_id, received_at, object_type, entry_count) VALUES (?, ?, ?, ?)"
    ).bind(eventId, new Date().toISOString(), event.object, event.entry.length).run();
    if (result?.success !== true) throw new Error("D1 persistence failed");
  } catch {
    return new Response("Webhook persistence unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return new Response("EVENT_RECEIVED", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
      try {
        const row = await env.DB.prepare("SELECT COUNT(*) AS table_count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").first();
        return Response.json({
          service: "nature-frontiers-publisher",
          status: "online",
          database: row?.table_count >= 6 ? "connected" : "schema_incomplete",
          publishingEnabled: false,
          dryRun: true,
          emergencyStop: true,
          timestamp: new Date().toISOString()
        }, { headers: { "Cache-Control": "no-store" } });
      } catch {
        return json({ service: "nature-frontiers-publisher", status: "degraded", database: "unavailable", publishingEnabled: false, dryRun: true, emergencyStop: true }, 503);
      }
    }

    if (url.pathname === "/webhooks/meta") return handleMetaWebhook(request, env);

    const mediaMatch = MEDIA_PATH.exec(url.pathname);
    if (mediaMatch) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
      }
      if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
        return json({ ok: false, error: "media_assets_binding_unavailable" }, 503);
      }
      const response = await env.ASSETS.fetch(request);
      if (!response.ok) return new Response("Media not found", { status: response.status === 404 ? 404 : 502, headers: { "Cache-Control": "no-store" } });
      const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!ALLOWED_TYPES.has(contentType)) return new Response("Unsupported media type", { status: 415, headers: { "Cache-Control": "no-store" } });
      const expectedExtension = contentType === "image/jpeg" ? /\.(jpg|jpeg)$/i : /\.mp4$/i;
      if (!expectedExtension.test(url.pathname)) return new Response("Media extension and content type mismatch", { status: 415, headers: { "Cache-Control": "no-store" } });
      const headers = new Headers(response.headers);
      headers.set("Content-Type", contentType);
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.delete("Set-Cookie");
      return new Response(request.method === "HEAD" ? null : response.body, { status: 200, headers });
    }

    return json({ ok: false, error: "not_found" }, 404);
  }
};
