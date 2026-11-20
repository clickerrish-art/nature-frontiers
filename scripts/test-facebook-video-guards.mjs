import test from "node:test";
import assert from "node:assert/strict";
import { validateLongFormVideoCampaign, toMetaAdBreakOffsetsMilliseconds } from "./facebook-video-guards.mjs";

const hook = "It has barely moved. It has not stopped watching.";
const valid = {
  id: "nf-video-001",
  network: "facebook",
  campaign_type: "organic",
  status: "approved",
  facebook_type: "VIDEO",
  title: "How Crocodiles Wait for the Perfect Moment",
  caption: "A responsible wildlife explainer. No animal was disturbed during filming.",
  hook_0_3s: hook,
  hook_duration_seconds: 30,
  script_text: hook + " " + Array(700).fill("wildlife").join(" "),
  duration_seconds: 360,
  media_url: "https://cdn.example.org/sha256/wildlife.mp4",
  media_sha256: "a".repeat(64),
  media_url_immutable_confirmed: true,
  script_originality_confirmed: true,
  voiceover_originality_confirmed: true,
  media_rights_confirmed: true,
  media_integrity_review_passed: true,
  policy_review_passed: true,
  content_accuracy_confirmed: true,
  wildlife_welfare_confirmed: true,
  non_graphic_review_passed: true,
  thumbnail_accuracy_confirmed: true,
  media_technical_review_passed: true,
  watermark_scan_passed: true,
  audio_present: false,
  human_review_confirmed: true,
  media_accessibility_confirmed: true,
  synthetic_visuals: false,
  ai_generated_video: false,
  stock_footage_used: false,
  media_origin: "original_camera_recording",
  media_originality_confirmed: true,
  source_recording_id: "camera-original-001",
  original_camera_file_sha256: "b".repeat(64),
  original_recording_retained: true,
  provenance_review_passed: true,
  provenance_reviewer: "wildlife-editor",
  provenance_reviewed_at: "2026-11-20T10:00:00Z",
  fact_check_sources: ["https://example.org/crocodile-research"],
  retention_beats_seconds: [55, 115, 175, 235, 295],
  monetization_enabled: false
};

test("accepts a standalone editorial long-form wildlife video without YouTube or unrelated commercial links", () => {
  assert.deepEqual(validateLongFormVideoCampaign(valid), []);
  assert.deepEqual(toMetaAdBreakOffsetsMilliseconds(valid), []);
});

test("accepts licensed stock with source, licence, provenance, attribution and on-screen disclosure", () => {
  const stock = {
    ...valid,
    caption: valid.caption + " Footage: Creator via Pexels. Licensed stock footage — illustrative, not a Nature Frontiers field recording.",
    media_origin: "licensed_stock",
    wildlife_media_policy: "licensed_stock_allowed",
    stock_footage_used: true,
    source_url: "https://www.pexels.com/video/example/",
    source_creator: "Creator",
    license_name: "Pexels License",
    license_evidence_url: "https://www.pexels.com/license/",
    provenance_review_passed: true,
    provenance_reviewer: "rights-editor",
    provenance_reviewed_at: "2026-11-20T10:00:00Z",
    on_screen_disclosure_confirmed: true,
    on_screen_disclosure_text: "Licensed stock footage — illustrative, not a Nature Frontiers field recording.",
    caption_attribution: "Footage: Creator via Pexels.",
    media_originality_confirmed: undefined,
    source_recording_id: undefined,
    original_camera_file_sha256: undefined,
    original_recording_retained: undefined
  };
  assert.deepEqual(validateLongFormVideoCampaign(stock), []);
  assert.ok(validateLongFormVideoCampaign({ ...stock, on_screen_disclosure_confirmed: false }).some((e) => e.includes("on-screen disclosure")));
  assert.ok(validateLongFormVideoCampaign({ ...stock, caption: valid.caption }).some((e) => e.includes("exact creator/source attribution")));
  assert.ok(validateLongFormVideoCampaign({ ...stock, wildlife_media_policy: "original_camera_only" }).some((e) => e.includes("owner-approved licensed_stock_allowed")));
  assert.ok(validateLongFormVideoCampaign({ ...stock, license_evidence_url: "javascript:alert(1)" }).some((e) => e.includes("licence evidence URL")));
});

