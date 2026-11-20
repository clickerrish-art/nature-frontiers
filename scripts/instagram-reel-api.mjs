function assertGraphConfig({ graphVersion, instagramUserId, accessToken }) {
  if (typeof graphVersion !== "string" || !/^v\d+\.\d+$/.test(graphVersion)) throw new Error("Instagram Graph API version must be configured as vNN.N.");
  if (typeof instagramUserId !== "string" || !/^\d+$/.test(instagramUserId)) throw new Error("A numeric Instagram professional account ID is required.");
  if (typeof accessToken !== "string" || !accessToken.trim()) throw new Error("Instagram publishing access token is required.");
}

async function readJson(response, operation) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const code = payload?.error?.code ?? "unknown";
    throw new Error(operation + " failed (HTTP " + response.status + ", Meta code " + code + "); operation outcome must be reconciled before any retry.");
  }
  return payload;
}

export async function createInstagramReelContainer({
  graphVersion, instagramUserId, accessToken, videoUrl, caption, shareToFeed, fetchImpl = fetch
}) {
  assertGraphConfig({ graphVersion, instagramUserId, accessToken });
  let url;
  try { url = new URL(videoUrl); } catch { throw new Error("Instagram video URL must be a public HTTPS URL."); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash || url.port) {
    throw new Error("Instagram video URL must be a public HTTPS URL without credentials, fragments or non-standard ports.");
  }
  if (typeof caption !== "string" || !caption.trim() || caption.length > 2200) throw new Error("Instagram Reel caption must contain 1–2,200 characters.");
  if (typeof shareToFeed !== "boolean") throw new Error("share_to_feed must be explicitly true or false.");
  const endpoint = "https://graph.facebook.com/" + graphVersion + "/" + encodeURIComponent(instagramUserId) + "/media";
  const body = new URLSearchParams({
    media_type: "REELS",
    video_url: url.href,
    caption,
    share_to_feed: String(shareToFeed)
  });
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(30000)
  });
  const payload = await readJson(response, "Instagram Reel container creation");
  if (typeof payload.id !== "string" || !payload.id.trim()) throw new Error("Instagram did not return a container ID; do not retry blindly.");
  return payload.id;
}

export async function getInstagramReelContainerStatus({
  graphVersion, accessToken, containerId, fetchImpl = fetch
}) {
  if (typeof graphVersion !== "string" || !/^v\d+\.\d+$/.test(graphVersion) ||
      typeof accessToken !== "string" || !accessToken.trim() ||
      typeof containerId !== "string" || !containerId.trim()) {
    throw new Error("Instagram container status lookup requires a Graph version, token and container ID.");
  }
  const url = new URL("https://graph.facebook.com/" + graphVersion + "/" + encodeURIComponent(containerId));
  url.searchParams.set("fields", "status_code,status");
  const response = await fetchImpl(url, {
    headers: { Authorization: "Bearer " + accessToken },
    signal: AbortSignal.timeout(15000)
  });
  const payload = await readJson(response, "Instagram Reel container status read");
  return { statusCode: payload.status_code, status: payload.status ?? "" };
}

export async function publishInstagramReelContainer({
  graphVersion, instagramUserId, accessToken, containerId, fetchImpl = fetch
}) {
  assertGraphConfig({ graphVersion, instagramUserId, accessToken });
  if (typeof containerId !== "string" || !containerId.trim()) throw new Error("A finished Instagram Reel container ID is required.");
  const endpoint = "https://graph.facebook.com/" + graphVersion + "/" + encodeURIComponent(instagramUserId) + "/media_publish";
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: containerId }),
    signal: AbortSignal.timeout(30000)
  });
  const payload = await readJson(response, "Instagram Reel publish request");
  if (typeof payload.id !== "string" || !payload.id.trim()) throw new Error("Instagram publish response did not contain a media ID; reconcile before any retry.");
  return payload.id;
}

export async function verifyInstagramPublishedReel({
  graphVersion, accessToken, mediaId, expectedCaption, fetchImpl = fetch
}) {
  if (typeof graphVersion !== "string" || !/^v\d+\.\d+$/.test(graphVersion) ||
      typeof accessToken !== "string" || !accessToken.trim() ||
      typeof mediaId !== "string" || !mediaId.trim()) {
    throw new Error("Instagram publication verification requires a Graph version, token and media ID.");
  }
  const url = new URL("https://graph.facebook.com/" + graphVersion + "/" + encodeURIComponent(mediaId));
  url.searchParams.set("fields", "id,media_type,media_product_type,permalink,caption,timestamp,username");
  const response = await fetchImpl(url, {
    headers: { Authorization: "Bearer " + accessToken },
    signal: AbortSignal.timeout(15000)
  });
  const payload = await readJson(response, "Instagram Reel remote verification");
  if (payload.id !== mediaId || payload.media_type !== "VIDEO" || payload.media_product_type !== "REELS" ||
      typeof payload.permalink !== "string" || !payload.permalink.startsWith("https://") ||
      payload.caption !== expectedCaption) {
    throw new Error("Instagram remote Reel does not match the exact approved media ID, video type, REELS product surface, permalink and caption.");
  }
  return { id: payload.id, permalink: payload.permalink, timestamp: payload.timestamp, username: payload.username };
}

export async function publishInstagramReelFlow({
  graphVersion, instagramUserId, accessToken, videoUrl, caption, shareToFeed,
  fetchImpl = fetch, waitImpl = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  maxStatusAttempts = 24, pollIntervalMs = 5000
}) {
  const containerId = await createInstagramReelContainer({
    graphVersion, instagramUserId, accessToken, videoUrl, caption, shareToFeed, fetchImpl
  });
  let finished = false;
  for (let attempt = 0; attempt < maxStatusAttempts; attempt++) {
    const status = await getInstagramReelContainerStatus({ graphVersion, accessToken, containerId, fetchImpl });
    if (status.statusCode === "FINISHED") { finished = true; break; }
    if (status.statusCode === "ERROR" || status.statusCode === "EXPIRED") {
      throw new Error("Instagram Reel container entered terminal status " + status.statusCode + "; do not publish or recreate automatically.");
    }
    if (attempt < maxStatusAttempts - 1) await waitImpl(pollIntervalMs);
  }
  if (!finished) throw new Error("Instagram Reel container did not reach FINISHED within the verification window; do not publish or recreate automatically.");
  const mediaId = await publishInstagramReelContainer({ graphVersion, instagramUserId, accessToken, containerId, fetchImpl });
  const remote = await verifyInstagramPublishedReel({ graphVersion, accessToken, mediaId, expectedCaption: caption, fetchImpl });
  return { containerId, mediaId, permalink: remote.permalink, timestamp: remote.timestamp, username: remote.username };
}
