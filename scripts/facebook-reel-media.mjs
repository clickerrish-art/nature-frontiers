import { createHash } from "node:crypto";

export async function verifyRemoteMedia(mediaUrl, expectedSha256, fetchImpl = fetch) {
  let parsed;
  try { parsed = new URL(mediaUrl); } catch { throw new Error("Reel media URL is invalid."); }
  if (parsed.protocol !== "https:" || !parsed.hostname || parsed.hostname === "localhost") {
    throw new Error("Reel media URL must use public HTTPS.");
  }
  if (!/^[a-f0-9]{64}$/i.test(expectedSha256 ?? "")) {
    throw new Error("A verified SHA-256 digest is required before media transfer.");
  }

  const response = await fetchImpl(parsed, { method: "GET", redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error("Reel media could not be fetched successfully (HTTP " + response.status + ").");
  }
  if (response.url) {
    let finalUrl;
    try { finalUrl = new URL(response.url); } catch { throw new Error("Reel media resolved to an invalid URL."); }
    if (finalUrl.protocol !== "https:") throw new Error("Reel media redirect downgraded from HTTPS; refusing transfer.");
  }
  const contentType = response.headers?.get?.("content-type") ?? "";
  if (!/^video\//i.test(contentType)) {
    throw new Error("Reel media URL did not return a video content type.");
  }

  const digest = createHash("sha256");
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    digest.update(chunk);
  }
  if (bytes === 0) throw new Error("Reel media response was empty.");
  const actual = digest.digest("hex");
  if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error("Reel media SHA-256 does not match the approved campaign manifest.");
  }
  return { bytes, sha256: actual, contentType };
}
