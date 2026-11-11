import test from "node:test";
import assert from "node:assert/strict";
import { assertDailyReleaseCapacity, getJohannesburgDailyReleaseCounts, johannesburgDateKey } from "./publishing-cadence.mjs";

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
    date: "2026-11-11", longForm: 1, reels: 1, total: 2
  });
});

test("allows up to two long-form videos, one Reel and three total releases per Johannesburg day", () => {
  const now = new Date("2026-11-11T14:00:00.000Z");
  const current = [
    { status: "published", facebook_type: "VIDEO", published_at: "2026-11-11T08:00:00.000Z" },
    { status: "published", facebook_type: "VIDEO", published_at: "2026-11-11T12:00:00.000Z" }
  ];
  assert.throws(() => assertDailyReleaseCapacity(current, "VIDEO", now), /no more than two/);
  assert.equal(assertDailyReleaseCapacity(current, "REEL", now).longForm, 2);

  const withReel = [...current, { status: "published", facebook_type: "REEL", published_at: "2026-11-11T13:00:00.000Z" }];
  assert.throws(() => assertDailyReleaseCapacity(withReel, "REEL", now), /no more than three total releases/);
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

test("does not count a previous day's video toward today's allowance", () => {
  const campaigns = [
    { status: "published", facebook_type: "VIDEO", published_at: "2026-11-10T22:30:00.000Z" }
  ];
  assert.equal(assertDailyReleaseCapacity(campaigns, "VIDEO", new Date("2026-11-11T08:00:00.000Z")).longForm, 0);
});

test("rejects non-video release types", () => {
  assert.throws(() => assertDailyReleaseCapacity([], "POST"), /Only VIDEO and REEL/);
});
