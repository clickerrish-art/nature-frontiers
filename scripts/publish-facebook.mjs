import { readFile } from "node:fs/promises";

const enabled = process.env.PUBLISH_ENABLED === "true";
const dryRun = process.env.PUBLISH_DRY_RUN !== "false";
const graphVersion = process.env.META_GRAPH_API_VERSION;
const pageId = process.env.META_PAGE_ID;
const accessToken = process.env.META_PAGE_ACCESS_TOKEN;

const products = JSON.parse(await readFile(new URL("../data/products.json", import.meta.url), "utf8"));
const campaigns = JSON.parse(await readFile(new URL("../data/campaigns.json", import.meta.url), "utf8"));

function stop(message) {
  console.log(`SAFE STOP: ${message}`);
  process.exit(0);
}

if (!Array.isArray(products) || !Array.isArray(campaigns)) {
  throw new Error("Products and campaigns must be JSON arrays.");
}
if (!enabled) stop("PUBLISH_ENABLED is not true; public publishing is disabled.");

const pending = campaigns.filter((c) => c?.network === "facebook" && c?.status === "approved");
if (pending.length === 0) stop("No explicitly approved Facebook campaigns exist.");

const seenCampaignIds = new Set();
for (const campaign of pending) {
  if (typeof campaign.id !== "string" || !campaign.id.trim()) {
    throw new Error("Every campaign requires a stable id.");
  }
  if (seenCampaignIds.has(campaign.id)) throw new Error(`Duplicate campaign id: ${campaign.id}`);
  seenCampaignIds.add(campaign.id);
  if (campaign.link_verified !== true) {
    throw new Error(`Campaign ${campaign.id} has not been marked link_verified by a human.`);
  }
  const product = products.find((p) => p.id === campaign.product_id);
  if (!product) throw new Error(`Campaign ${campaign.id} references an unknown product.`);
  if (product.status !== "approved") {
    throw new Error(`Product ${product.id} is not approved; current status: ${product.status}`);
  }
  if (!campaign.caption || typeof campaign.caption !== "string" || campaign.caption.length > 60000) {
    throw new Error(`Campaign ${campaign.id} needs a valid caption.`);
  }
  if (!campaign.caption.includes(product.url)) {
    throw new Error(`Campaign ${campaign.id} caption must contain the exact catalogue URL.`);
  }
  const parsedUrl = new URL(product.url);
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "selar.com" || product.url !== parsedUrl.href) {
    throw new Error(`Product ${product.id} has an invalid checkout URL.`);
  }
  const allWithUrl = products.filter((p) => p.url === product.url);
  if (allWithUrl.length > 1 && campaign.shared_url_confirmed !== true) {
    throw new Error(`Product ${product.id} shares its checkout URL with another product; human confirmation is required.`);
  }
}
if (pending.length !== 1) {
  throw new Error("This initial adapter permits one campaign per run to reduce duplicate-post risk.");
}

const campaign = pending[0];
const product = products.find((p) => p.id === campaign.product_id);
const message = `${campaign.caption.trim()}\n\n${product.url}`;

if (dryRun) {
  console.log(`DRY RUN: campaign ${campaign.id} passed local approval and link checks.`);
  console.log("No platform API request was sent.");
  process.exit(0);
}

if (!graphVersion || !/^v\d+\.\d+$/.test(graphVersion)) {
  throw new Error("META_GRAPH_API_VERSION must be set to a currently supported Meta Graph API version.");
}
if (!pageId || !accessToken) stop("Facebook Page ID or Page access token is missing.");
if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY || !process.env.GITHUB_REF_NAME) {
  throw new Error("GitHub state persistence is required to prevent duplicate publication.");
}

const apiBase = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/contents/data/campaigns.json`;
const ghHeaders = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  "X-GitHub-Api-Version": "2022-11-28"
};

async function getState() {
  const response = await fetch(`${apiBase}?ref=${encodeURIComponent(process.env.GITHUB_REF_NAME)}`, { headers: ghHeaders });
  if (!response.ok) throw new Error(`Could not read campaign state from GitHub (HTTP ${response.status}).`);
  const data = await response.json();
  const decoded = Buffer.from(data.content.replace(/\s/g, ""), "base64").toString("utf8");
  return { sha: data.sha, campaigns: JSON.parse(decoded) };
}

async function saveState(sha, nextCampaigns, messageText) {
  const content = Buffer.from(JSON.stringify(nextCampaigns, null, 2) + "\n").toString("base64");
  const response = await fetch(apiBase, {
    method: "PUT",
    headers: { ...ghHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: messageText,
      content,
      sha,
      branch: process.env.GITHUB_REF_NAME
    })
  });
  if (!response.ok) throw new Error(`Could not persist campaign state to GitHub (HTTP ${response.status}). No further post attempt should be made until state is inspected.`);
  return response.json();
}

// Reserve the campaign in durable GitHub state BEFORE calling Meta. If the run
// fails after reservation, it will not auto-retry this campaign and risk a duplicate.
const initial = await getState();
const liveCampaign = initial.campaigns.find((c) => c.id === campaign.id);
if (!liveCampaign || liveCampaign.status !== "approved") {
  stop("The live GitHub campaign state is not approved; no post was sent.");
}
const reservation = initial.campaigns.map((c) =>
  c.id === campaign.id ? { ...c, status: "publishing", publishing_started_at: new Date().toISOString() } : c
);
await saveState(initial.sha, reservation, `Reserve campaign ${campaign.id} before Facebook publication`);

const endpoint = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(pageId)}/feed`;
const body = new URLSearchParams({ message, access_token: accessToken });
const response = await fetch(endpoint, { method: "POST", body });
const responseText = await response.text();
let payload;
try { payload = JSON.parse(responseText); } catch { payload = {}; }

if (!response.ok || payload.error || !payload.id) {
  const errorCode = payload?.error?.code ?? "unknown";
  const errorType = payload?.error?.type ?? "unknown";
  throw new Error(`Facebook publish failed or returned an ambiguous result (HTTP ${response.status}, code ${errorCode}, type ${errorType}). State remains 'publishing' to prevent accidental duplicate retries; inspect the Page before manual recovery.`);
}

const after = await getState();
const completed = after.campaigns.map((c) =>
  c.id === campaign.id && c.status === "publishing"
    ? { ...c, status: "published", published_at: new Date().toISOString(), platform_post_id: payload.id }
    : c
);
await saveState(after.sha, completed, `Record Facebook publication for campaign ${campaign.id}`);
console.log(`Published campaign ${campaign.id}. Platform post id: ${payload.id}`);
