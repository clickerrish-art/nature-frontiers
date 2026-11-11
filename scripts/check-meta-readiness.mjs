const expectedPageId = "1003575786161492";
const pageId = process.env.META_PAGE_ID ?? "";
const pageToken = process.env.META_PAGE_ACCESS_TOKEN ?? "";
const graphVersion = process.env.META_GRAPH_API_VERSION ?? "";
const publishEnabled = process.env.PUBLISH_ENABLED === "true";
const dryRun = process.env.PUBLISH_DRY_RUN !== "false";

const checks = [
  ["Meta Page ID", pageId.length > 0 ? (pageId === expectedPageId ? "PASS: matches the connected Nature Frontiers Page" : "BLOCKED: configured Page ID does not match the connected Nature Frontiers Page") : "BLOCKED: secret is not configured"],
  ["Meta Page access token", pageToken.length > 0 ? "PRESENT: value withheld; token validity and permissions are not yet verified" : "BLOCKED: secret is not configured"],
  ["Meta Graph API version", /^v\d+\.\d+$/.test(graphVersion) ? "CONFIGURED: version syntax is valid; Meta support is not yet verified" : "BLOCKED: repository variable is missing or malformed"],
  ["Live publishing opt-in", publishEnabled ? "ENABLED: requires a separate one-shot workflow authorization" : "SAFE: repository opt-in is disabled"],
  ["Dry-run mode", dryRun ? "SAFE: dry-run is enabled" : "WARNING: dry-run is disabled"]
];

for (const [name, result] of checks) console.log(name + ": " + result);
if (!pageId || pageId !== expectedPageId || !pageToken || !/^v\d+\.\d+$/.test(graphVersion)) {
  console.log("READINESS: BLOCKED — one or more Meta connection prerequisites are missing or unverified.");
} else {
  console.log("READINESS: CONFIGURED — this check does not prove token scopes or live publishing capability.");
}
