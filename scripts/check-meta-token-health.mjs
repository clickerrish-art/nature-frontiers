const requiredEnv = ["META_GRAPH_API_VERSION", "META_APP_ID", "META_APP_SECRET", "META_PAGE_ACCESS_TOKEN"];
const missing = requiredEnv.filter((key) => !process.env[key]);
const version = process.env.META_GRAPH_API_VERSION ?? "";
const repo = process.env.GITHUB_REPOSITORY ?? "";
const githubToken = process.env.GITHUB_TOKEN ?? "";
const alertTitle = "Meta token health requires owner action";

export function assessTokenDebugInfo(debug, expectedAppId, nowSeconds = Math.floor(Date.now() / 1000)) {
  const issues = [];
  if (!debug || debug.is_valid !== true) issues.push("The Page access token is invalid or revoked.");
  if (expectedAppId && String(debug?.app_id ?? "") !== String(expectedAppId)) issues.push("The token belongs to an unexpected Meta app.");
  const scopes = new Set(Array.isArray(debug?.scopes) ? debug.scopes : []);
  for (const scope of ["pages_manage_posts", "pages_read_engagement"]) if (!scopes.has(scope)) issues.push("Required permission is missing: " + scope);
  for (const [field, label] of [["expires_at", "token"], ["data_access_expires_at", "data access"]]) {
    const expiry = Number(debug?.[field] ?? 0);
    if (!Number.isFinite(expiry) || expiry < 0) issues.push("The " + label + " expiry value is invalid.");
    else if (expiry > 0 && expiry - nowSeconds < 14 * 86400) issues.push("The " + label + " expires in fewer than 14 days.");
  }
  return { ok: issues.length === 0, issues, app_id: debug?.app_id ?? null, expires_at: Number(debug?.expires_at ?? 0), data_access_expires_at: Number(debug?.data_access_expires_at ?? 0), scopes: [...scopes] };
}

async function createOrFindAlert(message) {
  if (!githubToken || !repo.includes("/")) throw new Error("GitHub issue alerting is not configured.");
  const headers = { authorization: "Bearer " + githubToken, accept: "application/vnd.github+json", "content-type": "application/json", "x-github-api-version": "2022-11-28" };
  const searchUrl = new URL("https://api.github.com/search/issues");
  searchUrl.searchParams.set("q", "repo:" + repo + ' is:issue is:open in:title "' + alertTitle + '"');
  const found = await fetch(searchUrl, { headers });
  if (!found.ok) throw new Error("Unable to check for an existing token-health alert (HTTP " + found.status + ").");
  const results = await found.json();
  if ((results.items ?? []).length) return;
  const created = await fetch("https://api.github.com/repos/" + repo + "/issues", { method: "POST", headers, body: JSON.stringify({ title: alertTitle, body: "The scheduled Meta token-health monitor detected a condition requiring owner action.\n\n" + message + "\n\nNo token values, app secrets or access-token strings are included. Re-authenticate through the official Meta login flow if invalid or revoked. Never paste credentials into an issue or chat." }) });
  if (!created.ok) throw new Error("Unable to create the token-health alert (HTTP " + created.status + ").");
}

async function main() {
  if (missing.length) throw new Error("Missing required secret/configuration names: " + missing.join(", ") + ". No credential values were read or logged.");
  if (!/^v\d+\.\d+$/.test(version)) throw new Error("META_GRAPH_API_VERSION must be pinned explicitly as vN.N.");
  const appToken = process.env.META_APP_ID + "|" + process.env.META_APP_SECRET;
  const endpoint = new URL("https://graph.facebook.com/" + version + "/debug_token");
  endpoint.searchParams.set("input_token", process.env.META_PAGE_ACCESS_TOKEN);
  endpoint.searchParams.set("access_token", appToken);
  let response;
  try { response = await fetch(endpoint, { signal: AbortSignal.timeout(15000) }); }
  catch { throw new Error("Meta debug_token request failed at the network layer. Credential values were not logged."); }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const code = payload?.error?.code ?? "unknown", subcode = payload?.error?.error_subcode ?? "unknown";
    const message = "Meta debug_token returned HTTP " + response.status + ", error code " + code + ", subcode " + subcode + ". Owner re-authorisation or app configuration review may be required.";
    await createOrFindAlert(message);
    throw new Error(message);
  }
  const assessment = assessTokenDebugInfo(payload.data, process.env.META_APP_ID);
  if (!assessment.ok) {
    await createOrFindAlert(assessment.issues.map((item) => "- " + item).join("\n"));
    throw new Error("Meta token health failed closed: " + assessment.issues.join(" "));
  }
  console.log(JSON.stringify({ status: "PASS", app_id: assessment.app_id, expires_at: assessment.expires_at, data_access_expires_at: assessment.data_access_expires_at, scopes: assessment.scopes, checked_at: new Date().toISOString() }));
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) main().catch((error) => { console.error("META TOKEN HEALTH: HOLD — " + error.message); process.exitCode = 1; });
