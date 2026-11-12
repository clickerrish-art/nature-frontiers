import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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
const episodeOne = JSON.parse(await readFile(new URL("../content/youtube/wild-encounters-s01e01-description.json", import.meta.url), "utf8"));

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

test("YouTube publishing stays disabled until OAuth identity and upload adapter are verified", () => {
  assert.equal(policy.youtubePublishing.enabled, false);
  assert.equal(policy.youtubePublishing.publicHandleResolved, true);
  assert.equal(policy.youtubePublishing.metricoolChannelMismatchConfirmed, true);
  assert.equal(policy.youtubePublishing.authenticatedChannelIdentityVerified, false);
  assert.equal(policy.youtubePublishing.ownerAccessChannelListingVerified, true);
  assert.equal(policy.youtubePublishing.youtubeOAuthIdentityVerified, false);
  assert.equal(policy.youtubePublishing.uploadAdapterImplemented, false);
  assert.equal(policy.youtubePublishing.verifiedChannelId, "UC41xXhw22o6Q2I2pTKB2kOg");
  assert.equal(policy.youtubePublishing.verifiedChannelHandle, "@naturefrontiers-life");
  assert.ok(policy.youtubePublishing.identityVerificationSource.includes("vidIQ"));
  assert.ok(policy.youtubePublishing.requiredCheck.includes("UC41xXhw22o6Q2I2pTKB2kOg"));
  assert.ok(policy.youtubePublishing.requiredCheck.includes("SonicVibes"));
  assert.equal(policy.youtubePublishing.nativePaidPromotionDeclarationRequiredWhenApplicable, true);
  assert.ok(policy.description.nativePaidPromotionSetting.includes("native setting"));
});

test("Wild Encounters Season 1 is a complete, sequential concept slate and remains unapproved", () => {
  assert.deepEqual(validateSeasonPlan(season), []);
  assert.equal(season.status, "concept_only");
  assert.ok(season.episodes.every((episode) => episode.status === "concept_only"));
  assert.equal(new Set(season.episodes.map((episode) => episode.episodeNumber)).size, season.episodes.length);
});

test("description builder embeds the Nature Frontiers channel, every catalogue product and every Safari affiliate link", () => {
  const description = buildYouTubeDescription(episodeOne);
  const links = getRequiredDescriptionLinks();
  assert.ok(description.includes(links.channel));
  assert.ok(description.includes("subscribe for the next episode"));
  for (const product of links.products) assert.ok(description.includes(product.url), product.id);
  for (const affiliate of links.affiliates) assert.ok(description.includes(affiliate.url), affiliate.label);
  assert.ok(description.indexOf("Affiliate disclosure:") < description.indexOf(links.affiliates[0].url));
  assert.throws(() => buildYouTubeDescription({ ...episodeOne, title: "x".repeat(101) }), /100 characters/);
  assert.throws(() => buildYouTubeDescription({ ...episodeOne, nextEpisodeUrl: "https://youtube.com.evil.example/watch?v=bad" }), /published HTTPS YouTube episode URL/);
  assert.throws(() => buildYouTubeDescription({ ...episodeOne, previousEpisodeUrl: "http://youtu.be/example" }), /published HTTPS YouTube episode URL/);
  assert.ok(description.indexOf("Product links below lead to paid digital resources.") < description.indexOf(links.products[0].url));
  assert.deepEqual(validateYouTubeDescription(description), []);
});

test("description CLI emits a complete validated description from the sample episode input", () => {
  const scriptPath = fileURLToPath(new URL("./build-youtube-description.mjs", import.meta.url));
  const inputPath = fileURLToPath(new URL("../content/youtube/wild-encounters-s01e01-description.json", import.meta.url));
  const output = execFileSync(process.execPath, [scriptPath, inputPath], { encoding: "utf8" }).trim();
  assert.deepEqual(validateYouTubeDescription(output), []);
  assert.ok(output.includes("The Signals Animals Give Before They Move"));
});

