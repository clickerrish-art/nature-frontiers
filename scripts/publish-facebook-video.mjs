import { readFile } from "node:fs/promises";
import { assertDailyReleaseCapacity } from "./publishing-cadence.mjs";
import { validateLongFormVideoCampaign, toMetaAdBreakOffsetsMilliseconds } from "./facebook-video-guards.mjs";
import { verifyRemoteLongFormVideo } from "./facebook-video-media.mjs";

function safeStop(message) {
  console.log("SAFE STOP: " + message);
  process.exit(0);
}

const enabled = process.env.PUBLISH_ENABLED === "true";
const dryRun = process.env.PUBLISH_DRY_RUN !== "false";
if (!enabled) safeStop("PUBLISH_ENABLED is not true; public publishing is disabled.");
if (dryRun) safeStop("PUBLISH_DRY_RUN is not false; no public publishing is permitted.");

const graphVersion = process.env.META_GRAPH_API_VERSION;
const pageId = process.env.META_PAGE_ID;
const accessToken = process.env.META_PAGE_ACCESS_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const ref = process.env.GITHUB_REF_NAME;
const githubToken = process.env.GITHUB_TOKEN;
const versionParts = typeof graphVersion === "string" ? graphVersion.replace("v", "").split(".") : [];
if (typeof graphVersion !== "string" || !graphVersion.startsWith("v") || versionParts.length !== 2 ||
    versionParts.some((part) => part.length === 0 || [...part].some((ch) => ch < "0" || ch > "9"))) {
  throw new Error("META_GRAPH_API_VERSION must be configured as vNN.N.");
}
if (!pageId || !accessToken) throw new Error("Meta Page ID and Page access token are required.");
if (!repo || !ref || !githubToken) throw new Error("Durable GitHub state is required; refusing to publish without it.");

const localCampaigns = JSON.parse(await readFile(new URL("../data/campaigns.json", import.meta.url), "utf8"));
const approved = localCampaigns.filter((item) =>
  item?.network === "facebook" && item?.status === "approved" && item?.facebook_type === "VIDEO");
if (approved.length === 0) safeStop("No explicitly approved long-form Facebook video campaigns exist.");
if (approved.length !== 1) throw new Error("Exactly one approved long-form video is allowed per manual run.");
const campaign = approved[0];
const validation = validateLongFormVideoCampaign(campaign);
if (validation.length) throw new Error("Long-form video failed release checks: " + validation.join(" "));

const stateUrl = "https://api.github.com/repos/" + repo + "/contents/data/campaigns.json";
const ghHeaders = {
  Accept: "application/vnd.github+json",
  Authorization: "Bearer " + githubToken,
  "X-GitHub-Api-Version": "2022-11-28"
};

