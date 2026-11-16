const GRAPH_HOST = "https://graph.facebook.com";

function required(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

export async function checkInstagramLiveReadiness({ apiVersion, instagramUserId, accessToken, fetchImpl = fetch }) {
  required(accessToken, "INSTAGRAM_ACCESS_TOKEN");
  required(instagramUserId, "INSTAGRAM_USER_ID");
  if (!/^v\d+\.\d+$/.test(apiVersion ?? "")) throw new Error("META_GRAPH_API_VERSION must be a version such as v27.0.");
  if (!/^\d+$/.test(instagramUserId)) throw new Error("INSTAGRAM_USER_ID must be numeric.");

  async function get(path) {
    let response;
    try {
      response = await fetchImpl(`${GRAPH_HOST}/${apiVersion}/${path}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
      });
    } catch (error) {
      throw new Error(`Read-only Meta request failed at transport level (${error?.name ?? "Error"}); token was not logged.`);
    }
    let payload;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok || !payload || payload.error) {
      const code = Number.isFinite(Number(payload?.error?.code)) ? Number(payload.error.code) : "unknown";
      throw new Error(`Read-only Meta request failed (HTTP ${response.status}, code ${code}); token was not logged.`);
    }
    return payload;
  }

  const permissionResponse = await get("me/permissions");
  if (!Array.isArray(permissionResponse.data)) throw new Error("Meta permissions response did not contain a data array.");
  const granted = new Set(permissionResponse.data.filter((item) => item.status === "granted").map((item) => item.permission));
  const requiredPermissions = ["instagram_basic", "instagram_content_publish"];
  const missing = requiredPermissions.filter((permission) => !granted.has(permission));
  if (missing.length) throw new Error(`SUAT is missing required Unified Login permissions: ${missing.join(", ")}.`);

  const account = await get(`${encodeURIComponent(instagramUserId)}?fields=id`);
  if (account.id !== instagramUserId) throw new Error("Meta returned a different Instagram account ID.");

  const quota = await get(`${encodeURIComponent(instagramUserId)}/content_publishing_limit?fields=quota_usage,config`);
  if (!Array.isArray(quota.data) || !quota.data.length) throw new Error("Meta publishing-limit response did not contain data.");
  const quotaUsage = Number(quota.data[0].quota_usage);
  const quotaTotal = Number(quota.data[0].config?.quota_total);
  const quotaDuration = Number(quota.data[0].config?.quota_duration);
  if (!Number.isFinite(quotaUsage) || !Number.isFinite(quotaTotal) || quotaTotal < 1 ||
      !Number.isFinite(quotaDuration) || quotaDuration < 1) {
    throw new Error("Meta publishing-limit response did not include valid quota values.");
  }

  const media = await get(`${encodeURIComponent(instagramUserId)}/media?fields=id,media_type,timestamp&limit=1`);
  if (!Array.isArray(media.data)) throw new Error("Instagram media read response did not contain a data array.");

  return {
    status: "READ_ONLY_PASS",
    accountId: account.id,
    requiredPermissions,
    quotaUsage,
    quotaTotal,
    quotaDuration,
    recentMediaCount: media.data.length
  };
}

if (process.argv[1] && process.argv[1].endsWith("check-instagram-live-readiness.mjs")) {
  try {
    const result = await checkInstagramLiveReadiness({
      apiVersion: process.env.META_GRAPH_API_VERSION,
      instagramUserId: process.env.INSTAGRAM_USER_ID || "17841413164146618",
      accessToken: process.env.INSTAGRAM_ACCESS_TOKEN
    });
    console.log(JSON.stringify(result, null, 2));
    console.log("READ-ONLY CHECK COMPLETE: no media container was created and no post was published.");
  } catch (error) {
    console.error("INSTAGRAM READ-ONLY CHECK FAILED:", error.message);
    process.exit(1);
  }
}
