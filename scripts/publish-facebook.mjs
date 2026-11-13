import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { shouldOpenMetaCircuit, shouldOpenMetaCircuitFromUsage, redactMetaError } from "./meta-error-policy.mjs";
import { validatePrepublishCampaign } from "./prepublish-gate.mjs";

const enabled = process.env.PUBLISH_ENABLED === "true";
const dryRun = process.env.PUBLISH_DRY_RUN !== "false";
const emergencyStop = process.env.PUBLISH_EMERGENCY_STOP !== "false";
const facebookPublishEnabled = process.env.FACEBOOK_PUBLISH_ENABLED === "YES";
const graphVersion = process.env.META_GRAPH_API_VERSION;
const pageId = process.env.META_PAGE_ID;
const accessToken = process.env.META_PAGE_ACCESS_TOKEN;

const products = JSON.parse(await readFile(new URL("../data/products.json", import.meta.url), "utf8"));
const campaigns = JSON.parse(await readFile(new URL("../data/campaigns.json", import.meta.url), "utf8"));
const circuitState = JSON.parse(await readFile(new URL("../data/meta-circuit-breaker.json", import.meta.url), "utf8"));
const prepublishPolicy = JSON.parse(await readFile(new URL("../data/prepublish-policy.json", import.meta.url), "utf8"));

function stop(message) {
  console.log(`SAFE STOP: ${message}`);
  process.exit(0);
}

