import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { verifyRemoteMedia } from "./facebook-reel-media.mjs";

const bytes = Buffer.from("original wildlife video bytes");
const digest = createHash("sha256").update(bytes).digest("hex");
function response({ body = bytes, status = 200, type = "video/mp4", url = "https://cdn.example.org/wildlife.mp4" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: { get: (name) => name.toLowerCase() === "content-type" ? type : null },
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(body)); controller.close(); } })
  };
}

test("verifies real remote video bytes against the approved SHA-256", async () => {
  const result = await verifyRemoteMedia("https://cdn.example.org/wildlife.mp4", digest, async () => response());
  assert.equal(result.bytes, bytes.length);
  assert.equal(result.sha256, digest);
  assert.equal(result.contentType, "video/mp4");
});

test("rejects a changed remote file before upload", async () => {
  await assert.rejects(
    verifyRemoteMedia("https://cdn.example.org/wildlife.mp4", digest, async () => response({ body: Buffer.from("changed video") })),
    /SHA-256 does not match/
  );
});

test("rejects non-video responses", async () => {
  await assert.rejects(
    verifyRemoteMedia("https://cdn.example.org/wildlife.mp4", digest, async () => response({ type: "text/html" })),
    /video content type/
  );
});

test("rejects inaccessible and empty responses", async () => {
  await assert.rejects(
    verifyRemoteMedia("https://cdn.example.org/wildlife.mp4", digest, async () => response({ status: 404 })),
    /could not be fetched/
  );
  await assert.rejects(
    verifyRemoteMedia("https://cdn.example.org/wildlife.mp4", digest, async () => response({ body: Buffer.alloc(0) })),
    /empty/
  );
});

test("rejects insecure URLs, HTTPS downgrade redirects, and missing digests", async () => {
  await assert.rejects(verifyRemoteMedia("http://cdn.example.org/wildlife.mp4", digest), /public HTTPS/);
  await assert.rejects(
    verifyRemoteMedia("https://cdn.example.org/wildlife.mp4", digest, async () => response({ url: "http://cdn.example.org/wildlife.mp4" })),
    /downgraded/
  );
  await assert.rejects(verifyRemoteMedia("https://cdn.example.org/wildlife.mp4", "not-a-hash"), /SHA-256 digest/);
});
