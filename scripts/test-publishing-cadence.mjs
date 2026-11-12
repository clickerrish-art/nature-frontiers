import test from "node:test";
import assert from "node:assert/strict";
import { APPROVED_POSTING_SLOTS, assertApprovedPostingWindow, assertDailyReleaseCapacity, getJohannesburgDailyReleaseCounts, johannesburgDateKey } from "./publishing-cadence.mjs";

test("allows any second within the two approved Johannesburg posting minutes", () => {
  assert.deepEqual(APPROVED_POSTING_SLOTS, [{ hour: 11, minute: 0 }, { hour: 16, minute: 0 }]);
  assert.deepEqual(assertApprovedPostingWindow("2026-11-12T09:00:00.000Z"), { timeZone: "Africa/Johannesburg", hour: 11, minute: 0, second: 0 });
  assert.deepEqual(assertApprovedPostingWindow("2026-11-12T09:00:59.999Z"), { timeZone: "Africa/Johannesburg", hour: 11, minute: 0, second: 59 });
  assert.deepEqual(assertApprovedPostingWindow("2026-11-12T14:00:59.999Z"), { timeZone: "Africa/Johannesburg", hour: 16, minute: 0, second: 59 });
  assert.throws(() => assertApprovedPostingWindow("2026-11-12T08:59:59.999Z"), /restricted to the 11:00 and 16:00/);
  assert.throws(() => assertApprovedPostingWindow("2026-11-12T09:01:00.000Z"), /restricted to the 11:00 and 16:00/);
  assert.throws(() => assertApprovedPostingWindow("2026-11-12T14:01:00.000Z"), /restricted to the 11:00 and 16:00/);
  assert.throws(() => assertApprovedPostingWindow("2026-11-12T12:00:00.000Z"), /restricted to the 11:00 and 16:00/);
});
test("uses the Africa/Johannesburg calendar date rather than UTC", () => {
  assert.equal(johannesburgDateKey("2026-11-11T21:59:59.000Z"), "2026-11-11");
  assert.equal(johannesburgDateKey("2026-11-11T22:00:00.000Z"), "2026-11-12");
});

test("counts today's published releases and ignores drafts, pending items and previous Johannesburg days", () => {
  const campaigns = [
    { status: "published", facebook_type: "VIDEO", published_at: "2026-11-11T08:00:00.000Z" },
    { status: "published", facebook_type: "REEL", published_at: "2026-11-11T12:00:00.000Z" },
    { status: "published", facebook_type: "POST", published_at: "2026-11-10T21:30:00.000Z" },
    { status: "draft", facebook_type: "VIDEO", published_at: "2026-11-11T14:00:00.000Z" },
    { status: "publishing", facebook_type: "REEL", publishing_started_at: "2026-11-11T14:00:00.000Z" }
  ];
  assert.deepEqual(getJohannesburgDailyReleaseCounts(campaigns, new Date("2026-11-11T14:00:00.000Z")), {
    date: "2026-11-11", feedPosts: 1, reels: 1, total: 2
  });
});

test("allows two Reels and one feed post per Johannesburg day", () => {
  const now = new Date("2026-11-11T14:00:00.000Z");
  const twoReels = [
    { status: "published", facebook_type: "REEL", published_at: "2026-11-11T08:00:00.000Z" },
    { status: "published", facebook_type: "REEL", published_at: "2026-11-11T12:00:00.000Z" }
  ];
  assert.equal(assertDailyReleaseCapacity(twoReels, "POST", now).reels, 2);
  assert.throws(() => assertDailyReleaseCapacity(twoReels, "REEL", now), /no more than two Reels/);

  const withFeed = [...twoReels, { status: "published", facebook_type: "POST", published_at: "2026-11-11T13:00:00.000Z" }];
  assert.throws(() => assertDailyReleaseCapacity(withFeed, "POST", now), /three total releases/);
  assert.throws(() => assertDailyReleaseCapacity(withFeed, "REEL", now), /three total releases/);
});

test("long-form Page videos and text feed posts share one daily feed slot", () => {
  const now = new Date("2026-11-11T14:00:00.000Z");
  const publishedVideo = [{ status: "published", facebook_type: "VIDEO", published_at: "2026-11-11T08:00:00.000Z" }];
  assert.throws(() => assertDailyReleaseCapacity(publishedVideo, "POST", now), /one feed post/);
  const publishedPost = [{ status: "published", facebook_type: "POST", published_at: "2026-11-11T08:00:00.000Z" }];
  assert.throws(() => assertDailyReleaseCapacity(publishedPost, "VIDEO", now), /one feed post/);
});

test("blocks the fourth release regardless of content type", () => {
  const now = new Date("2026-11-11T14:00:00.000Z");
  const campaigns = [
    { status: "published", facebook_type: "VIDEO", published_at: "2026-11-11T08:00:00.000Z" },
    { status: "published", facebook_type: "VIDEO", published_at: "2026-11-11T10:00:00.000Z" },
    { status: "published", facebook_type: "REEL", published_at: "2026-11-11T13:00:00.000Z" }
  ];
  assert.throws(() => assertDailyReleaseCapacity(campaigns, "VIDEO", now), /no more than three total releases/);
  assert.throws(() => assertDailyReleaseCapacity(campaigns, "REEL", now), /no more than three total releases/);
});

test("does not count a previous day's video toward today's feed-post allowance", () => {
  const campaigns = [
    { status: "published", facebook_type: "VIDEO", published_at: "2026-11-10T21:30:00.000Z" }
  ];
  assert.equal(assertDailyReleaseCapacity(campaigns, "VIDEO", new Date("2026-11-11T08:00:00.000Z")).feedPosts, 0);
});

test("rejects unsupported release types", () => {
  assert.throws(() => assertDailyReleaseCapacity([], "STORY"), /Only VIDEO, POST and REEL/);
});
