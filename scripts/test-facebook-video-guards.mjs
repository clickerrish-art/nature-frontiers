import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateLongFormVideoCampaign } from "./facebook-video-guards.mjs";
import { NATURE_FRONTIERS_YOUTUBE_URL, REQUIRED_PRODUCT_LINKS, APPROVED_AFFILIATE_LINKS, AFFILIATE_DISCLOSURE, buildLongFormVideoDescription } from "./video-description.mjs";

const valid = {
  id: "nf-video-001",
  network: "facebook",
  campaign_type: "organic",
  status: "approved",
  facebook_type: "VIDEO",
  title: "How Crocodiles Wait for the Perfect Moment",
  caption: buildLongFormVideoDescription({
    seriesTitle: "Wild Encounters: Crocodile Behaviour",
    episodeNumber: 1,
    episodeTitle: "The Patient Ambush",
    episodeDescription: "Original wildlife documentary narration and episode description.",
    nextEpisodeTeaser: "Next episode explores how a crocodile detects movement below the waterline."
  }),
  hook_0_3s: "It has barely moved. It has not stopped watching.",
  hook_duration_seconds: 30,
  series_id: "crocodile-behaviour",
  series_title: "Wild Encounters: Crocodile Behaviour",
  episode_number: 1,
  episode_title: "The Patient Ambush",
  series_arc: "A multi-episode exploration of crocodile senses, ambush behaviour, hunting ecology and conservation.",
  next_episode_teaser: "Next episode explores how a crocodile detects movement below the waterline.",
  product_links: REQUIRED_PRODUCT_LINKS.map((item) => item.url),
  affiliate_links: [...APPROVED_AFFILIATE_LINKS],
  affiliate_links_verified: true,
  affiliate_verification_note: "Owner-supplied approved Safari.com tracking URLs; exact a=GM26 parameters preserved.",
  affiliate_disclosure: AFFILIATE_DISCLOSURE,
  script_text: "It has barely moved. It has not stopped watching. " + Array(700).fill("wildlife").join(" "),
  duration_seconds: 360,
  media_url: "https://cdn.example.org/sha256/wildlife.mp4",
  media_sha256: "a".repeat(64),
  media_url_immutable_confirmed: true,
  script_originality_confirmed: true,
  voiceover_originality_confirmed: true,
  media_rights_confirmed: true,
  media_originality_confirmed: true,
  audio_rights_confirmed: true,
  policy_review_passed: true,
  content_accuracy_confirmed: true,
  wildlife_welfare_confirmed: true,
  non_graphic_review_passed: true,
  thumbnail_accuracy_confirmed: true,
  media_technical_review_passed: true,
  human_review_confirmed: true,
  synthetic_visuals: false,
  ai_generated_video: false,
  stock_footage_used: false,
  media_origin: "original_camera_recording",
  source_recording_id: "camera-original-001",
  original_camera_file_sha256: "b".repeat(64),
  original_recording_retained: true,
  provenance_review_passed: true,
  provenance_reviewer: "wildlife-editor",
  provenance_reviewed_at: "2026-11-11T10:00:00Z",
  fact_check_sources: ["https://example.org/crocodile-research"],
  retention_beats_seconds: [55, 115, 175, 235, 295],
  next_episode_cta: "Continue with episode two in the crocodile behaviour playlist.",
  editorial_ad_breaks_seconds: [180],
  editorial_ad_break_notes: ["After the first explanation of ambush posture, before the underwater sensory reveal."]
};



