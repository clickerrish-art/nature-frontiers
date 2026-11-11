import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { verifyRemoteMedia } from "./facebook-reel-media.mjs";

const bytes = Buffer.from("original wildlife video bytes");
const digest = createHash("sha256").update(bytes).digest("hex");
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

function response({ body = bytes, status = 200, type = "video/mp4", url = "https://cdn.example.org/wildlife.mp4", length } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: {
      get: (name) => {
        const key = name.toLowerCase();
        if (key === "content-type") return type;
        if (key === "content-length") return length === undefined ? String(body.length) : String(length);
        return null;
      }
    },
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(body)); controller.close(); } })
  };
}

test("verifies remote video bytes, public DNS and SHA-256", async () => {
  const result = await verifyRemoteMedia("https://cdn.example.org/wildlife.mp4", digest, async () => response(), publicLookup);
  assert.equal(result.bytes, bytes.length);
  assert.equal(result.sha256, digest);
  assert.equal(result.contentType, "video/mp4");
});

test("rejects a changed remote file before upload", async () => {
  await assert.rejects(
    verifyRemoteMedia("https://cdn.example.org/wildlife.mp4", digest, async () => response({ body: Buffer.from("changed video") }), publicLookup),
    /SHA-256 does not match/
  );
});

test("rejects non-video and inaccessible responses", async () => {
  await assert.rejects(
    verifyRemoteMedia("https://cdn.example.org/wildlife.mp4", digest, async () => response({ type: "text/html" }), publicLookup),
    /video content type/
  );
  await assert.rejects(
    verifyRemoteMedia("https://cdn.example.org/wildlife.mp4", digest, async () => response({ status: 404 }), publicLookup),
    /could not be fetched/
  );
});

test("rejects empty responses and content larger than the configured limit", async () => {
  await assert.rejects(
    verifyRemoteMedia("https://cdn.example.org/wildlife.mp4", digest, async () => response({ body: Buffer.alloc(0) }), publicLookup),
    /empty/
  );
  await assert.rejects(
    verifyRemoteMedia("https://cdn.example.org/wildlife.mp4", digest, async () => response({ length: 1000 }), publicLookup, 100),
    /maximum file size/
  );
  await assert.rejects(
    verifyRemoteMedia("https://cdn.example.org/wildlife.mp4", digest, async () => response({ body: Buffer.alloc(200) }), publicLookup, 100),
    /maximum file size/
  );
});

test("rejects private, loopback, link-local and malformed URLs", async () => {
  for (const url of [
    "http://cdn.example.org/video.mp4",
    "https://user:pass@cdn.example.org/video.mp4",
    "https://cdn.example.org:8443/video.mp4",
    "https://localhost/video.mp4",
    "https://127.0.0.1/video.mp4",
    "https://10.0.0.5/video.mp4",
    "https://169.254.1.2/video.mp4",
    "https://[::1]/video.mp4",
    "https://[::ffff:7f00:1]/video.mp4",
    "https://[2002:7f00:1::1]/video.mp4",
    "https://[2001:db8::1]/video.mp4",
    "https://cdn.example.org/video.mp4#fragment"
  ]) {
    await assert.rejects(
      verifyRemoteMedia(url, digest, async () => response(), publicLookup),
      /public HTTPS|non-public/
    );
  }
});

test("rejects DNS names resolving to private or mixed public/private addresses", async () => {
  const privateLookup = async () => [{ address: "192.168.1.10", family: 4 }];
  const mixedLookup = async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "10.0.0.8", family: 4 }
  ];
  await assert.rejects(
    verifyRemoteMedia("https://cdn.example.org/video.mp4", digest, async () => response(), privateLookup),
    /non-public/
  );
  await assert.rejects(
    verifyRemoteMedia("https://cdn.example.org/video.mp4", digest, async () => response(), mixedLookup),
    /non-public/
  );
});

test("checks the final redirect host and refuses private redirect targets", async () => {
  await assert.rejects(
    verifyRemoteMedia(
      "https://cdn.example.org/video.mp4",
      digest,
      async () => response({ url: "https://127.0.0.1/redirected.mp4" }),
      publicLookup
    ),
    /non-public/
  );
});

test("rejects missing digests", async () => {
  await assert.rejects(
    verifyRemoteMedia("https://cdn.example.org/video.mp4", "not-a-hash", async () => response(), publicLookup),
    /SHA-256 digest/
  );
});