if (!Array.isArray(products) || !Array.isArray(campaigns)) {
  throw new Error("Products and campaigns must be JSON arrays.");
}
if (circuitState.open === true) stop(`Meta API circuit breaker is OPEN${circuitState.reason ? `: ${circuitState.reason}` : "."} Human review and explicit reset are required.`);
if (emergencyStop) stop("PUBLISH_EMERGENCY_STOP is active; publishing is blocked.");
if (!facebookPublishEnabled) stop("FACEBOOK_PUBLISH_ENABLED is not YES; Facebook publishing is disabled.");
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
  if (!campaign.caption.includes("Disclosure: This is a promotional post for a paid digital product.")) {
    throw new Error(`Campaign ${campaign.id} is missing the required paid-product promotional disclosure.`);
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
const contentGate = validatePrepublishCampaign(campaign, campaigns, prepublishPolicy);
if (!contentGate.ok) {
  console.error("SAFE STOP: pre-publish evidence gate failed.");
  for (const item of contentGate.issues) console.error(`[${item.code}] ${item.message}`);
  process.exit(1);
}
const trimmedCaption = campaign.caption.trim();
const message = trimmedCaption.includes(product.url)
  ? trimmedCaption
  : `${trimmedCaption}\n\n${product.url}`;

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

async function persistCircuitState(nextState) {
  const path = "data/meta-circuit-breaker.json";
  const url = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/contents/${path}`;
  const current = await fetch(`${url}?ref=${encodeURIComponent(process.env.GITHUB_REF_NAME)}`, { headers: ghHeaders });
  if (!current.ok) throw new Error(`Circuit-breaker state could not be read (HTTP ${current.status}); publication remains halted for manual inspection.`);
  const currentFile = await current.json();
  const content = Buffer.from(JSON.stringify(nextState, null, 2) + "\n").toString("base64");
  const saved = await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Open Meta API circuit breaker after safety signal",
      content,
      sha: currentFile.sha,
      branch: process.env.GITHUB_REF_NAME
    })
  });
  if (!saved.ok) throw new Error(`Circuit-breaker state could not be persisted (HTTP ${saved.status}); do not retry or publish until state is inspected.`);
  return saved.json();
}

async function persistAuditEvent(event) {
  const path = "data/meta-api-audit.json";
  const url = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/contents/${path}`;
  const current = await fetch(`${url}?ref=${encodeURIComponent(process.env.GITHUB_REF_NAME)}`, { headers: ghHeaders });
  if (!current.ok) throw new Error(`Meta API audit trail could not be read (HTTP ${current.status}); no further API call is allowed.`);
  const currentFile = await current.json();
  const existing = JSON.parse(Buffer.from(currentFile.content.replace(/\s/g, ""), "base64").toString("utf8"));
  if (!Array.isArray(existing)) throw new Error("Meta API audit trail is malformed; no further API call is allowed.");
  const next = [...existing, event].slice(-500);
  const content = Buffer.from(JSON.stringify(next, null, 2) + "\n").toString("base64");
  const saved = await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Record redacted Meta API audit event",
      content,
      sha: currentFile.sha,
      branch: process.env.GITHUB_REF_NAME
    })
  });
  if (!saved.ok) throw new Error(`Meta API audit event could not be persisted (HTTP ${saved.status}); do not retry or publish until state is inspected.`);
  return saved.json();
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
const correlationId = randomUUID();
const requestStartedAt = new Date().toISOString();
const messageHash = createHash("sha256").update(message).digest("hex");
await persistAuditEvent({
  timestamp: requestStartedAt,
  correlation_id: correlationId,
  event: "request",
  method: "POST",
  endpoint: `/${graphVersion}/${encodeURIComponent(pageId)}/feed`,
  api_version: graphVersion,
  page_id: pageId,
  payload_redacted: { message_sha256: messageHash, message_length: message.length, has_link: /https?:\/\//i.test(message), access_token: "[REDACTED]" }
});
let response;
try {
  response = await fetch(endpoint, { method: "POST", body });
} catch (error) {
  await persistAuditEvent({
    timestamp: new Date().toISOString(),
    correlation_id: correlationId,
    event: "transport_error",
    error_type: error?.name ?? "Error",
    error_message: String(error?.message ?? "Network error").slice(0, 300),
    retry: "NEVER — ambiguous publish result; inspect the Page"
  });
  throw new Error("Meta request transport failed or returned an ambiguous result. Campaign remains 'publishing'; inspect the Page before any manual recovery. No retry was attempted.");
}
const responseText = await response.text();
let payload;
try { payload = JSON.parse(responseText); } catch { payload = {}; }
const responseError = redactMetaError(payload?.error ?? {});
const usageHeaders = {
  app: response.headers.get("x-app-usage"),
  page: response.headers.get("x-page-usage"),
  business_use_case: response.headers.get("x-business-use-case-usage"),
  retry_after: response.headers.get("retry-after")
};
const usageCircuitSignal = shouldOpenMetaCircuitFromUsage({
  app: usageHeaders.app,
  page: usageHeaders.page,
  businessUseCase: usageHeaders.business_use_case,
  retryAfter: usageHeaders.retry_after
});
const errorCircuitSignal = shouldOpenMetaCircuit({ status: response.status, code: responseError.code, message: responseError.message });
await persistAuditEvent({
  timestamp: new Date().toISOString(),
  correlation_id: correlationId,
  event: "response",
  http_status: response.status,
  meta_error: payload?.error ? responseError : null,
  platform_object_id: typeof payload?.id === "string" ? payload.id : null,
  usage_headers: usageHeaders,
  circuit_signal: usageCircuitSignal || errorCircuitSignal ? (usageCircuitSignal ? "usage_threshold" : "meta_error") : null
});

if (usageCircuitSignal || errorCircuitSignal) {
  const safeError = responseError;
  const opened = {
    open: true,
    opened_at: new Date().toISOString(),
    reason: usageCircuitSignal
      ? "Meta API usage reached the proactive 90% threshold or Retry-After was supplied."
      : `Meta API safety signal (HTTP ${response.status}, code ${safeError.code ?? "unknown"}).`,
    http_status: response.status,
    meta_error_code: safeError.code,
    meta_error_subcode: safeError.error_subcode,
    fbtrace_id: safeError.fbtrace_id,
    api_version: graphVersion,
    page_id: pageId,
    manual_review_required: true,
    closed_at: null,
    closed_by: null
  };
  await persistCircuitState(opened);
  console.error("META CIRCUIT BREAKER OPENED. Future publishing runs stop until human review and explicit reset.");
}

if (!response.ok || payload.error || !payload.id) {
  const safeError = responseError;
  throw new Error(`Facebook publish failed or returned an ambiguous result (HTTP ${response.status}, code ${safeError.code ?? "unknown"}, type ${safeError.type ?? "unknown"}). State remains 'publishing' to prevent accidental duplicate retries; inspect the Page before manual recovery. No automatic retry was attempted.`);
}

const after = await getState();
const completed = after.campaigns.map((c) =>
  c.id === campaign.id && c.status === "publishing"
    ? { ...c, status: "published", published_at: new Date().toISOString(), platform_post_id: payload.id }
    : c
);
await saveState(after.sha, completed, `Record Facebook publication for campaign ${campaign.id}`);
console.log(`Published campaign ${campaign.id}. Platform post id: ${payload.id}`);