test("series plan contains six sequential 3–8 minute episodes with hook-first ad-break notes", async () => {
  const plan = JSON.parse(await readFile(new URL("../data/video-series.json", import.meta.url), "utf8"));
  assert.equal(plan.episodes.length, 6);
  for (const [index, episode] of plan.episodes.entries()) {
    assert.equal(episode.episode_number, index + 1);
    assert.ok(episode.target_duration_seconds >= 180 && episode.target_duration_seconds <= 480);
    assert.ok(episode.hook_duration_seconds >= 15 && episode.hook_duration_seconds <= 60);
    assert.ok(episode.editorial_ad_breaks_seconds[0] >= episode.hook_duration_seconds + 60);
    assert.equal(episode.editorial_ad_break_notes.length, episode.editorial_ad_breaks_seconds.length);
    assert.ok(episode.next_episode_teaser.trim());
  }
});
\ntest("builds a series description containing the channel, all catalogue products and every approved Safari tracking URL", () => {
  const description = valid.caption;
  assert.ok(description.includes(NATURE_FRONTIERS_YOUTUBE_URL));
  for (const item of REQUIRED_PRODUCT_LINKS) assert.ok(description.includes(item.url));
  for (const link of APPROVED_AFFILIATE_LINKS) assert.ok(description.includes(link));
  assert.ok(description.includes(AFFILIATE_DISCLOSURE));
  assert.match(description, /Episode 1: The Patient Ambush/);
  assert.throws(() => buildLongFormVideoDescription({ seriesTitle: "Series", episodeNumber: 0, episodeTitle: "Title", episodeDescription: "Body", nextEpisodeTeaser: "Next" }), /positive integer/);
});
\ntest("accepts an approved, reviewed 3–8 minute original landscape-video series episode manifest", () => {
  assert.deepEqual(validateLongFormVideoCampaign(valid), []);
});

for (const [field, value] of [
  ["status", "draft"],
  ["facebook_type", "REEL"],
  ["campaign_type", "promotion"],
  ["duration_seconds", 179],
  ["duration_seconds", 481],
  ["media_url", "http://cdn.example.org/video.mp4"],
  ["media_sha256", "missing"],
  ["media_url_immutable_confirmed", false],
  ["script_originality_confirmed", false],
  ["voiceover_originality_confirmed", false],
  ["media_rights_confirmed", false],
  ["media_originality_confirmed", false],
  ["audio_rights_confirmed", false],
  ["policy_review_passed", false],
  ["content_accuracy_confirmed", false],
  ["wildlife_welfare_confirmed", false],
  ["non_graphic_review_passed", false],
  ["thumbnail_accuracy_confirmed", false],
  ["media_technical_review_passed", false],
  ["human_review_confirmed", false],
  ["synthetic_visuals", "unknown"],
  ["ai_generated_video", true],
  ["stock_footage_used", true],
  ["media_origin", "stock_footage"],
  ["source_recording_id", ""],
  ["original_camera_file_sha256", "missing"],
  ["original_recording_retained", false],
  ["provenance_review_passed", false],
  ["provenance_reviewer", ""],
  ["provenance_reviewed_at", "not-a-date"]
]) {
  test(`fails closed when ${field} is invalid`, () => {
    assert.ok(validateLongFormVideoCampaign({ ...valid, [field]: value }).length > 0);
  });
}

test("rejects synthetic wildlife video even when fully disclosed", () => {
  const disclosure = "Visual disclosure: AI-generated illustrative scenes, not documentary footage.";
  const errors = validateLongFormVideoCampaign({
    ...valid,
    synthetic_visuals: true,
    ai_disclosure: disclosure,
    caption: valid.caption + " " + disclosure
  });
  assert.ok(errors.some((e) => e.includes("AI-generated or synthetic wildlife visuals are prohibited")));
});

test("requires at least 300 words of original narration, a hook-first script and evidence links", () => {
  assert.ok(validateLongFormVideoCampaign({ ...valid, script_text: "too short" }).some((e) => e.includes("300–1,500 words")));
  assert.ok(validateLongFormVideoCampaign({ ...valid, fact_check_sources: [] }).some((e) => e.includes("fact-check source")));
});

test("requires curiosity beats no more than 75 seconds apart and a next-episode CTA", () => {
  assert.ok(validateLongFormVideoCampaign({ ...valid, retention_beats_seconds: [55, 140, 250] }).some((e) => e.includes("curiosity beats")));
  assert.ok(validateLongFormVideoCampaign({ ...valid, next_episode_cta: "" }).some((e) => e.includes("next episode")));
});

