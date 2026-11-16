const MEDIA_PATH = /^\/media\/instagram\/media-([a-f0-9]{64})\.(jpg|jpeg|mp4)$/i;
const ALLOWED_TYPES = new Set(["image/jpeg", "video/mp4"]);

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
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

    const mediaMatch = MEDIA_PATH.exec(url.pathname);
    if (mediaMatch) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
      }
      if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
        return json({ ok: false, error: "media_assets_binding_unavailable" }, 503);
      }
      const response = await env.ASSETS.fetch(new Request(url, request));
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
