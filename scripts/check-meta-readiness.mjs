import { isVerifiedMetaPageIdentity, isVerifiedMetaInstagramIdentity } from "./meta-page-identity.mjs";

const pageId = process.env.META_PAGE_ID ?? "";
const expectedPageId = process.env.META_EXPECTED_PAGE_ID ?? "";
const instagramUserId = process.env.META_INSTAGRAM_USER_ID ?? "";
const expectedInstagramUserId = process.env.META_EXPECTED_INSTAGRAM_USER_ID ?? "";
const pageToken = process.env.META_PAGE_ACCESS_TOKEN ?? "";
const graphVersion = process.env.META_GRAPH_API_VERSION ?? "";
const publishEnabled = process.env.PUBLISH_ENABLED === "true";
const dryRun = process.env.PUBLISH_DRY_RUN !== "false";
const validVersion = /^v\d+\.\d+$/.test(graphVersion);
const pageIdentityConfigured = isVerifiedMetaPageIdentity(pageId, expectedPageId);
const instagramIdentityConfigured = isVerifiedMetaInstagramIdentity(instagramUserId, expectedInstagramUserId);
const identityConfigured = pageIdentityConfigured && instagramIdentityConfigured;
let tokenPageCheck = "NOT TESTED";

if (identityConfigured && pageToken && validVersion) {
  try {
    const url = new URL("https://graph.facebook.com/" + graphVersion + "/" + encodeURIComponent(pageId));
    url.searchParams.set("fields", "id,name,instagram_business_account");
    const response = await fetch(url, { headers: { Authorization: "Bearer " + pageToken }, signal: AbortSignal.timeout(15000) });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.id === expectedPageId && payload.name === "Nature Frontiers" &&
        payload?.instagram_business_account?.id === expectedInstagramUserId) {
      tokenPageCheck = "PASS: Page token read access and linked Instagram professional account identity verified.";
    } else {
      const code = payload?.error?.code ?? "unknown";
      const subcode = payload?.error?.error_subcode ?? "none";
      tokenPageCheck = code === 190 && subcode === 467
        ? "BLOCKED: Meta says this Page token is invalid or revoked; fresh authorization is required (HTTP " + response.status + ")."
        : "BLOCKED: Meta rejected the Page/Instagram linkage check (HTTP " + response.status + ", code " + code + ", subcode " + subcode + ").";
    }
  } catch (error) {
    tokenPageCheck = "BLOCKED: read-only Meta Page/Instagram check failed (" + (error?.name ?? "network error") + ").";
  }
}

const checks = [
  ["Configured Meta Page ID", /^\d+$/.test(pageId) ? "CONFIGURED: value withheld" : "BLOCKED: META_PAGE_ID must be numeric."],
  ["Expected Nature Frontiers Page ID", /^\d+$/.test(expectedPageId) ? "CONFIGURED: value withheld" : "BLOCKED: META_EXPECTED_PAGE_ID must be independently configured."],
  ["Page identity match", pageIdentityConfigured ? "PASS: configured and expected Page IDs match" : "BLOCKED: configured and expected Page IDs are missing or differ."],
  ["Instagram professional account ID", /^\d+$/.test(instagramUserId) ? "CONFIGURED: value withheld" : "BLOCKED: META_INSTAGRAM_USER_ID must be numeric."],
  ["Expected Instagram professional account ID", /^\d+$/.test(expectedInstagramUserId) ? "CONFIGURED: value withheld" : "BLOCKED: META_EXPECTED_INSTAGRAM_USER_ID must be independently configured."],
  ["Instagram account identity match", instagramIdentityConfigured ? "PASS: configured and expected Instagram IDs match" : "BLOCKED: configured and expected Instagram IDs are missing or differ."],
  ["Meta Page access token", pageToken.length > 0 ? "PRESENT: value withheld" : "BLOCKED: secret is not configured."],
  ["Meta Page token and Page/Instagram linkage", tokenPageCheck],
  ["Meta Graph API version", validVersion ? "CONFIGURED: version syntax valid; Meta support still needs verification" : "BLOCKED: version configuration missing or malformed."],
  ["Live publishing opt-in", publishEnabled ? "ENABLED: still requires separate one-shot workflow authorization" : "SAFE: repository opt-in is disabled."],
  ["Dry-run mode", dryRun ? "SAFE: dry-run is enabled" : "WARNING: dry-run is disabled."]
];
for (const [name, result] of checks) console.log(name + ": " + result);
const ready = identityConfigured && pageToken.length > 0 && validVersion && tokenPageCheck.startsWith("PASS:");
console.log(ready
  ? "READINESS: CONFIGURED — Page and linked Instagram read access verified; publishing permissions and media workflow are not proven."
  : "READINESS: BLOCKED — connection prerequisites are missing or unverified.");
if (!ready) process.exitCode = 1;