test("requires verification and matching disclosures only when product or affiliate links are supplied", () => {
  const productLink = "https://selar.com/example";
  const productDisclosure = "Disclosure: This is a promotional post for a paid digital product.";
  const affiliateLink = "https://www.safari.com/reserve?a=GM26";
  const affiliateDisclosure = "Disclosure: Nature Frontiers may earn a commission from this affiliate link.";
  const linked = {
    ...valid,
    caption: valid.caption + " " + productLink + " " + productDisclosure + " " + affiliateLink + " " + affiliateDisclosure,
    product_links: [productLink],
    product_links_verified: true,
    product_verification_note: "Owner-verified checkout URL.",
    product_disclosure: productDisclosure,
    affiliate_links: [affiliateLink],
    affiliate_links_verified: true,
    affiliate_verification_note: "Owner-approved tracking URL.",
    affiliate_disclosure: affiliateDisclosure
  };
  assert.deepEqual(validateLongFormVideoCampaign(linked), []);
  assert.ok(validateLongFormVideoCampaign({ ...linked, product_links_verified: false }).some((e) => e.includes("product links must be human-verified")));
  assert.ok(validateLongFormVideoCampaign({ ...linked, affiliate_disclosure: "" }).some((e) => e.includes("affiliate disclosure")));
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
  ["media_integrity_review_passed", false],
  ["policy_review_passed", false],
  ["content_accuracy_confirmed", false],
  ["wildlife_welfare_confirmed", false],
  ["non_graphic_review_passed", false],
  ["thumbnail_accuracy_confirmed", false],
  ["media_technical_review_passed", false],
  ["watermark_scan_passed", false],
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
  test("fails closed when " + field + " is invalid", () => {
    assert.ok(validateLongFormVideoCampaign({ ...valid, [field]: value }).length > 0);
  });
}

test("requires explicit licensed audio evidence when an audio track is present", () => {
  assert.ok(validateLongFormVideoCampaign({ ...valid, audio_present: true }).some((e) => e.includes("audio requires verified commercial rights")));
  assert.deepEqual(validateLongFormVideoCampaign({ ...valid, audio_present: false }), []);
});

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
  assert.ok(validateLongFormVideoCampaign({ ...valid, script_text: "Welcome back. " + valid.script_text }).some((e) => e.includes("begin with the approved first-three-second hook")));
});

test("requires curiosity beats no more than 75 seconds apart", () => {
  assert.ok(validateLongFormVideoCampaign({ ...valid, retention_beats_seconds: [55, 140, 250] }).some((e) => e.includes("curiosity beats")));
});

test("requires series metadata and a next-episode CTA only when a video is explicitly series-linked", () => {
  assert.deepEqual(validateLongFormVideoCampaign(valid), []);
  const series = {
    ...valid,
    series_requires_parent: true,
    series_id: "crocodile-behaviour",
    series_title: "Wild Encounters: Crocodile Behaviour",
    series_arc: "Explore crocodile senses, ambush behaviour and conservation.",
    episode_number: 1,
    episode_title: "The Patient Ambush",
    next_episode_teaser: "Next episode explores crocodile sensory organs.",
    next_episode_cta: "Continue with episode two."
  };
  assert.deepEqual(validateLongFormVideoCampaign(series), []);
  assert.ok(validateLongFormVideoCampaign({ ...series, series_id: "" }).some((e) => e.includes("series-linked long-form videos")));
});

test("requires ad-break markers only when monetization is explicitly enabled", () => {
  assert.deepEqual(validateLongFormVideoCampaign(valid), []);
  const monetized = {
    ...valid,
    monetization_enabled: true,
    editorial_ad_breaks_seconds: [180],
    editorial_ad_break_notes: ["After the opening hook and first natural transition."]
  };
  assert.deepEqual(validateLongFormVideoCampaign(monetized), []);
  assert.deepEqual(toMetaAdBreakOffsetsMilliseconds(monetized), [180000]);
  assert.ok(validateLongFormVideoCampaign({ ...monetized, editorial_ad_breaks_seconds: [60] }).some((e) => e.includes("after the opening hook")));
  assert.ok(validateLongFormVideoCampaign({ ...valid, editorial_ad_breaks_seconds: [180] }).some((e) => e.includes("unless monetization_enabled")));
});

test("requires two valid ad-break markers for monetized seven-minute videos", () => {
  const long = {
    ...valid,
    duration_seconds: 420,
    retention_beats_seconds: [55, 115, 175, 235, 295, 355],
    monetization_enabled: true,
    editorial_ad_breaks_seconds: [180, 360],
    editorial_ad_break_notes: ["After story beat one.", "Before the final explanation."]
  };
  assert.deepEqual(validateLongFormVideoCampaign(long), []);
  assert.deepEqual(toMetaAdBreakOffsetsMilliseconds(long), [180000, 360000]);
  assert.ok(validateLongFormVideoCampaign({ ...long, editorial_ad_breaks_seconds: [180] }).some((e) => e.includes("monetized long-form")));
});

test("fails closed without throwing when the video description is missing", () => {
  const errors = validateLongFormVideoCampaign({ ...valid, caption: undefined });
  assert.ok(errors.some((e) => e.includes("caption")));
});