test("requires one proposed break marker for 3–6:59 minute videos and two for 7–8 minute videos", () => {
  assert.deepEqual(validateLongFormVideoCampaign({ ...valid, duration_seconds: 420, retention_beats_seconds: [55, 115, 175, 235, 295, 355], editorial_ad_breaks_seconds: [180, 360], editorial_ad_break_notes: ["After story beat one.", "Before the final explanation."] }), []);
  assert.ok(validateLongFormVideoCampaign({ ...valid, editorial_ad_breaks_seconds: [180, 250], editorial_ad_break_notes: ["One.", "Two."] }).some((e) => e.includes("one for 5–6:59")));
  assert.ok(validateLongFormVideoCampaign({ ...valid, duration_seconds: 420, retention_beats_seconds: [55, 115, 175, 235, 295, 355], editorial_ad_breaks_seconds: [180], editorial_ad_break_notes: ["After the first story beat."] }).some((e) => e.includes("one for 5–6:59")));
});

test("rejects ad-break markers too close together or too close to the ending", () => {
  const sevenMinute = { ...valid, duration_seconds: 420, retention_beats_seconds: [55, 115, 175, 235, 295, 355], editorial_ad_breaks_seconds: [180, 250], editorial_ad_break_notes: ["One.", "Two."] };
  assert.ok(validateLongFormVideoCampaign(sevenMinute).some((e) => e.includes("120 seconds apart")));
  const nearEnd = { ...valid, editorial_ad_breaks_seconds: [320] };
  assert.ok(validateLongFormVideoCampaign(nearEnd).some((e) => e.includes("editorial ad-break markers")));
});


test("accepts a three-minute episode and keeps the opening hook before the first ad break", () => {
  const threeMinute = {
    ...valid,
    duration_seconds: 180,
    retention_beats_seconds: [55, 115, 155],
    editorial_ad_breaks_seconds: [120],
    editorial_ad_break_notes: ["After the opening hook and the first natural story transition."]
  };
  assert.deepEqual(validateLongFormVideoCampaign(threeMinute), []);
  assert.ok(validateLongFormVideoCampaign({ ...threeMinute, editorial_ad_breaks_seconds: [60] }).some((e) => e.includes("after the opening hook")));
});

test("requires the series identity, channel destination, product link, affiliate URL and disclosure in every description", () => {
  assert.ok(validateLongFormVideoCampaign({ ...valid, series_id: "" }).some((e) => e.includes("named series")));
  assert.ok(validateLongFormVideoCampaign({ ...valid, caption: valid.caption.replace(NATURE_FRONTIERS_YOUTUBE_URL, "") }).some((e) => e.includes("YouTube channel link")));
  assert.ok(validateLongFormVideoCampaign({ ...valid, product_links: [] }).some((e) => e.includes("all six owner-catalogued Selar product URLs")));
  assert.ok(validateLongFormVideoCampaign({ ...valid, affiliate_links: [] }).some((e) => e.includes("all five owner-approved Safari.com affiliate URLs")));
  assert.ok(validateLongFormVideoCampaign({ ...valid, affiliate_links_verified: false }).some((e) => e.includes("human-verified")));
  assert.ok(validateLongFormVideoCampaign({ ...valid, caption: valid.caption.replace(APPROVED_AFFILIATE_LINKS[0], "") }).some((e) => e.includes("all five owner-approved Safari.com affiliate URLs")));
  assert.ok(validateLongFormVideoCampaign({ ...valid, affiliate_disclosure: "" }).some((e) => e.includes("standard explicit affiliate disclosure")));
});

test("requires the opening narration to start with the documented hook", () => {
  assert.ok(validateLongFormVideoCampaign({ ...valid, script_text: "Welcome back. " + valid.script_text }).some((e) => e.includes("begin with the approved first-three-second hook")));
});

test("converts editorial mid-roll timestamps to Meta Page Videos ad_breaks milliseconds", async () => {
  const { toMetaAdBreakOffsetsMilliseconds } = await import("./facebook-video-guards.mjs");
  assert.deepEqual(toMetaAdBreakOffsetsMilliseconds(valid), [180000]);
  const long = {
    ...valid,
    duration_seconds: 480,
    editorial_ad_breaks_seconds: [180, 360],
    editorial_ad_break_notes: ["First natural transition.", "Second natural transition."]
  };
  assert.deepEqual(toMetaAdBreakOffsetsMilliseconds(long), [180000, 360000]);
});
