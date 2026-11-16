export function createPublicMediaHost({ baseUrl, fetchImpl = fetch }) {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) throw new Error("INSTAGRAM_MEDIA_BASE_URL is required.");
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
    throw new Error("Instagram media base URL must be a clean HTTPS URL.");
  }
  const rootPath = base.pathname.endsWith("/") ? base.pathname : base.pathname + "/";
  return {
    async resolveAndVerify(asset) {
      const relative = String(asset?.media_path ?? "");
      if (!relative || relative.startsWith("/") || relative.split("/").some((part) => !part || part === "." || part === "..") || /[?#\\]/.test(relative)) {
        throw new Error("Media path must be a safe relative path.");
      }
      const url = new URL(relative.split("/").map(encodeURIComponent).join("/"), base.origin + rootPath);
      if (url.origin !== base.origin || !url.pathname.startsWith(rootPath)) throw new Error("Resolved media URL escaped the configured host or path.");
      let response;
      try { response = await fetchImpl(url.href, { method: "HEAD", redirect: "error", headers: { Accept: "*/*" } }); }
      catch (error) { throw new Error(`Public media host could not be verified: ${error?.name ?? "network error"}.`); }
      if (!response.ok) throw new Error(`Public media host returned HTTP ${response.status}; Meta cannot be given this asset.`);
      const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      const expected = asset.kind === "image" ? "image/jpeg" : asset.kind === "reel" ? "video/mp4" : "";
      if (type !== expected) throw new Error(`Media content type must be ${expected}; received ${type || "missing"}.`);
      const length = Number(response.headers.get("content-length"));
      if (!Number.isSafeInteger(length) || length <= 0) throw new Error("Public media host must provide a positive Content-Length.");
      return { url: url.href, contentType: type, contentLength: length };
    }
  };
}
