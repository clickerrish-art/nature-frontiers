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
function parseBitRate(value) {
  const raw = String(value ?? "");
  const numeric = Number.parseFloat(raw.replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return NaN;
  if (/m(?:bit|b)\/s|mbps/i.test(raw)) return numeric * 1000000;
  if (/k(?:bit|b)\/s|kbps/i.test(raw)) return numeric * 1000;
  return numeric;
}
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
    (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
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

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function fetchPublicMediaResponse(initialUrl, fetchImpl, lookupImpl) {
  let currentUrl = await assertPublicHttpsUrl(initialUrl, lookupImpl);
  for (let redirectCount = 0; redirectCount <= 5; redirectCount++) {
    const response = await fetchImpl(currentUrl, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(120000)
    });
    if (!REDIRECT_STATUSES.has(response.status)) {
      return { response, finalUrl: currentUrl.href };
    }
    const location = response.headers?.get?.("location");
    if (!location) throw new Error("Reel media host returned a redirect without a Location header.");
    if (redirectCount === 5) throw new Error("Reel media exceeded the maximum of five redirects.");
    let nextUrl;
    try { nextUrl = new URL(location, currentUrl); } catch {
      throw new Error("Reel media redirect contained an invalid target URL.");
    }
    // Validate scheme, credentials, hostname and DNS before issuing the next request.
    currentUrl = await assertPublicHttpsUrl(nextUrl.href, lookupImpl);
  }
  throw new Error("Reel media redirect validation failed.");
}

async function inspectReelVideo(filePath, probeImpl, durationProfile = {}) {
  let result;
  try {
    result = await probeImpl("mediainfo", ["--Output=JSON", filePath], {
      timeout: 30000,
      maxBuffer: 1024 * 1024
    });
  } catch {
    throw new Error("Could not inspect Reel video metadata; MediaInfo must be available and the media must decode.");
  }
  let metadata;
  try { metadata = JSON.parse(result.stdout); } catch {
    throw new Error("MediaInfo returned invalid Reel video metadata.");
  }
  const tracks = metadata?.media?.track;
  const stream = Array.isArray(tracks) ? tracks.find((track) => track?.["@type"] === "Video") : null;
  const general = Array.isArray(tracks) ? tracks.find((track) => track?.["@type"] === "General") : null;
  const width = Number(stream?.Width);
  const height = Number(stream?.Height);
  const duration = Number(stream?.Duration ?? general?.Duration);
  const frameRate = Number(stream?.FrameRate);
  const formatName = String(general?.Format ?? "");
  const videoCodec = String(stream?.Format ?? stream?.CodecID ?? "");
  const audioStream = Array.isArray(tracks) ? tracks.find((track) => track?.["@type"] === "Audio") : null;
  const audioFormat = String(audioStream?.Format ?? "");
  const audioRateText = String(audioStream?.SamplingRate ?? "");
  const audioSampleRateHz = /khz/i.test(audioRateText)
    ? Number.parseFloat(audioRateText) * 1000
    : Number.parseFloat(audioRateText.replace(/[^0-9.]/g, ""));
  const audioBitRate = parseBitRate(audioStream?.BitRate);
  const videoBitRate = parseBitRate(stream?.BitRate);
  if (!stream || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error("Reel media must contain a readable video stream.");
  }
  if (width < 540 || height < 960 || Math.abs(width / height - 9 / 16) > 0.005) {
    throw new Error("Facebook Reel must be portrait 9:16 and at least 540x960 pixels.");
  }
  const minDuration = Number.isFinite(durationProfile.minSeconds) ? durationProfile.minSeconds : 25;
  const maxDuration = Number.isFinite(durationProfile.maxSeconds) ? durationProfile.maxSeconds : 35;
  if (!Number.isFinite(duration) || duration < minDuration || duration > maxDuration) {
    throw new Error("Reel duration must be between " + minDuration + " and " + maxDuration + " seconds for the selected campaign profile.");
  }
  if (!Number.isFinite(frameRate) || frameRate < 23) {
    throw new Error("Facebook Reel frame rate must be at least 23 fps.");
  }
  if (!/(mpeg-4|quicktime)/i.test(formatName)) {
    throw new Error("Reel must use a supported MP4/MOV video container.");
  }
  if (durationProfile.requireInstagramProfile === true) {
    if (width > 1920 || height > 1920) throw new Error("Instagram Reel dimensions must not exceed 1920 pixels on either axis.");
    if (frameRate > 60) throw new Error("Instagram Reel frame rate must not exceed 60 fps.");
    if (Number.isFinite(videoBitRate) && videoBitRate > 25000000) throw new Error("Instagram Reel video bitrate must not exceed 25 Mbps.");
    if (!/(avc|h.?264|hevc)/i.test(videoCodec)) throw new Error("Instagram Reels require an H.264 or HEVC video stream.");
    if (!audioStream || !/^AAC$/i.test(audioFormat) || Math.round(audioSampleRateHz) !== 48000) {
      throw new Error("Instagram Reels require an AAC audio stream sampled at 48 kHz.");
    }
    if (Number.isFinite(audioBitRate) && audioBitRate > 128000) {
      throw new Error("Instagram Reel audio bitrate must not exceed 128 kbps.");
    }
  }
  const audioMetadata = audioStream ? { format: audioFormat, sampleRateHz: audioSampleRateHz, bitRate: Number.isFinite(audioBitRate) ? audioBitRate : null } : null;
  return { width, height, duration, frameRate, formatName, ...(audioMetadata ? { audioMetadata } : {}), ...(videoCodec ? { videoCodec } : {}) };
}

export async function verifyRemoteMedia(
  mediaUrl,
  expectedSha256,
  fetchImpl = fetch,
  lookupImpl = lookup,
  maxBytes = MAX_MEDIA_BYTES,
  probeImpl = execFileAsync,
  durationProfile = {}
) {
  if (!/^[a-f0-9]{64}$/i.test(expectedSha256 ?? "")) {
    throw new Error("A verified SHA-256 digest is required before media transfer.");
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error("A positive maximum media size is required.");
  }

  const { response, finalUrl } = await fetchPublicMediaResponse(mediaUrl, fetchImpl, lookupImpl);
  if (!response.ok || !response.body) throw new Error("Reel media could not be fetched successfully (HTTP " + response.status + ").");
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
    const videoMetadata = await inspectReelVideo(filePath, probeImpl, durationProfile);
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
