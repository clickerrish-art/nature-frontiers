import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { verifyRemoteLongFormVideo } from "./facebook-video-media.mjs";

const bytes = Buffer.from("original 7 minute wildlife documentary bytes");
const digest = createHash("sha256").update(bytes).digest("hex");
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
const validMetadata = {
  media: { track: [
    { "@type": "General", Format: "MPEG-4", Duration: "360" },
    { "@type": "Video", Width: "1920", Height: "1080", FrameRate: "29.970", Duration: "360" },
    { "@type": "Audio", Format: "AAC", Duration: "360", SamplingRate: "48000", Channels: "2" }
  ] }
};

function response({ body = bytes, status = 200, type = "video/mp4", url = "https://cdn.example.org/wildlife.mp4", length, location } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: {
      get: (name) => {
        const key = name.toLowerCase();
        if (key === "content-type") return type;
        if (key === "content-length") return length === undefined ? String(body.length) : String(length);
        if (key === "location") return location ?? null;
        return null;
      }
    },
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(body)); controller.close(); } })
  };
}

test("stages exact hash-verified bytes and confirms landscape long-form technical requirements", async () => {
  const result = await verifyRemoteLongFormVideo("https://cdn.example.org/wildlife.mp4", digest, async () => response(), publicLookup, undefined, async () => ({ stdout: JSON.stringify(validMetadata) }));
  try {
    assert.equal(result.bytes, bytes.length);
    assert.equal(result.sha256, digest);
    assert.deepEqual(await readFile(result.filePath), bytes);
    assert.deepEqual(result.videoMetadata, { width: 1920, height: 1080, duration: 360, frameRate: 29.97, formatName: "MPEG-4", audioFormat: "AAC", audioDuration: 360, audioSampleRate: 48000, audioChannels: 2 });
  } finally {
    await result.cleanup();
  }
});

test("rejects missing, unsynchronized, low-rate or unsupported audio before upload", async () => {
  const invalidAudio = [
    validMetadata.media.track.filter((track) => track["@type"] !== "Audio"),
    validMetadata.media.track.map((track) => track["@type"] === "Audio" ? { ...track, Duration: "300" } : track),
    validMetadata.media.track.map((track) => track["@type"] === "Audio" ? { ...track, SamplingRate: "22050" } : track),
    validMetadata.media.track.map((track) => track["@type"] === "Audio" ? { ...track, Format: "AC-3" } : track),
    validMetadata.media.track.map((track) => track["@type"] === "Audio" ? { ...track, Channels: "6" } : track)
  ];
  for (const track of invalidAudio) {
    const metadata = { media: { track } };
    await assert.rejects(
      verifyRemoteLongFormVideo("https://cdn.example.org/wildlife.mp4", digest, async () => response(), publicLookup, undefined,
        async () => ({ stdout: JSON.stringify(metadata) })),
      /audio stream|audio duration|AAC encoding|sample rate|mono or stereo/
    );
  }
});

test("accepts the new 3-minute lower duration boundary", async () => {
  const metadata = { media: { track: [
    { "@type": "General", Format: "MPEG-4", Duration: "180" },
    { "@type": "Video", Width: "1920", Height: "1080", FrameRate: "29.970", Duration: "180" }
  ] } };
  const result = await verifyRemoteLongFormVideo("https://cdn.example.org/wildlife.mp4", digest, async () => response(), publicLookup, undefined, async () => ({ stdout: JSON.stringify(metadata) }));
  try { assert.equal(result.videoMetadata.duration, 180); } finally { await result.cleanup(); }
});

test("rejects changed bytes before upload", async () => {
  await assert.rejects(verifyRemoteLongFormVideo("https://cdn.example.org/wildlife.mp4", digest, async () => response({ body: Buffer.from("changed") }), publicLookup), /SHA-256 does not match/);
});

test("rejects portrait, low-resolution, too-short, too-long, slow-frame-rate and unsupported-container video", async () => {
  const invalid = [
    { media: { track: [{ "@type": "General", Format: "MPEG-4", Duration: "360" }, { "@type": "Video", Width: "1080", Height: "1920", FrameRate: "30", Duration: "360" }] } },
    { media: { track: [{ "@type": "General", Format: "MPEG-4", Duration: "360" }, { "@type": "Video", Width: "640", Height: "360", FrameRate: "30", Duration: "360" }] } },
    { media: { track: [{ "@type": "General", Format: "MPEG-4", Duration: "179" }, { "@type": "Video", Width: "1920", Height: "1080", FrameRate: "30", Duration: "179" }] } },
    { media: { track: [{ "@type": "General", Format: "MPEG-4", Duration: "481" }, { "@type": "Video", Width: "1920", Height: "1080", FrameRate: "30", Duration: "481" }] } },
    { media: { track: [{ "@type": "General", Format: "MPEG-4", Duration: "360" }, { "@type": "Video", Width: "1920", Height: "1080", FrameRate: "20", Duration: "360" }] } },
    { media: { track: [{ "@type": "General", Format: "AVI", Duration: "360" }, { "@type": "Video", Width: "1920", Height: "1080", FrameRate: "30", Duration: "360" }] } }
  ];
  for (const metadata of invalid) {
    await assert.rejects(verifyRemoteLongFormVideo("https://cdn.example.org/wildlife.mp4", digest, async () => response(), publicLookup, undefined, async () => ({ stdout: JSON.stringify(metadata) })), /Long-form Facebook video|Long-form video frame|MP4\/MOV/);
  }
});

