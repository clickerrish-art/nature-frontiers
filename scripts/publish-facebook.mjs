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
if (!enabled) stop("PUBLISH_ENABLED is not true.");
if (dryRun) stop("PUBLISH_DRY_RUN is not false; dry-run mode is active.");
if (!graphVersion || !/^v\d+\.\d+$/.test(graphVersion)) {
  throw new Error("META_GRAPH_API_VERSION must be a supported version such as vXX.0.");
}
if (!pageId || !accessToken) stop("Facebook Page ID or Page access token is missing.");

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
  if (product.url !== new URL(product.url).href || new URL(product.url).hostname !== "selar.com") {
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
  console.log(`DRY RUN: would publish campaign ${campaign.id} to the configured Facebook Page.`);
  console.log("Caption and product checks passed; no API request was sent.");
  process.exit(0);
}

// The first live version intentionally requires dry-run to be explicitly disabled.
// Do not enable until the app/token and the Page identity have been verified.
const endpoint = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(pageId)}/feed`;
const body = new URLSearchParams({ message, access_token: accessToken });
const response = await fetch(endpoint, { method: "POST", body });
const responseText = await response.text();
let payload;
try { payload = JSON.parse(responseText); } catch { payload = { raw: responseText.slice(0, 500) }; }

if (!response.ok || payload.error || !payload.id) {
  const errorCode = payload?.error?.code ?? "unknown";
  const errorType = payload?.error?.type ?? "unknown";
  throw new Error(`Facebook publish failed (HTTP ${response.status}, code ${errorCode}, type ${errorType}). Response body omitted to avoid leaking sensitive data.`);
}
console.log(`Published campaign ${campaign.id}. Platform post id: ${payload.id}`);
