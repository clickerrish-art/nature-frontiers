import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_MEDIA_BYTES = 4 * 1024 * 1024 * 1024;

function isPublicIPv4(address) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b, c] = octets;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

function isPublicIPv6(address) {
  const value = address.toLowerCase().split("%")[0];
  if (value === "::" || value === "::1") return false;
  const first = Number.parseInt(value.split(":")[0] || "0", 16);
  const second = Number.parseInt(value.split(":")[1] || "0", 16);
  if (!Number.isFinite(first) || first < 0x2000 || first > 0x3fff) return false;
  if (first === 0x2002 || (first === 0x2001 && second <= 0x01ff) || (first === 0x3fff && second <= 0x0fff)) return false;
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
  try { url = new URL(value); } catch { throw new Error("Long-form video URL is invalid."); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password ||
      url.hash || url.port !== "" || url.hostname === "localhost" ||
      url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local") ||
      url.hostname.endsWith(".internal")) {
    throw new Error("Long-form video URL must be a public HTTPS URL without credentials, fragments, or non-standard ports.");
  }
  const hostname = url.hostname.startsWith("[") && url.hostname.endsWith("]")
    ? url.hostname.slice(1, -1)
    : url.hostname;
  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookupImpl(hostname, { all: true, verbatim: true });
  if (!Array.isArray(addresses) || addresses.length === 0 || addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new Error("Long-form video host resolves to a non-public or unverified network address.");
  }
  return url;
}

async function inspectVideo(filePath, probeImpl) {
  let result;
  try {
    result = await probeImpl("mediainfo", ["--Output=JSON", filePath], {
      timeout: 30000,
      maxBuffer: 1024 * 1024
    });
  } catch {
    throw new Error("Could not inspect long-form video metadata; MediaInfo must be available and the media must decode.");
  }
  let metadata;
  try { metadata = JSON.parse(result.stdout); } catch {
    throw new Error("MediaInfo returned invalid long-form video metadata.");
  }
  const tracks = metadata?.media?.track;
  const stream = Array.isArray(tracks) ? tracks.find((track) => track?.["@type"] === "Video") : null;
  const general = Array.isArray(tracks) ? tracks.find((track) => track?.["@type"] === "General") : null;
  const width = Number(stream?.Width);
  const height = Number(stream?.Height);
  const duration = Number(stream?.Duration ?? general?.Duration);
  const frameRate = Number(stream?.FrameRate);
  const formatName = String(general?.Format ?? "");
  if (!stream || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error("Long-form media must contain a readable video stream.");
  }
  if (width < 1280 || height < 720 || Math.abs(width / height - 16 / 9) > 0.03) {
    throw new Error("Long-form Facebook video must be landscape 16:9 and at least 1280x720 pixels.");
  }
  if (!Number.isFinite(duration) || duration < 300 || duration > 480) {
    throw new Error("Long-form Facebook video duration must be between 300 and 480 seconds (5–8 minutes).");
  }
  if (!Number.isFinite(frameRate) || frameRate < 23) {
    throw new Error("Long-form video frame rate must be at least 23 fps.");
  }
  if (!/(mpeg-4|quicktime)/i.test(formatName)) {
    throw new Error("Long-form Facebook video must use an MP4/MOV video container.");
  }
  return { width, height, duration, frameRate, formatName };
}

export async function verifyRemoteLongFormVideo(
  mediaUrl,
  expectedSha256,
  fetchImpl = fetch,
  lookupImpl = lookup,
  maxBytes = MAX_MEDIA_BYTES,
  probeImpl = execFileAsync
) {
  if (!/^[a-f0-9]{64}$/i.test(expectedSha256 ?? "")) throw new Error("A verified SHA-256 digest is required before long-form media transfer.");
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error("A positive maximum media size is required.");

  const parsed = await assertPublicHttpsUrl(mediaUrl, lookupImpl);
  const response = await fetchImpl(parsed, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(120000) });
  if (!response.ok || !response.body) throw new Error("Long-form media could not be fetched successfully (HTTP " + response.status + ").");
  const finalUrl = response.url || parsed.href;
  await assertPublicHttpsUrl(finalUrl, lookupImpl);
  const contentType = response.headers?.get?.("content-type") ?? "";
  if (!/^video\/(mp4|quicktime)/i.test(contentType)) throw new Error("Long-form media URL did not return an MP4/MOV video content type.");
  const declaredLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error("Long-form media exceeds the configured maximum file size.");

  const directory = await mkdtemp(join(tmpdir(), "nature-frontiers-video-"));
  const filePath = join(directory, "approved-long-form-video.mp4");
  const output = createWriteStream(filePath, { flags: "wx" });
  const outputDone = finished(output);
  const digest = createHash("sha256");
  let bytes = 0;

  try {
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) throw new Error("Long-form media exceeds the configured maximum file size.");
      digest.update(chunk);
      if (!output.write(chunk)) await once(output, "drain");
    }
    output.end();
    await outputDone;
    if (bytes === 0) throw new Error("Long-form media response was empty.");
    const actual = digest.digest("hex");
    if (actual.toLowerCase() !== expectedSha256.toLowerCase()) throw new Error("Long-form media SHA-256 does not match the approved campaign manifest.");
    const videoMetadata = await inspectVideo(filePath, probeImpl);
    return {
      bytes,
      sha256: actual,
      contentType,
      finalUrl,
      filePath,
      videoMetadata,
      cleanup: () => rm(directory, { recursive: true, force: true })
    };
  } catch (error) {
    output.destroy();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