test("rejects inaccessible responses, non-video types, empty content and oversized media", async () => {
  await assert.rejects(verifyRemoteLongFormVideo("https://cdn.example.org/wildlife.mp4", digest, async () => response({ status: 404 }), publicLookup), /could not be fetched/);
  await assert.rejects(verifyRemoteLongFormVideo("https://cdn.example.org/wildlife.mp4", digest, async () => response({ type: "text/html" }), publicLookup), /MP4\/MOV/);
  await assert.rejects(verifyRemoteLongFormVideo("https://cdn.example.org/wildlife.mp4", digest, async () => response({ body: Buffer.alloc(0) }), publicLookup), /empty/);
  await assert.rejects(verifyRemoteLongFormVideo("https://cdn.example.org/wildlife.mp4", digest, async () => response({ length: 1000 }), publicLookup, 100), /maximum file size/);
  await assert.rejects(verifyRemoteLongFormVideo("https://cdn.example.org/wildlife.mp4", digest, async () => response({ body: Buffer.alloc(200) }), publicLookup, 100), /maximum file size/);
});

test("rejects private, credentialed, non-HTTPS and non-standard-port URLs", async () => {
  for (const url of [
    "http://cdn.example.org/video.mp4", "https://user:pass@cdn.example.org/video.mp4",
    "https://cdn.example.org:8443/video.mp4", "https://localhost/video.mp4",
    "https://127.0.0.1/video.mp4", "https://10.0.0.5/video.mp4",
    "https://169.254.1.2/video.mp4", "https://[::1]/video.mp4",
    "https://[2001:db8::1]/video.mp4", "https://cdn.example.org/video.mp4#fragment"
  ]) {
    await assert.rejects(verifyRemoteLongFormVideo(url, digest, async () => response(), publicLookup), /public HTTPS|non-public/);
  }
});

test("rejects DNS names resolving to private or mixed addresses", async () => {
  await assert.rejects(verifyRemoteLongFormVideo("https://cdn.example.org/video.mp4", digest, async () => response(), async () => [{ address: "192.168.1.10", family: 4 }]), /non-public/);
  await assert.rejects(verifyRemoteLongFormVideo("https://cdn.example.org/video.mp4", digest, async () => response(), async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.8", family: 4 }]), /non-public/);
});

test("validates each redirect target before requesting it", async () => {
  let calls = 0;
  await assert.rejects(
    verifyRemoteLongFormVideo("https://cdn.example.org/video.mp4", digest, async (url, options) => {
      calls++;
      assert.equal(options.redirect, "manual");
      return response({ status: 302, location: "https://127.0.0.1/redirected.mp4" });
    }, publicLookup),
    /non-public/
  );
  assert.equal(calls, 1, "private redirect target must never be requested");
});

test("follows a public redirect only after validating the destination", async () => {
  let calls = 0;
  const result = await verifyRemoteLongFormVideo("https://cdn.example.org/video.mp4", digest, async (url, options) => {
    calls++;
    assert.equal(options.redirect, "manual");
    return calls === 1
      ? response({ status: 302, location: "https://media.example.org/wildlife.mp4" })
      : response({ url: "https://media.example.org/wildlife.mp4" });
  }, publicLookup, undefined, async () => ({ stdout: JSON.stringify(validMetadata) }));
  try {
    assert.equal(calls, 2);
    assert.equal(result.finalUrl, "https://media.example.org/wildlife.mp4");
  } finally { await result.cleanup(); }
});

test("fails closed when MediaInfo is unavailable", async () => {
  await assert.rejects(verifyRemoteLongFormVideo("https://cdn.example.org/video.mp4", digest, async () => response(), publicLookup, undefined, async () => { throw new Error("missing"); }), /MediaInfo must be available/);
});

test("rejects missing checksum", async () => {
  await assert.rejects(verifyRemoteLongFormVideo("https://cdn.example.org/video.mp4", "missing", async () => response(), publicLookup), /SHA-256 digest/);
});

test("uses a conservative 1 GB file-size ceiling for Page video URL uploads", async () => {
  await assert.rejects(
    verifyRemoteLongFormVideo("https://cdn.example.org/wildlife.mp4", digest, async () => response({ length: 1024 * 1024 * 1024 + 1 }), publicLookup),
    /maximum file size/
  );
});
