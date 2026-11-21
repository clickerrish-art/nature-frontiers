import { readFile } from "node:fs/promises";
import { createInstagramApiClient } from "./instagram-runtime-api.mjs";
import { createPublicMediaHost } from "./instagram-media-host.mjs";
import { createGitHubInstagramStateStore } from "./instagram-state-store.mjs";
import { runInstagramCampaign } from "./instagram-publisher.mjs";
import { platformIdentityError } from "./platform-identity.mjs";
import { checkInstagramLiveReadiness } from "./check-instagram-live-readiness.mjs";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const campaigns = await readJson("../data/instagram-campaigns.json");
const products = await readJson("../data/products.json");
const policy = await readJson("../data/prepublish-policy.json");
const circuit = await readJson("../data/meta-circuit-breaker.json");

if (!Array.isArray(campaigns) || !Array.isArray(products)) throw new Error("Instagram campaigns and product catalogue must be JSON arrays.");
if (circuit.open === true) throw new Error("Meta circuit breaker is OPEN; human review and explicit reset are required.");
if (process.env.GITHUB_REF_NAME !== "main") {
  console.log("SAFE STOP: live Instagram publishing is permitted only from production main. No platform API request was sent.");
  process.exit(0);
}
const approved = campaigns.filter((campaign) => campaign?.network === "instagram" && campaign?.status === "approved");
if (approved.length !== 1) {
  console.log(`SAFE STOP: expected exactly one approved Instagram campaign; found ${approved.length}. No Instagram API request was sent.`);
  process.exit(0);
}
const instagramIdentityError = platformIdentityError(
  process.env.INSTAGRAM_USER_ID,
  process.env.META_EXPECTED_INSTAGRAM_USER_ID,
  "Nature Frontiers Instagram account"
);
if (instagramIdentityError) throw new Error(instagramIdentityError + " Instagram publishing is blocked.");
const instagramReadiness = await checkInstagramLiveReadiness({
  apiVersion: process.env.META_GRAPH_API_VERSION,
  instagramUserId: process.env.INSTAGRAM_USER_ID,
  expectedInstagramUserId: process.env.META_EXPECTED_INSTAGRAM_USER_ID,
  accessToken: process.env.INSTAGRAM_ACCESS_TOKEN
});
console.log("READ-ONLY INSTAGRAM ACCOUNT CHECK PASSED: " + instagramReadiness.account.id + " (" + instagramReadiness.account.username + ").");

const stateBranch = "instagram-publishing-state";
const stateStore = createGitHubInstagramStateStore({
  token: process.env.GITHUB_TOKEN,
  repository: process.env.GITHUB_REPOSITORY,
  branch: stateBranch
});
const mediaHost = createPublicMediaHost({ baseUrl: process.env.INSTAGRAM_MEDIA_BASE_URL });
const api = createInstagramApiClient({
  apiVersion: process.env.META_GRAPH_API_VERSION,
  instagramUserId: process.env.INSTAGRAM_USER_ID,
  accessToken: process.env.INSTAGRAM_ACCESS_TOKEN
});
const result = await runInstagramCampaign({
  campaign: approved[0], history: campaigns, products, policy,
  env: process.env, stateStore, mediaHost, api
});
if (!result.ok) {
  console.error(`SAFE STOP [${result.code}]: ${result.message}`);
  for (const item of result.issues ?? []) console.error(`[${item.code}] ${item.message}`);
  process.exit(1);
}
console.log(`Instagram campaign result: ${result.status}; media ID: ${result.mediaId ?? "none"}; permalink: ${result.permalink ?? "none"}`);
