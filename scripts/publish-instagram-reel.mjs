import { readFile } from "node:fs/promises";
import { isVerifiedMetaPageIdentity, isVerifiedMetaInstagramIdentity } from "./meta-page-identity.mjs";
import { validateInstagramReelCampaign } from "./instagram-reel-guards.mjs";
import { verifyRemoteMedia } from "./facebook-reel-media.mjs";
import { publishInstagramReelFlow } from "./instagram-reel-api.mjs";
import { validatePrepublishCampaign } from "./prepublish-gate.mjs";

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
const expectedPageId = process.env.META_EXPECTED_PAGE_ID;
const selectedCampaignId = process.env.PUBLISH_CAMPAIGN_ID ?? "";
const instagramUserId = process.env.META_INSTAGRAM_USER_ID;
const expectedInstagramUserId = process.env.META_EXPECTED_INSTAGRAM_USER_ID;
const accessToken = process.env.META_PAGE_ACCESS_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const ref = process.env.GITHUB_REF_NAME;
const githubToken = process.env.GITHUB_TOKEN;

if (!isVerifiedMetaPageIdentity(pageId, expectedPageId)) {
  throw new Error("Configured Meta Page ID must match the independently configured expected Nature Frontiers Page ID.");
}
if (!isVerifiedMetaInstagramIdentity(instagramUserId, expectedInstagramUserId)) {
  throw new Error("Configured Instagram professional account ID must match the independently configured expected Nature Frontiers Instagram ID.");
}
if (typeof graphVersion !== "string" || !/^v\d+\.\d+$/.test(graphVersion)) {
  throw new Error("META_GRAPH_API_VERSION must be configured as vNN.N.");
}
if (!accessToken) throw new Error("Meta Page access token is required.");
if (!selectedCampaignId) safeStop("PUBLISH_CAMPAIGN_ID must identify the exact approved campaign for this one-shot run.");
if (!repo || !ref || !githubToken) throw new Error("Durable GitHub state is required; refusing to publish without it.");

const localCampaigns = JSON.parse(await readFile(new URL("../data/campaigns.json", import.meta.url), "utf8"));
const approved = localCampaigns.filter((item) =>
  item?.id === selectedCampaignId && item?.network === "instagram" && item?.status === "approved" && item?.instagram_type === "REEL");
if (approved.length === 0) safeStop("No explicitly approved Instagram Reel campaign matches PUBLISH_CAMPAIGN_ID.");
if (approved.length !== 1) throw new Error("Exactly one approved Instagram Reel is allowed per manual run.");
const campaign = approved[0];
const policy = JSON.parse(await readFile(new URL("../data/prepublish-policy.json", import.meta.url), "utf8"));
const prepublish = validatePrepublishCampaign(campaign, localCampaigns, policy);
if (!prepublish.ok) throw new Error("Prepublish gate failed: " + prepublish.issues.map((item) => item.code + ": " + item.message).join(" "));
const validation = validateInstagramReelCampaign(campaign);
if (validation.length) throw new Error("Instagram Reel failed release checks: " + validation.join(" "));

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
  if (!response.ok) throw new Error("Could not read durable Instagram campaign state (HTTP " + response.status + ").");
  const data = await response.json();
  const encoded = data.content.replaceAll("\n", "").replaceAll("\r", "");
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  return { sha: data.sha, campaigns: JSON.parse(decoded) };
}

async function saveState(sha, items, message) {
  const encoded = Buffer.from(JSON.stringify(items, null, 2) + String.fromCharCode(10)).toString("base64");
  const response = await fetch(stateUrl, {
    method: "PUT",
    headers: { ...ghHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ message, content: encoded, sha, branch: ref }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error("Could not persist Instagram campaign state (HTTP " + response.status + "); reconcile remote status before any retry.");
  return response.json();
}

async function updateReservedCampaign(fields, message) {
  const current = await getState();
  let found = false;
  const updated = current.campaigns.map((item) => {
    if (item.id !== campaign.id) return item;
    if (item.status !== "publishing") throw new Error("Campaign is no longer reserved as publishing; stop and reconcile.");
    found = true;
    return { ...item, ...fields };
  });
  if (!found) throw new Error("Reserved Instagram campaign disappeared from durable state.");
  await saveState(current.sha, updated, message);
}

let mediaCheck;
let reserved = false;
try {
  mediaCheck = await verifyRemoteMedia(
    campaign.media_url,
    campaign.media_sha256,
    fetch,
    undefined,
    1024 * 1024 * 1024,
    undefined,
    { minSeconds: 50, maxSeconds: 60, requireInstagramProfile: true }
  );
  if (Math.abs(mediaCheck.videoMetadata.duration - campaign.duration_seconds) > 1.5) {
    throw new Error("Measured Instagram Reel duration does not match the approved campaign manifest.");
  }
  console.log("Instagram media preflight passed: " + mediaCheck.bytes + " bytes; SHA-256 verified; " +
    mediaCheck.videoMetadata.width + "x" + mediaCheck.videoMetadata.height + "; " +
    mediaCheck.videoMetadata.duration + " seconds; " + mediaCheck.videoMetadata.frameRate + " fps; " +
    mediaCheck.videoMetadata.videoCodec + "; " + mediaCheck.videoMetadata.audioMetadata.format + " " +
    mediaCheck.videoMetadata.audioMetadata.sampleRateHz + " Hz.");

  const before = await getState();
  const live = before.campaigns.find((item) => item.id === campaign.id);
  if (!live || JSON.stringify(live) !== JSON.stringify(campaign)) {
    throw new Error("SAFE STOP: live Instagram campaign snapshot changed after checkout.");
  }
  if (before.campaigns.some((item) => item.status === "publishing")) {
    throw new Error("SAFE STOP: another campaign is already in an uncertain publishing state; reconcile it first.");
  }

  const reservedItems = before.campaigns.map((item) => item.id === campaign.id
    ? { ...item, status: "publishing", publishing_started_at: new Date().toISOString(), platform: "instagram" }
    : item);
  await saveState(before.sha, reservedItems, "Reserve Nature Frontiers Instagram Reel " + campaign.id);
  reserved = true;

  const published = await publishInstagramReelFlow({
    graphVersion,
    instagramUserId,
    accessToken,
    videoUrl: mediaCheck.finalUrl,
    caption: campaign.caption,
    shareToFeed: campaign.share_to_feed,
    onContainerCreated: async (containerId) => {
      await updateReservedCampaign({ instagram_container_id: containerId }, "Record Instagram Reel container " + containerId + " for " + campaign.id);
    },
    onMediaCreated: async (mediaId) => {
      await updateReservedCampaign({ instagram_media_id: mediaId }, "Record Instagram Reel media ID " + mediaId + " for " + campaign.id);
    }
  });

  const after = await getState();
  const completed = after.campaigns.map((item) => item.id === campaign.id && item.status === "publishing"
    ? {
        ...item,
        status: "published",
        published_at: published.timestamp ?? new Date().toISOString(),
        platform_media_id: published.mediaId,
        platform_media_url: published.permalink,
        platform_username: published.username,
        instagram_container_id: published.containerId
      }
    : item);
  await saveState(after.sha, completed, "Record verified Nature Frontiers Instagram Reel " + campaign.id);
  console.log("PUBLISHED AND VERIFIED: " + campaign.id + "; Instagram media ID " + published.mediaId + "; " + published.permalink);
} catch (error) {
  if (reserved) console.error("Campaign remains reserved as publishing. Do not retry until the Instagram container/media status and durable repository state have been reconciled.");
  throw error;
} finally {
  if (mediaCheck?.cleanup) await mediaCheck.cleanup();
}
