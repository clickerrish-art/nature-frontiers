import { pathToFileURL } from "node:url";
import { platformIdentityError } from "./platform-identity.mjs";

const GRAPH_HOST = "https://graph.facebook.com";

function required(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(label + " is required.");
  return value.trim();
}

export async function checkFacebookLiveReadiness({ apiVersion, pageId, expectedPageId, accessToken, fetchImpl = fetch }) {
  required(accessToken, "META_PAGE_ACCESS_TOKEN");
  if (!/^v\d+\.\d+$/.test(apiVersion ?? "")) throw new Error("META_GRAPH_API_VERSION must be a version such as v27.0.");
  const identityError = platformIdentityError(pageId, expectedPageId, "Nature Frontiers Facebook Page");
  if (identityError) throw new Error(identityError);

  const endpoint = GRAPH_HOST + "/" + apiVersion + "/" + encodeURIComponent(pageId) + "?fields=id,name";
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "GET",
      headers: { Authorization: "Bearer " + accessToken, Accept: "application/json" }
    });
  } catch (error) {
    throw new Error("Read-only Facebook Page identity request failed at transport level (" + (error?.name ?? "Error") + "); token was not logged.");
  }
  let payload;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok || !payload || payload.error) {
    const code = Number.isFinite(Number(payload?.error?.code)) ? Number(payload.error.code) : "unknown";
    throw new Error("Read-only Facebook Page identity request failed (HTTP " + response.status + ", code " + code + "); token was not logged.");
  }
  if (payload.id !== expectedPageId) {
    throw new Error("Meta returned a Facebook Page ID different from the owner-approved expected ID.");
  }
  return { status: "READ_ONLY_PASS", pageId: payload.id, pageName: typeof payload.name === "string" ? payload.name : null };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const result = await checkFacebookLiveReadiness({
      apiVersion: process.env.META_GRAPH_API_VERSION,
      pageId: process.env.META_PAGE_ID,
      expectedPageId: process.env.META_EXPECTED_PAGE_ID,
      accessToken: process.env.META_PAGE_ACCESS_TOKEN
    });
    console.log(JSON.stringify(result, null, 2));
    console.log("READ-ONLY CHECK COMPLETE: no Facebook post was created or published.");
  } catch (error) {
    console.error("FACEBOOK READ-ONLY CHECK FAILED:", error.message);
    process.exit(1);
  }
}
