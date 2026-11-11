import test from "node:test";
import assert from "node:assert/strict";
import { validateLongFormVideoCampaign } from "./facebook-video-guards.mjs";

const valid = {
  id: "nf-video-001",
  network: "facebook",
  campaign_type: "organic",
  status: "approved",
  facebook_type: "VIDEO",
  title: "How Crocodiles Wait for the Perfect Moment",
  caption: "Original wildlife documentary narration and episode description.",
  hook_0_3s: "It has barely moved. It has not stopped watching.",
  script_text: Array(700).fill("wildlife").join(" "),
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
  fact_check_sources: ["https://example.org/crocodile-research"],
  retention_beats_seconds: [55, 115, 175, 235, 295],
  next_episode_cta: "Continue with episode two in the crocodile behaviour playlist.",
  editorial_ad_breaks_seconds: [180],
  editorial_ad_break_notes: ["After the first explanation of ambush posture, before the underwater sensory reveal."]
};

test("accepts an approved, reviewed 5–8 minute original landscape-video campaign manifest", () => {
  assert.deepEqual(validateLongFormVideoCampaign(valid), []);
});

for (const [field, value] of [
  ["status", "draft"],
  ["facebook_type", "REEL"],
  ["campaign_type", "promotion"],
  ["duration_seconds", 299],
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
  ["synthetic_visuals", "unknown"]
]) {
  test(`fails closed when ${field} is invalid`, () => {
    assert.ok(validateLongFormVideoCampaign({ ...valid, [field]: value }).length > 0);
  });
}

test("requires an exact AI disclosure for synthetic visuals", () => {
  const disclosure = "Visual disclosure: AI-generated illustrative scenes, not documentary footage.";
  assert.ok(validateLongFormVideoCampaign({ ...valid, synthetic_visuals: true }).some((e) => e.includes("AI/illustrative disclosure")));
  assert.ok(validateLongFormVideoCampaign({ ...valid, synthetic_visuals: true, ai_disclosure: disclosure }).some((e) => e.includes("caption")));
  assert.deepEqual(validateLongFormVideoCampaign({
    ...valid,
    synthetic_visuals: true,
    ai_disclosure: disclosure,
    caption: valid.caption + " " + disclosure
  }), []);
});

test("requires at least 500 words of original narration and evidence links", () => {
  assert.ok(validateLongFormVideoCampaign({ ...valid, script_text: "too short" }).some((e) => e.includes("500–1,500 words")));
  assert.ok(validateLongFormVideoCampaign({ ...valid, fact_check_sources: [] }).some((e) => e.includes("fact-check source")));
});

test("requires curiosity beats no more than 75 seconds apart and a next-episode CTA", () => {
  assert.ok(validateLongFormVideoCampaign({ ...valid, retention_beats_seconds: [55, 140, 250] }).some((e) => e.includes("curiosity beats")));
  assert.ok(validateLongFormVideoCampaign({ ...valid, next_episode_cta: "" }).some((e) => e.includes("next episode")));
});

test("requires one proposed break marker for 5–6:59 minute videos and two for 7–8 minute videos", () => {
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
