import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { assertDailyReleaseCapacity } from "./publishing-cadence.mjs";
import { validateReelCampaign, isReelPublished } from "./facebook-reel-guards.mjs";
import { verifyRemoteMedia } from "./facebook-reel-media.mjs";

function stop(message) {
  console.log("SAFE STOP: " + message);
  process.exit(0);
}

const enabled = process.env.PUBLISH_ENABLED === "true";
const dryRun = process.env.PUBLISH_DRY_RUN !== "false";
if (!enabled) stop("PUBLISH_ENABLED is not true; public publishing is disabled.");
if (dryRun) stop("PUBLISH_DRY_RUN is not false; no public publishing is permitted.");

const graphVersion = process.env.META_GRAPH_API_VERSION;
const pageId = process.env.META_PAGE_ID;
const accessToken = process.env.META_PAGE_ACCESS_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const ref = process.env.GITHUB_REF_NAME;
const githubToken = process.env.GITHUB_TOKEN;
const versionParts = typeof graphVersion === "string" ? graphVersion.replace("v", "").split(".") : [];
if (typeof graphVersion !== "string" || !graphVersion.startsWith("v") || versionParts.length !== 2 || versionParts.some((part) => part.length === 0 || [...part].some((ch) => ch < "0" || ch > "9"))) {
  throw new Error("META_GRAPH_API_VERSION must be a supported version.");
}
if (!pageId || !accessToken) throw new Error("Meta Page ID and Page access token are required.");
if (!repo || !ref || !githubToken) throw new Error("Durable GitHub state is required; refusing to publish without it.");

const campaigns = JSON.parse(await readFile(new URL("../data/campaigns.json", import.meta.url), "utf8"));
const approved = campaigns.filter((item) => item?.network === "facebook" && item?.status === "approved" && item?.facebook_type === "REEL");
if (approved.length === 0) stop("No explicitly approved Facebook Reel campaigns exist.");
if (approved.length !== 1) throw new Error("Exactly one approved Reel is allowed per manual run.");
const campaign = approved[0];
const validation = validateReelCampaign(campaign);
if (validation.length) throw new Error("Reel campaign failed release checks: " + validation.join(" "));

const stateUrl = "https://api.github.com/repos/" + repo + "/contents/data/campaigns.json";
const ghHeaders = {
  Accept: "application/vnd.github+json",
  Authorization: "Bearer " + githubToken,
  "X-GitHub-Api-Version": "2022-11-28"
};

async function getState() {
  const response = await fetch(stateUrl + "?ref=" + encodeURIComponent(ref), { headers: ghHeaders });
  if (!response.ok) throw new Error("Could not read durable campaign state (HTTP " + response.status + ").");
  const data = await response.json();
  const content = Buffer.from(data.content.replaceAll("\n", "").replaceAll("\r", ""), "base64").toString("utf8");
  return { sha: data.sha, campaigns: JSON.parse(content) };
}

async function saveState(sha, items, message) {
  const content = Buffer.from(JSON.stringify(items, null, 2) + String.fromCharCode(10)).toString("base64");
  const response = await fetch(stateUrl, {
    method: "PUT",
    headers: { ...ghHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ message, content, sha, branch: ref })
  });
  if (!response.ok) throw new Error("Could not persist campaign state (HTTP " + response.status + "); do not retry the Reel until the Page and state are inspected.");
  return response.json();
}

// Verify the actual remote bytes and digest before reserving campaign state or
// contacting Meta. A missing, changed, or non-video asset must fail before any upload.
const mediaCheck = await verifyRemoteMedia(campaign.media_url, campaign.media_sha256);
console.log("Reel media preflight passed: " + mediaCheck.bytes + " bytes; " + mediaCheck.contentType + "; SHA-256 verified; " +
  mediaCheck.videoMetadata.width + "x" + mediaCheck.videoMetadata.height + "; " +
  mediaCheck.videoMetadata.duration + "s; " + mediaCheck.videoMetadata.frameRate + "fps.");

