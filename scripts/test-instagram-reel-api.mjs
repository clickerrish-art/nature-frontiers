import test from "node:test";
import assert from "node:assert/strict";
import { publishInstagramReelFlow, verifyInstagramPublishedReel } from "./instagram-reel-api.mjs";

const config = {
  graphVersion: "v27.0",
  instagramUserId: "17841400000000000",
  accessToken: "test-token-only",
  videoUrl: "https://media.example.org/nile-crocodile.mp4",
  caption: "Licensed stock footage — illustrative. Footage: Creator via Pexels.",
  shareToFeed: true,
  waitImpl: async () => {},
  maxStatusAttempts: 3,
  pollIntervalMs: 0
};

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test("runs Instagram container creation, waits for FINISHED, publishes once and verifies exact remote Reel", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    calls.push({ url: target, options });
    if (target.endsWith("/media") && options.method === "POST") {
      const body = new URLSearchParams(options.body);
      assert.equal(body.get("media_type"), "REELS");
      assert.equal(body.get("video_url"), config.videoUrl);
      assert.equal(body.get("caption"), config.caption);
      assert.equal(body.get("share_to_feed"), "true");
      return jsonResponse({ id: "container-123" });
    }
    if (target.includes("/container-123?")) return jsonResponse({ id: "container-123", status_code: "FINISHED", status: "Finished" });
    if (target.endsWith("/media_publish")) {
      const body = new URLSearchParams(options.body);
      assert.equal(body.get("creation_id"), "container-123");
      return jsonResponse({ id: "ig-media-456" });
    }
    if (target.includes("/ig-media-456?")) {
      return jsonResponse({
        id: "ig-media-456", media_type: "REEL",
        permalink: "https://www.instagram.com/reel/ABC123/",
        caption: config.caption, timestamp: "2026-11-20T20:00:00+0000", username: "naturefrontiers"
      });
    }
    throw new Error("Unexpected Instagram API request: " + target);
  };
  const result = await publishInstagramReelFlow({ ...config, fetchImpl });
  assert.deepEqual(result, {
    containerId: "container-123",
    mediaId: "ig-media-456",
    permalink: "https://www.instagram.com/reel/ABC123/",
    timestamp: "2026-11-20T20:00:00+0000",
    username: "naturefrontiers"
  });
  assert.equal(calls.length, 4);
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 2);
});

test("never publishes a container that reaches ERROR or EXPIRED", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    calls.push({ target, method: options.method });
    if (target.endsWith("/media") && options.method === "POST") return jsonResponse({ id: "container-bad" });
    if (target.includes("/container-bad?")) return jsonResponse({ id: "container-bad", status_code: "ERROR" });
    throw new Error("Unexpected request after terminal container error: " + target);
  };
  await assert.rejects(publishInstagramReelFlow({ ...config, fetchImpl }), /terminal status ERROR/);
  assert.equal(calls.filter((call) => call.method === "POST").length, 1, "only container creation is allowed before FINISHED");
});

test("does not publish when container processing never reaches FINISHED", async () => {
  let publishCalls = 0;
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    if (target.endsWith("/media") && options.method === "POST") return jsonResponse({ id: "container-slow" });
    if (target.includes("/container-slow?")) return jsonResponse({ id: "container-slow", status_code: "IN_PROGRESS" });
    if (target.endsWith("/media_publish")) publishCalls++;
    throw new Error("Unexpected request: " + target);
  };
  await assert.rejects(publishInstagramReelFlow({ ...config, fetchImpl }), /did not reach FINISHED/);
  assert.equal(publishCalls, 0);
});

test("rejects remote media with wrong type, caption or non-HTTPS permalink", async () => {
  await assert.rejects(
    verifyInstagramPublishedReel({
      graphVersion: config.graphVersion, accessToken: config.accessToken, mediaId: "ig-media-1",
      expectedCaption: config.caption,
      fetchImpl: async () => jsonResponse({ id: "ig-media-1", media_type: "VIDEO", permalink: "https://instagram.com/x", caption: config.caption })
    }),
    /does not match/
  );
  await assert.rejects(
    verifyInstagramPublishedReel({
      graphVersion: config.graphVersion, accessToken: config.accessToken, mediaId: "ig-media-1",
      expectedCaption: config.caption,
      fetchImpl: async () => jsonResponse({ id: "ig-media-1", media_type: "REEL", permalink: "http://instagram.com/x", caption: config.caption })
    }),
    /does not match/
  );
});

test("rejects malformed IDs, tokens, URLs and missing caption/feed choice before API calls", async () => {
  const fetchImpl = async () => { throw new Error("No API request should occur"); };
  await assert.rejects(publishInstagramReelFlow({ ...config, instagramUserId: "not-numeric", fetchImpl }), /numeric Instagram professional account ID/);
  await assert.rejects(publishInstagramReelFlow({ ...config, videoUrl: "http://media.example.org/video.mp4", fetchImpl }), /public HTTPS URL/);
  await assert.rejects(publishInstagramReelFlow({ ...config, shareToFeed: undefined, fetchImpl }), /share_to_feed/);
});
