const GRAPH_HOST = "https://graph.facebook.com";

function requireConfig(config) {
  if (!config || !/^v\d+\.\d+$/.test(config.apiVersion ?? "")) throw new Error("A valid Instagram Graph API version is required.");
  if (!/^\d+$/.test(config.instagramUserId ?? "")) throw new Error("A numeric Instagram professional account ID is required.");
  if (typeof config.accessToken !== "string" || !config.accessToken.trim()) throw new Error("Instagram access token is required.");
  if (typeof config.fetchImpl !== "function" && typeof fetch !== "function") throw new Error("Fetch implementation is unavailable.");
}

function publicHttpsUrl(value, field) {
  let url;
  try { url = new URL(value); } catch { throw new Error(field + " must be an absolute HTTPS URL."); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    throw new Error(field + " must be a public HTTPS URL without embedded credentials.");
  }
  return url.href;
}

async function request(config, path, { method = "GET", body } = {}) {
  requireConfig(config);
  const fetcher = config.fetchImpl ?? fetch;
  const url = `${GRAPH_HOST}/${config.apiVersion}/${path}`;
  let response;
  try {
    response = await fetcher(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
  } catch (error) {
    throw new Error(`Instagram Graph API transport outcome is ambiguous; do not retry automatically. (${error?.name ?? "Error"})`);
  }
  const raw = await response.text();
  let payload;
  try { payload = JSON.parse(raw); } catch { payload = null; }
  if (!response.ok || !payload || payload.error) {
    const code = Number.isInteger(Number(payload?.error?.code)) ? Number(payload.error.code) : "unknown";
    throw new Error(`Instagram Graph API request failed (HTTP ${response.status}, code ${code}). No automatic retry was attempted.`);
  }
  return payload;
}

/** Creates an unpublished media container. The media URL must be publicly fetchable by Meta. */
export async function createInstagramMediaContainer(config, media) {
  if (!media || typeof media !== "object") throw new Error("Media details are required.");
  const body = { caption: String(media.caption ?? "") };
  if (media.kind === "image") {
    body.image_url = publicHttpsUrl(media.url, "image URL");
  } else if (media.kind === "reel") {
    body.media_type = "REELS";
    body.video_url = publicHttpsUrl(media.url, "video URL");
    if (media.shareToFeed !== undefined) body.share_to_feed = Boolean(media.shareToFeed);
  } else {
    throw new Error("Media kind must be image or reel.");
  }
  const result = await request(config, `${encodeURIComponent(config.instagramUserId)}/media`, { method: "POST", body });
  if (typeof result.id !== "string" || !result.id) throw new Error("Meta did not return a media container ID; inspect the request before any retry.");
  return { containerId: result.id };
}

/** Reads Meta's asynchronous container state. */
export async function getInstagramContainerStatus(config, containerId) {
  if (typeof containerId !== "string" || !containerId.trim()) throw new Error("A media container ID is required.");
  const query = new URLSearchParams({ fields: "status_code" });
  const result = await request(config, `${encodeURIComponent(containerId)}?${query}`);
  if (typeof result.status_code !== "string") throw new Error("Meta did not return a container status.");
  return { id: result.id ?? containerId, statusCode: result.status_code };
}

/** Publishes only a container Meta reports as FINISHED. Never retries publication. */
export async function publishInstagramContainer(config, containerId) {
  const state = await getInstagramContainerStatus(config, containerId);
  if (state.statusCode !== "FINISHED") {
    throw new Error(`Container is ${state.statusCode}; publication is blocked. No publish request was sent.`);
  }
  const result = await request(config, `${encodeURIComponent(config.instagramUserId)}/media_publish`, {
    method: "POST",
    body: { creation_id: containerId }
  });
  if (typeof result.id !== "string" || !result.id) {
    throw new Error("Instagram publish response did not contain a media ID; result is ambiguous. Inspect the account before any retry.");
  }
  return { mediaId: result.id };
}

/** Reads back the published media object for remote verification. */
export async function verifyInstagramMedia(config, mediaId) {
  if (typeof mediaId !== "string" || !mediaId.trim()) throw new Error("An Instagram media ID is required.");
  const query = new URLSearchParams({ fields: "id,permalink,timestamp,media_type" });
  const result = await request(config, `${encodeURIComponent(mediaId)}?${query}`);
  if (result.id !== mediaId || typeof result.permalink !== "string" || !result.permalink.startsWith("https://")) {
    throw new Error("Instagram media read-back did not confirm the expected media ID and permalink.");
  }
  return {
    id: result.id,
    permalink: result.permalink,
    timestamp: typeof result.timestamp === "string" ? result.timestamp : null,
    mediaType: typeof result.media_type === "string" ? result.media_type : null
  };
}

/** Lists recent account media for conservative reconciliation after an ambiguous publish. */
export async function listRecentInstagramMedia(config, limit = 100) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 100));
  const query = new URLSearchParams({ fields: "id,caption,timestamp,media_type,permalink", limit: String(safeLimit) });
  const result = await request(config, `${encodeURIComponent(config.instagramUserId)}/media?${query}`);
  if (!Array.isArray(result.data)) throw new Error("Instagram media listing did not return a data array.");
  return result.data;
}

/** Reads the account's rolling publishing quota before reserving a live publish. */
export async function getInstagramPublishingLimit(config) {
  const query = new URLSearchParams({ fields: "quota_usage,config" });
  const result = await request(config, `${encodeURIComponent(config.instagramUserId)}/content_publishing_limit?${query}`);
  if (!Array.isArray(result.data) || !result.data.length || !Number.isFinite(Number(result.data[0].quota_usage))) {
    throw new Error("Instagram publishing limit response was missing quota_usage; publication is blocked.");
  }
  return { quotaUsage: Number(result.data[0].quota_usage), config: result.data[0].config ?? null };
}
