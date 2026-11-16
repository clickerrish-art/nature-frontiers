import assert from "node:assert/strict";
import { createInstagramMediaContainer, getInstagramContainerStatus, publishInstagramContainer, verifyInstagramMedia, getInstagramPublishingLimit, listRecentInstagramMedia } from "./instagram-api.mjs";

const configBase = { apiVersion: "v27.0", instagramUserId: "17841413164146618", accessToken: "test-secret" };
function mockFetch(responses, calls) {
  return async (url, options = {}) => {
    calls.push({ url, options });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return { ok: next.ok ?? true, status: next.status ?? 200, text: async () => JSON.stringify(next.body) };
  };
}
const tests = [
  ["image container uses Unified Login SUAT Graph host and bearer header", async () => {
    const calls = [];
    const config = { ...configBase, fetchImpl: mockFetch([{ body: { id: "container-1" } }], calls) };
    assert.deepEqual(await createInstagramMediaContainer(config, { kind: "image", url: "https://cdn.example.test/image.jpg", caption: "Wildlife" }), { containerId: "container-1" });
    assert.equal(calls[0].url, "https://graph.facebook.com/v27.0/17841413164146618/media");
    assert.equal(calls[0].options.headers.Authorization, "Bearer test-secret");
    assert.deepEqual(JSON.parse(calls[0].options.body), { caption: "Wildlife", image_url: "https://cdn.example.test/image.jpg" });
  }],
  ["Reel container uses media_type REELS", async () => {
    const calls = [];
    const config = { ...configBase, fetchImpl: mockFetch([{ body: { id: "container-2" } }], calls) };
    await createInstagramMediaContainer(config, { kind: "reel", url: "https://cdn.example.test/reel.mp4", caption: "Wildlife", shareToFeed: true });
    assert.deepEqual(JSON.parse(calls[0].options.body), { caption: "Wildlife", media_type: "REELS", video_url: "https://cdn.example.test/reel.mp4", share_to_feed: true });
  }],
  ["non-HTTPS media URL is rejected before network call", async () => {
    let called = false;
    const config = { ...configBase, fetchImpl: async () => { called = true; } };
    await assert.rejects(() => createInstagramMediaContainer(config, { kind: "image", url: "http://example.test/a.jpg" }), /public HTTPS/);
    assert.equal(called, false);
  }],
  ["IN_PROGRESS container cannot be published", async () => {
    const calls = [];
    const config = { ...configBase, fetchImpl: mockFetch([{ body: { id: "container-3", status_code: "IN_PROGRESS" } }], calls) };
    await assert.rejects(() => publishInstagramContainer(config, "container-3"), /publication is blocked/);
    assert.equal(calls.length, 1);
  }],
  ["FINISHED container is checked before exactly one publish request", async () => {
    const calls = [];
    const config = { ...configBase, fetchImpl: mockFetch([{ body: { id: "container-4", status_code: "FINISHED" } }, { body: { id: "media-4" } }], calls) };
    assert.deepEqual(await publishInstagramContainer(config, "container-4"), { mediaId: "media-4" });
    assert.equal(calls.length, 2);
    assert.match(calls[1].url, /17841413164146618\/media_publish$/);
    assert.deepEqual(JSON.parse(calls[1].options.body), { creation_id: "container-4" });
  }],
  ["published media must read back with expected ID and permalink", async () => {
    const config = { ...configBase, fetchImpl: mockFetch([{ body: { id: "media-5", permalink: "https://www.instagram.com/p/example/", timestamp: "2026-11-16T03:00:00+0000", media_type: "IMAGE" } }], []) };
    assert.equal((await verifyInstagramMedia(config, "media-5", "image")).permalink, "https://www.instagram.com/p/example/");
  }],
  ["transport error is marked ambiguous and not retried", async () => {
    let calls = 0;
    const config = { ...configBase, fetchImpl: async () => { calls++; throw new TypeError("network down"); } };
    await assert.rejects(() => getInstagramContainerStatus(config, "container-6"), /ambiguous; do not retry automatically/);
    assert.equal(calls, 1);
  }],
  ["publishing quota reads Meta's quota_total and quota_usage", async () => {
    const calls = [];
    const config = { ...configBase, fetchImpl: mockFetch([{ body: { data: [{ quota_usage: 7, config: { quota_total: 50, quota_duration: 86400 } }] } }], calls) };
    assert.deepEqual(await getInstagramPublishingLimit(config), { quotaUsage: 7, quotaTotal: 50, quotaDuration: 86400 });
    assert.match(calls[0].url, /content_publishing_limit/);
  }],
  ["recent media endpoint returns data for reconciliation", async () => {
    const config = { ...configBase, fetchImpl: mockFetch([{ body: { data: [{ id: "m1", caption: "test", media_type: "IMAGE", permalink: "https://www.instagram.com/p/x/" }] } }], []) };
    assert.equal((await listRecentInstagramMedia(config))[0].id, "m1");
  }],
  ["remote media verification rejects a mismatched media type", async () => {
    const config = { ...configBase, fetchImpl: mockFetch([{ body: { id: "media-6", permalink: "https://www.instagram.com/reel/x/", media_type: "VIDEO" } }], []) };
    await assert.rejects(() => verifyInstagramMedia(config, "media-6", "image"), /read-back did not confirm/);
  }]
];
let failures = 0;
for (const [name, run] of tests) {
  try { await run(); console.log("PASS:", name); }
  catch (error) { failures++; console.error("FAIL:", name, error); }
}
if (failures) process.exit(1);
console.log(`Instagram API client tests: ${tests.length - failures}/${tests.length} passed. All network calls were mocked; no Instagram request was sent.`);
