const requiredEnv = ["META_GRAPH_API_VERSION", "META_APP_ID", "META_APP_SECRET", "META_PAGE_ACCESS_TOKEN", "INSTAGRAM_ACCESS_TOKEN"];
const missing = requiredEnv.filter((key) => !process.env[key]);
const version = process.env.META_GRAPH_API_VERSION ?? "";
const repo = process.env.GITHUB_REPOSITORY ?? "";
const githubToken = process.env.GITHUB_TOKEN ?? "";
const alertTitle = "Meta token health requires owner action";

export function classifyMetaDebugTokenFailure(status, payload = {}) {
  if (status === 429 || status >= 500) {
    return {
      code: "META_PROVIDER_UNAVAILABLE",
      message: "Meta debug_token is temporarily unavailable (HTTP " + status + "). Token validity was not determined."
    };
  }
  const code = payload?.error?.code ?? "unknown";
  const subcode = payload?.error?.error_subcode ?? "unknown";
  return {
    code: "META_TOKEN_DEBUG_REJECTED",
    message: "Meta debug_token rejected the request (HTTP " + status + ", error code " + code + ", subcode " + subcode + ")."
  };
}

export function assessTokenDebugInfo(debug, expectedAppId, nowSeconds = Math.floor(Date.now() / 1000), requiredScopes = ["pages_manage_posts", "pages_read_engagement"], label = "Page access token") {
  const issues = [];
  if (!debug || debug.is_valid !== true) issues.push("The " + label + " is invalid or revoked.");
  if (expectedAppId && String(debug?.app_id ?? "") !== String(expectedAppId)) issues.push("The token belongs to an unexpected Meta app.");
  const scopes = new Set(Array.isArray(debug?.scopes) ? debug.scopes : []);
  for (const scope of requiredScopes) if (!scopes.has(scope)) issues.push(label + " is missing required permission: " + scope);
  for (const [field, label] of [["expires_at", "token"], ["data_access_expires_at", "data access"]]) {
    if (!debug || !Object.hasOwn(debug, field)) { issues.push("The " + label + " expiry field is missing."); continue; }
    const rawExpiry = debug[field];
    // Meta uses numeric 0 for a non-expiring token. Do not coerce null or
    // an empty string to 0: Number(null) and Number("") would falsely pass
    // these as permanent credentials.
    if (rawExpiry === null || rawExpiry === "") {
      issues.push("The " + label + " expiry value is invalid.");
      continue;
    }
    const expiry = Number(rawExpiry);
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

async function inspectToken({ token, label, requiredScopes }) {
  const endpoint = new URL("https://graph.facebook.com/" + version + "/debug_token");
  endpoint.searchParams.set("input_token", token);
  endpoint.searchParams.set("access_token", process.env.META_APP_ID + "|" + process.env.META_APP_SECRET);
  let response;
  try { response = await fetch(endpoint, { signal: AbortSignal.timeout(15000) }); }
  catch {
    const error = new Error(label + " debug_token request failed at the network layer. Token validity was not determined; credential values were not logged.");
    error.code = "META_PROVIDER_UNAVAILABLE";
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const failure = classifyMetaDebugTokenFailure(response.status, payload);
    const error = new Error(label + " health check could not complete: " + failure.message);
    error.code = failure.code;
    throw error;
  }
  return assessTokenDebugInfo(payload.data, process.env.META_APP_ID, Math.floor(Date.now() / 1000), requiredScopes, label);
}

async function main() {
  if (missing.length) { const message = "Missing required secret/configuration names: " + missing.join(", ") + ". No credential values were read or logged."; await createOrFindAlert(message); throw new Error(message); }
  if (!/^v\d+\.\d+$/.test(version)) throw new Error("META_GRAPH_API_VERSION must be pinned explicitly as vN.N.");
  const checks = [
    { token: process.env.META_PAGE_ACCESS_TOKEN, label: "Facebook Page access token", requiredScopes: ["pages_manage_posts", "pages_read_engagement"] },
    { token: process.env.INSTAGRAM_ACCESS_TOKEN, label: "Instagram publishing token", requiredScopes: ["instagram_basic", "instagram_content_publish"] }
  ];
  const results = [];
  for (const check of checks) {
    let assessment;
    try { assessment = await inspectToken(check); }
    catch (error) {
      if (error?.code === "META_PROVIDER_UNAVAILABLE") {
        console.error("META TOKEN HEALTH: NOT_TESTED — " + error.message + " No re-authentication alert was created because this is not evidence that the token is invalid.");
        process.exitCode = 1;
        return;
      }
      const message = check.label + " health check could not complete: " + error.message;
      await createOrFindAlert(message);
      throw new Error("Meta token health failed closed: " + message);
    }
    results.push({ label: check.label, assessment });
    if (!assessment.ok) {
      const message = check.label + " health failed: " + assessment.issues.join(" ");
      await createOrFindAlert(message);
      throw new Error("Meta token health failed closed: " + message);
    }
  }
  console.log(JSON.stringify({ status: "PASS", tokens: results.map(({ label, assessment }) => ({ label, app_id: assessment.app_id, expires_at: assessment.expires_at, data_access_expires_at: assessment.data_access_expires_at, scopes: assessment.scopes })), checked_at: new Date().toISOString() }));
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) main().catch((error) => { console.error("META TOKEN HEALTH: HOLD — " + error.message); process.exitCode = 1; });