async function getState() {
  const response = await fetch(stateUrl + "?ref=" + encodeURIComponent(ref), {
    headers: ghHeaders,
    signal: AbortSignal.timeout(15000)
  });
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
    body: JSON.stringify({ message, content, sha, branch: ref }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error("Could not persist campaign state (HTTP " + response.status + "); do not retry until delivery status and repository state are reconciled.");
  return response.json();
}

async function graphGetVideo(videoId) {
  const url = new URL("https://graph.facebook.com/" + graphVersion + "/" + encodeURIComponent(videoId));
  url.searchParams.set("fields", "id,published,permalink_url,status");
  const response = await fetch(url, {
    headers: { Authorization: "Bearer " + accessToken },
    signal: AbortSignal.timeout(15000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    throw new Error("Meta video status read failed (HTTP " + response.status + "); reconcile manually before any retry.");
  }
  return payload;
}

let mediaCheck;
let reserved = false;
try {
  mediaCheck = await verifyRemoteLongFormVideo(campaign.media_url, campaign.media_sha256);
  const actualDuration = mediaCheck.videoMetadata.duration;
  if (Math.abs(actualDuration - campaign.duration_seconds) > 1.5) {
    throw new Error("Measured video duration does not match the approved campaign manifest.");
  }
  console.log("Long-form media preflight passed: " + mediaCheck.bytes + " bytes; " +
    mediaCheck.contentType + "; SHA-256 verified; " + mediaCheck.videoMetadata.width + "x" +
    mediaCheck.videoMetadata.height + "; " + actualDuration + " seconds; " +
    mediaCheck.videoMetadata.frameRate + " fps.");
  console.log("Requested Meta ad-break offsets in milliseconds (ad serving still depends on eligibility and Meta delivery): " +
    JSON.stringify(toMetaAdBreakOffsetsMilliseconds(campaign)) + ".");
  console.log("Editorial ad-break markers and transition notes (for the edit): " +
    campaign.editorial_ad_breaks_seconds.map((seconds) => {
      const minutes = Math.floor(seconds / 60);
      const remainder = String(seconds % 60).padStart(2, "0");
      return minutes + ":" + remainder;
    }).join(", ") + ".");

  const before = await getState();
  const live = before.campaigns.find((item) => item.id === campaign.id);
  if (!live || JSON.stringify(live) !== JSON.stringify(campaign)) {
    throw new Error("SAFE STOP: live long-form campaign snapshot changed after checkout.");
  }
  if (before.campaigns.some((item) => item.status === "publishing")) {
    throw new Error("SAFE STOP: another campaign is already in an uncertain publishing state; reconcile it first.");
  }
  const dailyCapacity = assertDailyReleaseCapacity(before.campaigns, "VIDEO");
  console.log("Johannesburg daily release capacity: " + dailyCapacity.longForm + "/2 long-form videos, " +
    dailyCapacity.reels + "/1 Reel, " + dailyCapacity.total + "/3 total releases used.");

  const reservedItems = before.campaigns.map((item) => item.id === campaign.id
    ? { ...item, status: "publishing", publishing_started_at: new Date().toISOString() }
    : item);
  await saveState(before.sha, reservedItems, "Reserve Nature Frontiers long-form video " + campaign.id);
  reserved = true;

  const endpoint = "https://graph-video.facebook.com/" + graphVersion + "/" + encodeURIComponent(pageId) + "/videos";
  const body = new URLSearchParams({
    file_url: mediaCheck.finalUrl,
    title: campaign.title,
    description: campaign.caption,
    published: "true",
    ad_breaks: JSON.stringify(toMetaAdBreakOffsetsMilliseconds(campaign))
  });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body,
    signal: AbortSignal.timeout(180000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error || !payload?.id) {
    throw new Error("Meta long-form video upload failed or returned an ambiguous result (HTTP " + response.status + "); campaign remains reserved as publishing and must be reconciled before retry.");
  }

  let confirmed;
  for (let attempt = 0; attempt < 18; attempt++) {
    confirmed = await graphGetVideo(payload.id);
    if (confirmed.published === true && typeof confirmed.permalink_url === "string" && confirmed.permalink_url.startsWith("https://")) break;
    const videoStatus = confirmed?.status?.video_status;
    if (videoStatus === "error" || videoStatus === "upload_failed" || confirmed?.status?.publishing_phase?.publish_status === "error") {
      throw new Error("Meta reports a video processing or publishing error; campaign remains reserved for manual reconciliation.");
    }
    if (attempt < 17) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (confirmed?.published !== true || typeof confirmed?.permalink_url !== "string" || !confirmed.permalink_url.startsWith("https://")) {
    throw new Error("Meta has not explicitly confirmed the long-form video as published; campaign remains reserved and will not be retried automatically.");
  }

  const after = await getState();
  const completed = after.campaigns.map((item) => item.id === campaign.id && item.status === "publishing"
    ? {
        ...item,
        status: "published",
        published_at: new Date().toISOString(),
        platform_video_id: payload.id,
        platform_video_url: confirmed.permalink_url
      }
    : item);
  await saveState(after.sha, completed, "Record confirmed Nature Frontiers video publication " + campaign.id);
  console.log("PUBLISHED: " + campaign.id + "; Meta video ID " + payload.id + "; " + confirmed.permalink_url);
} finally {
  if (mediaCheck?.cleanup) await mediaCheck.cleanup();
}
