import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, truncate } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkInstagramMediaFile } from "./check-instagram-media.mjs";

const dir = await mkdtemp(join(tmpdir(), "nf-instagram-media-"));
const file = join(dir, "test.jpg");
const video = join(dir, "test.mp4");
const tests = [
  ["valid JPEG image passes and emits SHA-bound metadata", async () => {
    await writeFile(file, Buffer.from("jpeg-test"));
    const result = await checkInstagramMediaFile(file, "image", { now: new Date("2026-11-16T12:00:00Z"), probeImpl: () => ({ status: 0, stdout: JSON.stringify({ format: { format_name: "jpeg_pipe", size: "9" }, streams: [{ codec_type: "video", codec_name: "mjpeg", width: 1080, height: 1350 }] }) }) });
    assert.equal(result.status, "passed"); assert.equal(result.kind, "image"); assert.equal(result.sha256.length, 64);
  }],
  ["image outside Meta aspect ratio is rejected", async () => {
    await assert.rejects(() => checkInstagramMediaFile(file, "image", { probeImpl: () => ({ status: 0, stdout: JSON.stringify({ format: { format_name: "jpeg_pipe" }, streams: [{ codec_type: "video", codec_name: "mjpeg", width: 1920, height: 1080 }] }) }) }), /aspect-ratio/);
  }],
  ["valid MP4 Reel with supported codec and audio passes", async () => {
    await writeFile(video, Buffer.from("mp4-test"));
    const result = await checkInstagramMediaFile(video, "reel", { probeImpl: () => ({ status: 0, stdout: JSON.stringify({ format: { format_name: "mov,mp4,m4a", duration: "60", bit_rate: "10000000" }, streams: [{ codec_type: "video", codec_name: "h264", width: 1080, height: 1920, avg_frame_rate: "30/1" }, { codec_type: "audio", codec_name: "aac", sample_rate: "44100", channels: 2 }] }) }) });
    assert.equal(result.status, "passed"); assert.equal(result.video.codec, "h264"); assert.equal(result.audio.codec, "aac");
  }],
  ["Reel outside frame-rate limits is rejected", async () => {
    await assert.rejects(() => checkInstagramMediaFile(video, "reel", { probeImpl: () => ({ status: 0, stdout: JSON.stringify({ format: { format_name: "mp4", duration: "60", bit_rate: "10000000" }, streams: [{ codec_type: "video", codec_name: "h264", width: 1080, height: 1920, avg_frame_rate: "15/1" }] }) }) }), /frame rate/);
  }],
  ["image above Meta file-size limit is rejected before probing", async () => {
    await truncate(file, 8_000_001);
    let probed = false;
    await assert.rejects(() => checkInstagramMediaFile(file, "image", { probeImpl: () => { probed = true; return { status: 0, stdout: "{}" }; } }), /no larger than/);
    assert.equal(probed, false);
  }]
];
let failures = 0;
try {
  for (const [name, run] of tests) { try { await run(); console.log("PASS:", name); } catch (error) { failures++; console.error("FAIL:", name, error); } }
} finally { await rm(dir, { recursive: true, force: true }); }
if (failures) process.exit(1);
console.log(`Instagram media technical preflight tests: ${tests.length - failures}/${tests.length} passed. ffprobe was mocked; no external service was called.`);
