import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { extname } from "node:path";

function parseRate(value) {
  const [n, d] = String(value ?? "").split("/").map(Number);
  return Number.isFinite(n) && Number.isFinite(d) && d > 0 ? n / d : Number(value);
}
function fail(message) { throw new Error(message); }

export async function checkInstagramMediaFile(filePath, kind, { probeImpl = (path) => spawnSync("ffprobe", [
  "-v", "error", "-show_entries",
  "format=format_name,duration,size,bit_rate:stream=codec_type,codec_name,width,height,avg_frame_rate,sample_rate,channels",
  "-of", "json", path
], { encoding: "utf8", timeout: 20000, maxBuffer: 1024 * 1024 }), now = new Date() } = {}) {
  if (!["image", "reel"].includes(kind)) fail("Media kind must be image or reel.");
  const info = await stat(filePath);
  const maxBytes = kind === "image" ? 8_000_000 : 100_000_000;
  if (!info.isFile() || info.size <= 0 || info.size > maxBytes) fail(`Media file must be a regular file no larger than ${maxBytes} bytes.`);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  const sha256 = hash.digest("hex");
  const probe = probeImpl(filePath);
  if (probe.error) fail(`ffprobe could not inspect media: ${probe.error.message}`);
  if (probe.status !== 0) fail("ffprobe rejected the media file or could not parse its streams.");
  let metadata;
  try { metadata = JSON.parse(probe.stdout); } catch { fail("ffprobe returned invalid JSON."); }
  const format = String(metadata?.format?.format_name ?? "").toLowerCase();
  const streams = Array.isArray(metadata?.streams) ? metadata.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  if (!video) fail("Media file has no video/image stream.");
  const width = Number(video.width), height = Number(video.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) fail("Media dimensions are missing.");
  const aspect = width / height;
  const result = { status: "passed", tool: "ffprobe", kind, sha256, checked_at: now.toISOString(), file_size: info.size, format, width, height, aspect_ratio: Number(aspect.toFixed(5)) };
  if (kind === "image") {
    if (!/jpe?g/.test(format) && video.codec_name !== "mjpeg") fail("Instagram feed images must be JPEG.");
    if (extname(filePath).toLowerCase() !== ".jpg" && extname(filePath).toLowerCase() !== ".jpeg") fail("JPEG image filename must use .jpg or .jpeg.");
    if (width < 320 || width > 1440 || aspect < 0.8 || aspect > 1.91) fail("Image must be 320–1440 px wide and within the 4:5 to 1.91:1 aspect-ratio range.");
  } else {
    if (extname(filePath).toLowerCase() !== ".mp4" || !format.includes("mp4")) fail("This publisher supports MP4 Reels only.");
    if (!["h264", "hevc"].includes(String(video.codec_name).toLowerCase())) fail("Reel video codec must be H.264 or HEVC.");
    const fps = parseRate(video.avg_frame_rate);
    const duration = Number(metadata?.format?.duration);
    const bitrate = Number(metadata?.format?.bit_rate);
    if (!Number.isFinite(fps) || fps < 23 || fps > 60) fail("Reel frame rate must be between 23 and 60 FPS.");
    if (!Number.isFinite(duration) || duration < 3 || duration > 900) fail("Reel duration must be between 3 seconds and 15 minutes.");
    if (width > 1920 || aspect < 0.01 || aspect > 10) fail("Reel dimensions or aspect ratio are outside Meta's documented limits.");
    if (Number.isFinite(bitrate) && bitrate > 25_000_000) fail("Reel video bitrate exceeds 25 Mbps.");
    const audio = streams.find((stream) => stream.codec_type === "audio");
    if (audio) {
      const sampleRate = Number(audio.sample_rate), channels = Number(audio.channels);
      if (audio.codec_name !== "aac" || !Number.isFinite(sampleRate) || sampleRate > 48000 || ![1, 2].includes(channels)) {
        fail("Reel audio must be AAC, at most 48 kHz, and mono or stereo.");
      }
      result.audio = { codec: audio.codec_name, sample_rate: sampleRate, channels };
    } else result.audio = null;
    result.video = { codec: video.codec_name, fps, duration_seconds: duration, bitrate_bps: Number.isFinite(bitrate) ? bitrate : null };
  }
  return result;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf("--file"), kindIndex = args.indexOf("--kind");
  if (fileIndex < 0 || kindIndex < 0 || !args[fileIndex + 1] || !args[kindIndex + 1]) {
    console.error("Usage: node scripts/check-instagram-media.mjs --kind image|reel --file path");
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(await checkInstagramMediaFile(args[fileIndex + 1], args[kindIndex + 1]), null, 2));
  } catch (error) {
    console.error("MEDIA CHECK FAILED:", error.message);
    process.exit(1);
  }
}