test("description validator rejects descriptions above YouTube’s 5,000-character limit", () => {
  const errors = validateYouTubeDescription("x".repeat(5001));
  assert.ok(errors.some((error) => error.includes("5,000 characters")));
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

test("episode timelines reject gaps and incomplete coverage", () => {
  const gap = { ...validPlan, segments: [validPlan.segments[0], { ...validPlan.segments[1], startSeconds: 20 }, ...validPlan.segments.slice(2)] };
  assert.ok(validateEpisodePlan(gap).some((error) => error.includes("without gaps")));
  const incomplete = { ...validPlan, segments: validPlan.segments.slice(0, -1) };
  assert.ok(validateEpisodePlan(incomplete).some((error) => error.includes("full episode duration")));
});

test("mid-rolls are rejected below eight minutes", () => {
  const plan = { ...validPlan, durationSeconds: 420, adBreaks: [{ atSeconds: 180, naturalBreakpoint: true }] };
  assert.ok(validateEpisodePlan(plan).some((error) => error.includes("not eligible below 8 minutes")));
});

test("eight-minute mid-rolls must follow the hook and use natural breakpoints", () => {
  const plan = {
    ...validPlan,
    durationSeconds: 480,
    monetizationEligibilityVerified: true,
    monetizationEligibilityChannelId: policy.youtubePublishing.verifiedChannelId,
    monetizationEligibilityVerifiedBy: "test fixture",
    monetizationEligibilityEvidence: "channel monetization dashboard evidence ref",
    monetizationEligibilityVerifiedAt: "2026-11-11T00:00:00.000Z",
    segments: [
      { type: "hook", startSeconds: 0, endSeconds: 15 },
      { type: "story_setup", startSeconds: 15, endSeconds: 60 },
      { type: "main_story", startSeconds: 60, endSeconds: 350 },
      { type: "takeaway", startSeconds: 350, endSeconds: 390 },
      { type: "next_episode_tease", startSeconds: 390, endSeconds: 440 },
      { type: "cta", startSeconds: 440, endSeconds: 480 }
    ],
    adBreaks: [{ atSeconds: 350, naturalBreakpoint: true, protectedContentClear: true, reviewedBy: "test fixture", reviewedAt: "2026-11-11T00:00:00.000Z", breakpointNote: "Transition after a completed story chapter." }]
  };
  assert.deepEqual(validateEpisodePlan(plan), []);
  assert.ok(validateEpisodePlan({ ...plan, monetizationEligibilityVerified: false }).some((error) => error.includes("monetization eligibility")));
  assert.ok(validateEpisodePlan({ ...plan, monetizationEligibilityChannelId: "UCSlkuPfHH78oGC1o418HV4w" }).some((error) => error.includes("verified Nature Frontiers channel")));
  assert.ok(validateEpisodePlan({ ...plan, monetizationEligibilityVerifiedBy: "" }).some((error) => error.includes("reviewer and verification timestamp")));
  assert.ok(validateEpisodePlan({ ...plan, monetizationEligibilityEvidence: "" }).some((error) => error.includes("reviewer and verification timestamp")));
  assert.ok(validateEpisodePlan({ ...plan, adBreaks: [{ atSeconds: 30, naturalBreakpoint: true }] }).some((error) => error.includes("after the opening hook")));
  assert.ok(validateEpisodePlan({ ...plan, adBreaks: [{ atSeconds: 350, naturalBreakpoint: false, protectedContentClear: true, reviewedBy: "test fixture", reviewedAt: "2026-11-11T00:00:00.000Z", breakpointNote: "Transition after a completed story chapter." }] }).some((error) => error.includes("natural narrative boundary")));
  assert.ok(validateEpisodePlan({ ...plan, adBreaks: [{ atSeconds: 350, naturalBreakpoint: true, protectedContentClear: false, reviewedBy: "test fixture", reviewedAt: "2026-11-11T00:00:00.000Z", breakpointNote: "Transition after a completed story chapter." }] }).some((error) => error.includes("protected animal behaviour")));
  assert.ok(validateEpisodePlan({ ...plan, adBreaks: [{ atSeconds: 350, naturalBreakpoint: true }] }).some((error) => error.includes("reviewer, review timestamp")));
  assert.ok(validateEpisodePlan({ ...plan, adBreaks: [{ atSeconds: 300, naturalBreakpoint: true, reviewedBy: "test fixture", reviewedAt: "2026-11-11T00:00:00.000Z", breakpointNote: "Incorrect in-segment placement." }] }).some((error) => error.includes("natural narrative boundary")));
  assert.ok(validateEpisodePlan({ ...plan, adBreaks: [{ atSeconds: 350, naturalBreakpoint: true, reviewedBy: "test fixture", reviewedAt: "2026-11-11T00:00:00.000Z", breakpointNote: "Do not interrupt this." , interrupts: "an active animal behaviour and critical reveal" }] }).some((error) => error.includes("active animal behaviour")));
});

test("malformed segment containers fail closed without crashing the validator", () => {
  const errors = validateEpisodePlan({ ...validPlan, segments: { type: "hook" } });
  assert.ok(errors.some((error) => error.includes("segments must be an array")));
});

test("approved episodes require a recorded final human editorial and metadata review", () => {
  const approved = {
    ...validPlan,
    status: "approved",
    originalFootageVerified: true,
    rightsVerified: true,
    factCheckPassed: true,
    factCheckSources: ["https://example.org/species-research"],
    originalFootageEvidence: "Drive source asset ID",
    originalFootageSha256: "a".repeat(64),
    rightsVerified: true,
    rightsEvidence: "signed licence record",
    humanReviewPassed: true,
    humanReviewer: "Editorial reviewer",
    humanReviewedAt: "2026-11-11T00:00:00.000Z",
    reviewedVideoSha256: "b".repeat(64),
    reviewedMetadataSha256: "c".repeat(64)
  };
  assert.deepEqual(validateEpisodePlan(approved), []);
  assert.ok(validateEpisodePlan({ ...approved, humanReviewPassed: false }).some((error) => error.includes("human review")));
  assert.ok(validateEpisodePlan({ ...approved, humanReviewer: "" }).some((error) => error.includes("named human reviewer")));
  assert.ok(validateEpisodePlan({ ...approved, reviewedVideoSha256: "invalid" }).some((error) => error.includes("named human reviewer")));
  assert.ok(validateEpisodePlan({ ...approved, rightsEvidence: "" }).some((error) => error.includes("rights have a recorded")));
  assert.ok(validateEpisodePlan({ ...approved, factCheckSources: [] }).some((error) => error.includes("source references")));
});

test("season and episode statuses reject unsupported publication states", () => {
  assert.ok(validateSeasonPlan({ ...season, status: "published" }).some((error) => error.includes("Season status")));
  assert.ok(validateSeasonPlan({ ...season, status: "approved" }).some((error) => error.includes("every episode has passed")));
  const invalidEpisode = { ...season, episodes: season.episodes.map((episode, index) => index === 0 ? { ...episode, status: "published" } : episode) };
  assert.ok(validateSeasonPlan(invalidEpisode).some((error) => error.includes("invalid status")));
});

test("episode publication states are rejected by the content-plan validator", () => {
  assert.ok(validateEpisodePlan({ ...validPlan, status: "published" }).some((error) => error.includes("publication is tracked separately")));
});

test("approval is blocked unless original footage, rights and factual review are verified", () => {
  const plan = { ...validPlan, status: "approved" };
  const errors = validateEpisodePlan(plan);
  assert.ok(errors.some((error) => error.includes("original camera footage")));
  assert.ok(errors.some((error) => error.includes("rights have a recorded")));
  assert.ok(errors.some((error) => error.includes("factual claims")));
  assert.ok(errors.some((error) => error.includes("human review")));
});

const youtubeWorkflow = await readFile(new URL("../.github/workflows/validate-youtube-content.yml", import.meta.url), "utf8");

test("YouTube content validation runs on protected production main", () => {
  assert.match(youtubeWorkflow, /push:\s+branches:\s+- "codex\/nature-frontiers-youtube-series"\s+- "main"/);
});
