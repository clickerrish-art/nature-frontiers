import test from "node:test";
import assert from "node:assert/strict";
import {
  assertEpisodePlanValid,
  buildYouTubeDescription,
  getRequiredDescriptionLinks,
  validateEpisodePlan,
  validateYouTubeDescription
} from "./youtube-content.mjs";

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
  for (const product of links.products) assert.ok(description.includes(product.url), product.id);
  for (const affiliate of links.affiliates) assert.ok(description.includes(affiliate.url), affiliate.label);
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
    adBreaks: [{ atSeconds: 300, naturalBreakpoint: true }]
  };
  assert.deepEqual(validateEpisodePlan(plan), []);
  assert.ok(validateEpisodePlan({ ...plan, adBreaks: [{ atSeconds: 30, naturalBreakpoint: true }] }).some((error) => error.includes("after the opening hook")));
  assert.ok(validateEpisodePlan({ ...plan, adBreaks: [{ atSeconds: 300, naturalBreakpoint: false }] }).some((error) => error.includes("natural narrative breakpoint")));
  assert.ok(validateEpisodePlan({ ...plan, adBreaks: [{ atSeconds: 240, naturalBreakpoint: true }] }).some((error) => error.includes("between story segments")));
});

test("approval is blocked unless original footage, rights and factual review are verified", () => {
  const plan = { ...validPlan, status: "approved" };
  const errors = validateEpisodePlan(plan);
  assert.ok(errors.some((error) => error.includes("original camera footage")));
  assert.ok(errors.some((error) => error.includes("rights are verified")));
  assert.ok(errors.some((error) => error.includes("factual claims")));
});
