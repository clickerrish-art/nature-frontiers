import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertEpisodePlanValid,
  buildYouTubeDescription,
  getRequiredDescriptionLinks,
  validateEpisodePlan,
  validateSeasonPlan,
  validateYouTubeDescription
} from "./youtube-content.mjs";

const season = JSON.parse(await readFile(new URL("../data/youtube-series-season-1.json", import.meta.url), "utf8"));
const policy = JSON.parse(await readFile(new URL("../data/youtube-content-policy.json", import.meta.url), "utf8"));

const validPlan = {
  seriesId: "wild-encounters",
  seasonNumber: 1,
  episodeNumber: 1,
  title: "The Signals Animals Give Before They Move",
  durationSeconds: 420,
  status: "draft",
  segments: [
    { type: "hook", startSeconds: 0, endSeconds: 15 },
    { type: "story_setup", startSeconds: 15, endSeconds: 60 },
    { type: "main_story", startSeconds: 60, endSeconds: 300 },
    { type: "takeaway", startSeconds: 300, endSeconds: 345 },
    { type: "next_episode_tease", startSeconds: 345, endSeconds: 390 },
    { type: "cta", startSeconds: 390, endSeconds: 420 }
  ],
  adBreaks: []
};

test("YouTube publishing remains disabled until authenticated channel identity is verified", () => {
  assert.equal(policy.youtubePublishing.enabled, false);
  assert.equal(policy.youtubePublishing.authenticatedChannelIdentityVerified, false);
  assert.ok(policy.youtubePublishing.requiredCheck.includes("authenticated YouTube channel ID"));
});

test("Wild Encounters Season 1 is a complete, sequential concept slate and remains unapproved", () => {
  assert.deepEqual(validateSeasonPlan(season), []);
  assert.equal(season.status, "concept_only");
  assert.ok(season.episodes.every((episode) => episode.status === "concept_only"));
  assert.equal(new Set(season.episodes.map((episode) => episode.episodeNumber)).size, season.episodes.length);
});

test("description builder embeds the Nature Frontiers channel, every catalogue product and every Safari affiliate link", () => {
  const description = buildYouTubeDescription({
    seriesId: "wild-encounters",
    seasonNumber: 1,
    episodeNumber: 1,
    title: "The Signals Animals Give Before They Move",
    synopsis: "A research-led look at observable animal behaviour, told through genuine field recordings.",
    nextEpisodeTease: "Next episode: why predators sometimes wait before moving."
  });
  const links = getRequiredDescriptionLinks();
  assert.ok(description.includes(links.channel));
  assert.ok(description.includes("subscribe for the next episode"));
  for (const product of links.products) assert.ok(description.includes(product.url), product.id);
  for (const affiliate of links.affiliates) assert.ok(description.includes(affiliate.url), affiliate.label);
  assert.ok(description.indexOf("Affiliate disclosure:") < description.indexOf(links.affiliates[0].url));
  assert.ok(description.indexOf("Product links below lead to paid digital resources.") < description.indexOf(links.products[0].url));
  assert.deepEqual(validateYouTubeDescription(description), []);
});

test("description validator rejects missing channel, product, affiliate and disclosure content", () => {
  const errors = validateYouTubeDescription("A short description with no required links.");
  assert.ok(errors.some((error) => error.includes("channel link")));
  assert.ok(errors.some((error) => error.includes("catalogue product link")));
  assert.ok(errors.some((error) => error.includes("Safari.com affiliate link")));
  assert.ok(errors.some((error) => error.includes("affiliate disclosure")));
});

test("episode plan requires a 3–8 minute runtime and a hook as the first segment", () => {
  assertEpisodePlanValid(validPlan);
  assert.ok(validateEpisodePlan({ ...validPlan, durationSeconds: 179 }).some((error) => error.includes("between 180 and 480")));
  assert.ok(validateEpisodePlan({ ...validPlan, durationSeconds: 481 }).some((error) => error.includes("between 180 and 480")));
  const outOfOrder = { ...validPlan, segments: [validPlan.segments[0], validPlan.segments[2], validPlan.segments[1], ...validPlan.segments.slice(3)] };
  assert.ok(validateEpisodePlan(outOfOrder).some((error) => error.includes("configured order")));
  const hookMissing = { ...validPlan, segments: [{ ...validPlan.segments[0], type: "intro" }, ...validPlan.segments.slice(1)] };
  assert.ok(validateEpisodePlan(hookMissing).some((error) => error.includes("hook must be the first segment")));
});

test("mid-rolls are rejected below eight minutes", () => {
  const plan = { ...validPlan, durationSeconds: 420, adBreaks: [{ atSeconds: 180, naturalBreakpoint: true }] };
  assert.ok(validateEpisodePlan(plan).some((error) => error.includes("not eligible below 8 minutes")));
});

test("eight-minute mid-rolls must follow the hook and use natural breakpoints", () => {
  const plan = {
    ...validPlan,
    durationSeconds: 480,
    segments: [
      { type: "hook", startSeconds: 0, endSeconds: 15 },
      { type: "story_setup", startSeconds: 15, endSeconds: 60 },
      { type: "main_story", startSeconds: 60, endSeconds: 350 },
      { type: "takeaway", startSeconds: 350, endSeconds: 390 },
      { type: "next_episode_tease", startSeconds: 390, endSeconds: 440 },
      { type: "cta", startSeconds: 440, endSeconds: 480 }
    ],
    adBreaks: [{ atSeconds: 350, naturalBreakpoint: true, reviewedBy: "test fixture", reviewedAt: "2026-11-11T00:00:00.000Z", breakpointNote: "Transition after a completed story chapter." }]
  };
  assert.deepEqual(validateEpisodePlan(plan), []);
  assert.ok(validateEpisodePlan({ ...plan, adBreaks: [{ atSeconds: 30, naturalBreakpoint: true }] }).some((error) => error.includes("after the opening hook")));
  assert.ok(validateEpisodePlan({ ...plan, adBreaks: [{ atSeconds: 350, naturalBreakpoint: false, reviewedBy: "test fixture", reviewedAt: "2026-11-11T00:00:00.000Z", breakpointNote: "Transition after a completed story chapter." }] }).some((error) => error.includes("natural narrative breakpoint")));
  assert.ok(validateEpisodePlan({ ...plan, adBreaks: [{ atSeconds: 350, naturalBreakpoint: true }] }).some((error) => error.includes("reviewer, review timestamp")));
  assert.ok(validateEpisodePlan({ ...plan, adBreaks: [{ atSeconds: 300, naturalBreakpoint: true, reviewedBy: "test fixture", reviewedAt: "2026-11-11T00:00:00.000Z", breakpointNote: "Incorrect in-segment placement." }] }).some((error) => error.includes("between story segments")));
});

test("malformed segment containers fail closed without crashing the validator", () => {
  const errors = validateEpisodePlan({ ...validPlan, segments: { type: "hook" } });
  assert.ok(errors.some((error) => error.includes("segments must be an array")));
});

test("approval is blocked unless original footage, rights and factual review are verified", () => {
  const plan = { ...validPlan, status: "approved" };
  const errors = validateEpisodePlan(plan);
  assert.ok(errors.some((error) => error.includes("original camera footage")));
  assert.ok(errors.some((error) => error.includes("rights are verified")));
  assert.ok(errors.some((error) => error.includes("factual claims")));
});
