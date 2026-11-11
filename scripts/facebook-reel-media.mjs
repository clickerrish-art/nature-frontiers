import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { finished } from "node:stream/promises";

const MAX_MEDIA_BYTES = 4 * 1024 * 1024 * 1024;

function isPublicIPv4(address) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b, c] = octets;
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

function isPublicIPv6(address) {
  const value = address.toLowerCase().split("%")[0];
  if (value === "::" || value === "::1") return false;
  const first = Number.parseInt(value.split(":")[0] || "0", 16);
  const second = Number.parseInt(value.split(":")[1] || "0", 16);
  // Only global-unicast 2000::/3 is accepted. This excludes loopback,
  // link-local, ULA, multicast, IPv4-mapped and other special-purpose ranges.
  if (!Number.isFinite(first) || first < 0x2000 || first > 0x3fff) return false;
  if (first === 0x2002 || (first === 0x2001 && second <= 0x01ff)) return false;
  if (value.startsWith("2001:db8:")) return false;
  return true;
}

function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) return isPublicIPv4(address);
  if (family === 6) return isPublicIPv6(address);
  return false;
}

async function assertPublicHttpsUrl(value, lookupImpl) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Reel media URL is invalid."); }
  if (
    url.protocol !== "https:" || !url.hostname ||
    url.username || url.password || url.hash ||
    url.port !== "" ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    url.hostname.endsWith(".local") ||
    url.hostname.endsWith(".internal")
  ) {
    throw new Error("Reel media URL must be a public HTTPS URL without credentials, fragments, or non-standard ports.");
  }
  const hostname = url.hostname.startsWith("[") && url.hostname.endsWith("]")
    ? url.hostname.slice(1, -1)
    : url.hostname;
  if (hostname.startsWith("2001:db8:")) {
    throw new Error("Reel media host resolves to a non-public or unverified network address.");
  }
  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookupImpl(hostname, { all: true, verbatim: true });
  if (!Array.isArray(addresses) || addresses.length === 0 || addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new Error("Reel media host resolves to a non-public or unverified network address.");
  }
  return url;
}

export async function verifyRemoteMedia(
  mediaUrl,
  expectedSha256,
  fetchImpl = fetch,
  lookupImpl = lookup,
  maxBytes = MAX_MEDIA_BYTES
) {
  if (!/^[a-f0-9]{64}$/i.test(expectedSha256 ?? "")) {
    throw new Error("A verified SHA-256 digest is required before media transfer.");
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error("A positive maximum media size is required.");
  }

  const parsed = await assertPublicHttpsUrl(mediaUrl, lookupImpl);
  const response = await fetchImpl(parsed, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(120000)
  });
  if (!response.ok || !response.body) {
    throw new Error("Reel media could not be fetched successfully (HTTP " + response.status + ").");
  }
  const finalUrl = response.url || parsed.href;
  await assertPublicHttpsUrl(finalUrl, lookupImpl);
  const contentType = response.headers?.get?.("content-type") ?? "";
  if (!/^video\//i.test(contentType)) {
    throw new Error("Reel media URL did not return a video content type.");
  }
  const declaredLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("Reel media exceeds the configured maximum file size.");
  }

  const directory = await mkdtemp(join(tmpdir(), "nature-frontiers-reel-"));
  const filePath = join(directory, "approved-video.bin");
  const output = createWriteStream(filePath, { flags: "wx" });
  const outputDone = finished(output);
  const digest = createHash("sha256");
  let bytes = 0;

  try {
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) throw new Error("Reel media exceeds the configured maximum file size.");
      digest.update(chunk);
      if (!output.write(chunk)) await once(output, "drain");
    }
    output.end();
    await outputDone;
    if (bytes === 0) throw new Error("Reel media response was empty.");
    const actual = digest.digest("hex");
    if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
      throw new Error("Reel media SHA-256 does not match the approved campaign manifest.");
    }
    return {
      bytes,
      sha256: actual,
      contentType,
      finalUrl,
      filePath,
      cleanup: () => rm(directory, { recursive: true, force: true })
    };
  } catch (error) {
    output.destroy();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
