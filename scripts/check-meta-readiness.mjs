const expectedPageId = "1003575786161492";
const pageId = process.env.META_PAGE_ID ?? "";
const pageToken = process.env.META_PAGE_ACCESS_TOKEN ?? "";
const graphVersion = process.env.META_GRAPH_API_VERSION ?? "";
const publishEnabled = process.env.PUBLISH_ENABLED === "true";
const dryRun = process.env.PUBLISH_DRY_RUN !== "false";
const validVersion = /^v\d+\.\d+$/.test(graphVersion);
let tokenPageCheck = "NOT TESTED";

if (pageId === expectedPageId && pageToken && validVersion) {
  try {
    const url = new URL("https://graph.facebook.com/" + graphVersion + "/" + encodeURIComponent(pageId));
    url.searchParams.set("fields", "id,name");
    const response = await fetch(url, {
      headers: { Authorization: "Bearer " + pageToken },
      signal: AbortSignal.timeout(15000)
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.id === expectedPageId && payload.name === "Nature Frontiers") {
      tokenPageCheck = "PASS: Page token is valid for read access to the exact Nature Frontiers Page ID and name";
    } else {
      const code = payload?.error?.code ?? "unknown";
      const subcode = payload?.error?.error_subcode ?? "none";
      tokenPageCheck = code === 190 && (subcode === 463 || subcode === 467)
        ? "BLOCKED: Meta says this Page token is expired, invalid or revoked; a fresh authorization is required (HTTP " + response.status + ")."
        : "BLOCKED: Meta rejected the read-only Page check (HTTP " + response.status + ", code " + code + ", subcode " + subcode + ", type " + (payload?.error?.type ?? "unknown") + ").";
    }
  } catch (error) {
    tokenPageCheck = "BLOCKED: read-only Meta Page check failed (" + (error?.name ?? "network error") + ")";
  }
}

const checks = [
  ["Meta Page ID", pageId.length > 0 ? (pageId === expectedPageId ? "PASS: matches the connected Nature Frontiers Page" : "BLOCKED: configured Page ID does not match the connected Nature Frontiers Page") : "BLOCKED: secret is not configured"],
  ["Meta Page access token", pageToken.length > 0 ? "PRESENT: value withheld" : "BLOCKED: secret is not configured"],
  ["Meta Page token read access", tokenPageCheck],
  ["Meta Graph API version", validVersion ? "CONFIGURED: version syntax is valid; Meta support is not yet verified" : "BLOCKED: workflow configuration is missing or malformed"],
  ["Live publishing opt-in", publishEnabled ? "ENABLED: requires a separate one-shot workflow authorization" : "SAFE: repository opt-in is disabled"],
  ["Dry-run mode", dryRun ? "SAFE: dry-run is enabled" : "WARNING: dry-run is disabled"]
];

for (const [name, result] of checks) console.log(name + ": " + result);
const configured = pageId === expectedPageId && pageToken.length > 0 && validVersion;
const readyForFurtherPermissionChecks = configured && tokenPageCheck.startsWith("PASS:");
console.log(readyForFurtherPermissionChecks
  ? "READINESS: CONFIGURED — Page read access verified; publishing permission is not yet proven."
  : "READINESS: BLOCKED — one or more Meta connection prerequisites are missing or unverified.");
if (!readyForFurtherPermissionChecks) process.exitCode = 1;