try {
// Reserve durably before the first Meta request. An ambiguous result remains
// "publishing" and is never retried automatically.
const before = await getState();
const live = before.campaigns.find((item) => item.id === campaign.id);
if (!live || JSON.stringify(live) !== JSON.stringify(campaign)) {
  throw new Error("SAFE STOP: live Reel campaign snapshot changed after checkout.");
}
if (before.campaigns.some((item) => item.status === "publishing")) {
  throw new Error("SAFE STOP: another campaign is in an uncertain publishing state; reconcile it first.");
}
const dailyCapacity = assertDailyReleaseCapacity(before.campaigns, "REEL");
console.log("Johannesburg daily release capacity: " + dailyCapacity.longForm + "/2 long-form videos, " +
  dailyCapacity.reels + "/1 Reel, " + dailyCapacity.total + "/3 total releases used.");

const linkedVideo = before.campaigns.find((item) =>
  item.id === campaign.related_longform_campaign_id &&
  item.facebook_type === "VIDEO" &&
  item.status === "published" &&
  item.platform_video_url === campaign.full_video_url &&
  typeof item.platform_video_id === "string"
);
if (!linkedVideo) stop("The linked long-form episode is not yet confirmed published at the exact URL in this Reel; refusing to publish a disconnected funnel clip.");
const reserved = before.campaigns.map((item) => item.id === campaign.id
  ? { ...item, status: "publishing", publishing_started_at: new Date().toISOString() }
  : item);
await saveState(before.sha, reserved, "Reserve Facebook Reel campaign " + campaign.id);

const graph = "https://graph.facebook.com/" + graphVersion;
const startUrl = new URL(graph + "/" + encodeURIComponent(pageId) + "/video_reels");
startUrl.searchParams.set("upload_phase", "start");
const started = await fetch(startUrl, {
  method: "POST",
  headers: { Authorization: "Bearer " + accessToken }
});
const startPayload = await started.json().catch(() => ({}));
if (!started.ok || !startPayload.video_id || !startPayload.upload_url) {
  throw new Error("Meta Reel upload initialization failed (HTTP " + started.status + "); state remains publishing and must be reconciled manually.");
}
const uploadUrl = new URL(startPayload.upload_url);
if (uploadUrl.protocol !== "https:" || uploadUrl.hostname !== "rupload.facebook.com") {
  throw new Error("Meta returned an unexpected upload host; refusing to send media.");
}

const uploaded = await fetch(uploadUrl, {
  method: "POST",
  headers: {
    Authorization: "OAuth " + accessToken,
    offset: "0",
    file_size: String(mediaCheck.bytes),
    "Content-Type": "application/octet-stream"
  },
  body: createReadStream(mediaCheck.filePath),
  duplex: "half"
});
const uploadPayload = await uploaded.json().catch(() => ({}));
if (!uploaded.ok || uploadPayload.success !== true) {
  throw new Error("Meta Reel media transfer failed (HTTP " + uploaded.status + "); state remains publishing; do not retry automatically.");
}

const finishUrl = new URL(graph + "/" + encodeURIComponent(pageId) + "/video_reels");
finishUrl.searchParams.set("video_id", startPayload.video_id);
finishUrl.searchParams.set("upload_phase", "finish");
finishUrl.searchParams.set("video_state", "PUBLISHED");
finishUrl.searchParams.set("description", campaign.caption);
finishUrl.searchParams.set("title", campaign.title);
const finished = await fetch(finishUrl, {
  method: "POST",
  headers: { Authorization: "Bearer " + accessToken }
});
const finishPayload = await finished.json().catch(() => ({}));
if (!finished.ok || finishPayload.success !== true) {
  throw new Error("Meta Reel publish finalization failed (HTTP " + finished.status + "); state remains publishing; inspect before any retry.");
}

let confirmed = false;
for (let attempt = 0; attempt < 12; attempt++) {
  const statusUrl = new URL(graph + "/" + encodeURIComponent(startPayload.video_id));
  statusUrl.searchParams.set("fields", "status");
  const statusResponse = await fetch(statusUrl, {
    headers: { Authorization: "Bearer " + accessToken }
  });
  const statusPayload = await statusResponse.json().catch(() => ({}));
  if (!statusResponse.ok) throw new Error("Could not verify Reel publication status (HTTP " + statusResponse.status + "); state remains publishing.");
  if (isReelPublished(statusPayload)) { confirmed = true; break; }
  const phase = statusPayload?.status?.publishing_phase?.status;
  if (phase === "error" || statusPayload?.status?.video_status === "error") {
    throw new Error("Meta reports a Reel publishing error; state remains publishing for manual reconciliation.");
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
if (!confirmed) throw new Error("Meta did not return a confirmed published state within the verification window; state remains publishing and must not be retried blindly.");

const after = await getState();
const completed = after.campaigns.map((item) => item.id === campaign.id && item.status === "publishing"
  ? { ...item, status: "published", published_at: new Date().toISOString(), platform_video_id: startPayload.video_id }
  : item);
await saveState(after.sha, completed, "Record verified Facebook Reel publication " + campaign.id);
console.log("Facebook Reel publication verified. Campaign: " + campaign.id + "; video id: " + startPayload.video_id);
} finally {
  await mediaCheck.cleanup();
}
