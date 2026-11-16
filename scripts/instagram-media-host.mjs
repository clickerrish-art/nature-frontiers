import { createHash } from "node:crypto";
import { isIP } from "node:net";

function assertPublicHost(url) {
  const host = url.hostname.toLowerCase();
  if (isIP(host)) throw new Error("Instagram media host must use a public DNS hostname, not an IP literal.");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === "0.0.0.0" || host === "::1") {
    throw new Error("Instagram media host must be a publicly routable hostname.");
  }
}

export function createPublicMediaHost({ baseUrl, fetchImpl = fetch }) {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) throw new Error("INSTAGRAM_MEDIA_BASE_URL is required.");
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
    throw new Error("Instagram media base URL must be a clean HTTPS URL.");
  }
  assertPublicHost(base);
  const rootPath = base.pathname.endsWith("/") ? base.pathname : base.pathname + "/";
  return {
    async resolveAndVerify(asset) {
      const relative = String(asset?.media_path ?? "");
      if (!relative || relative.startsWith("/") || relative.split("/").some((part) => !part || part === "." || part === "..") || /[?#\\]/.test(relative)) {
        throw new Error("Media path must be a safe relative path.");
      }
      const url = new URL(relative.split("/").map(encodeURIComponent).join("/"), base.origin + rootPath);
      if (url.origin !== base.origin || !url.pathname.startsWith(rootPath)) throw new Error("Resolved media URL escaped the configured host or path.");
      const expectedType = asset.kind === "image" ? "image/jpeg" : asset.kind === "reel" ? "video/mp4" : "";
      if (!expectedType || !/^[a-f0-9]{64}$/i.test(asset.sha256 ?? "")) throw new Error("Media kind and SHA-256 are required.");
      let response;
      try { response = await fetchImpl(url.href, { method: "GET", redirect: "error", headers: { Accept: expectedType } }); }
      catch (error) { throw new Error(`Public media host could not be verified: ${error?.name ?? "network error"}.`); }
      if (!response.ok) throw new Error(`Public media host returned HTTP ${response.status}; Meta cannot be given this asset.`);
      const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (type !== expectedType) throw new Error(`Media content type must be ${expectedType}; received ${type || "missing"}.`);
      const length = Number(response.headers.get("content-length"));
      const maxBytes = asset.kind === "image" ? 8 * 1000 * 1000 : 300 * 1000 * 1000;
      if (!Number.isSafeInteger(length) || length <= 0 || length > maxBytes) throw new Error("Media host must provide a valid Content-Length within the configured safety limit.");
      if (!response.body || typeof response.body[Symbol.asyncIterator] !== "function") throw new Error("Media response streaming is unavailable; content hash cannot be verified.");
      const hash = createHash("sha256");
      let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > maxBytes) throw new Error("Media exceeds the configured size limit.");
        hash.update(chunk);
      }
      if (bytes !== length) throw new Error("Downloaded media byte count does not match Content-Length.");
      if (hash.digest("hex") !== asset.sha256.toLowerCase()) throw new Error("Hosted media SHA-256 does not match the human-approved asset hash.");
      return { url: url.href, contentType: type, contentLength: length, sha256: asset.sha256.toLowerCase() };
    }
  };
}
