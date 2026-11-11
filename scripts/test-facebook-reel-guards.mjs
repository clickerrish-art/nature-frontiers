import test from "node:test";
import assert from "node:assert/strict";
import { validateReelCampaign, isReelPublished } from "./facebook-reel-guards.mjs";
import { REQUIRED_PRODUCT_LINKS, APPROVED_AFFILIATE_LINKS, AFFILIATE_DISCLOSURE, PRODUCT_DISCLOSURE, buildLongFormVideoDescription } from "./video-description.mjs";

const valid = {
  id: "nf-reel-001",
  network: "facebook",
  status: "approved",
  facebook_type: "REEL",
  title: "Wildlife behaviour explained",
  caption: buildLongFormVideoDescription({
    seriesTitle: "Wild Encounters: Crocodile Behaviour",
    episodeNumber: 1,
    episodeTitle: "The Patient Ambush — Reel",
    episodeDescription: "A responsible wildlife education Reel.",
    nextEpisodeTeaser: "Watch the full episode for the complete story."
  }) + "\nWatch the full episode: https://www.facebook.com/watch/?v=123456789",
  product_links: REQUIRED_PRODUCT_LINKS.map((item) => item.url),
  affiliate_links: [...APPROVED_AFFILIATE_LINKS],
  affiliate_links_verified: true,
  affiliate_verification_note: "Owner-supplied approved Safari.com URLs; a=GM26 tracking preserved.",
  affiliate_disclosure: AFFILIATE_DISCLOSURE,
  product_disclosure: PRODUCT_DISCLOSURE,
  media_url: "https://cdn.example.org/wildlife.mp4",
  media_rights_confirmed: true,
  originality_confirmed: true,
  policy_review_passed: true,
  wildlife_welfare_confirmed: true,
  non_graphic_review_passed: true,
  media_accessibility_confirmed: true,
  media_technical_review_passed: true,
  media_sha256: "a".repeat(64),
  related_longform_campaign_id: "nf-video-001",
  full_video_url: "https://www.facebook.com/watch/?v=123456789",
  synthetic_visuals: false,
  ai_generated_video: false,
  stock_footage_used: false,
  media_origin: "original_camera_recording",
  source_recording_id: "camera-original-001",
  original_camera_file_sha256: "b".repeat(64),
  original_recording_retained: true,
  provenance_review_passed: true,
  provenance_reviewer: "wildlife-editor",
  provenance_reviewed_at: "2026-11-11T10:00:00Z"
};

test("accepts only a fully reviewed, rights-cleared, technically checked Reel", () => {
  assert.deepEqual(validateReelCampaign(valid), []);
});

for (const [field, value] of [
  ["status", "draft"],
  ["facebook_type", "POST"],
  ["media_rights_confirmed", false],
  ["originality_confirmed", false],
  ["policy_review_passed", false],
  ["wildlife_welfare_confirmed", false],
  ["non_graphic_review_passed", false],
  ["media_accessibility_confirmed", false],
  ["media_technical_review_passed", false],
  ["media_sha256", "missing"],
  ["related_longform_campaign_id", ""],
  ["full_video_url", "not-a-url"],
  ["synthetic_visuals", true],
  ["ai_generated_video", true],
  ["stock_footage_used", true],
  ["media_origin", "stock_footage"],
  ["source_recording_id", ""],
  ["original_camera_file_sha256", "missing"],
  ["original_recording_retained", false],
  ["provenance_review_passed", false],
  ["provenance_reviewer", ""],
  ["provenance_reviewed_at", "not-a-date"],
  ["media_url", "http://cdn.example.org/wildlife.mp4"]
]) {
  test(`blocks unsafe Reel when ${field} is ${String(value)}`, () => {
    const candidate = { ...valid, [field]: value };
    assert.ok(validateReelCampaign(candidate).length > 0);
  });
}

test("rejects synthetic wildlife video even when fully disclosed", () => {
  const disclosure = "Visual disclosure: AI-generated illustrative animation, not documentary footage.";
  const errors = validateReelCampaign({ ...valid, synthetic_visuals: true, ai_disclosure: disclosure, caption: `A wildlife fact. Watch the full episode: ${valid.full_video_url}. ${disclosure}` });
  assert.ok(errors.some((e) => e.includes("AI-generated or synthetic wildlife visuals are prohibited")));
});


test("fails closed without throwing when the Reel description is missing", () => {
  const errors = validateReelCampaign({ ...valid, caption: undefined });
  assert.ok(errors.some((e) => e.includes("YouTube channel link")));
});

test("requires all channel, product, affiliate and disclosure links in every Reel description", () => {
  assert.ok(validateReelCampaign({ ...valid, caption: valid.caption.replace("https://www.youtube.com/@naturefrontiers-life", "") }).some((e) => e.includes("YouTube channel link")));
  assert.ok(validateReelCampaign({ ...valid, product_links: [] }).some((e) => e.includes("all six catalogue Selar")));
  assert.ok(validateReelCampaign({ ...valid, affiliate_links: [] }).some((e) => e.includes("all five owner-supplied Safari.com")));
  assert.ok(validateReelCampaign({ ...valid, affiliate_links_verified: false }).some((e) => e.includes("human verification evidence")));
  assert.ok(validateReelCampaign({ ...valid, affiliate_disclosure: "" }).some((e) => e.includes("standard affiliate disclosure")));
  assert.ok(validateReelCampaign({ ...valid, product_disclosure: "" }).some((e) => e.includes("standard paid-product disclosure")));
});

test("requires Meta's explicit published state, not merely a completed upload or phase", () => {
  assert.equal(isReelPublished({ status: { publishing_phase: { status: "complete", publish_status: "published" } } }), true);
  assert.equal(isReelPublished({ status: { publishing_phase: { status: "complete", publish_status: "scheduled" } } }), false);
  assert.equal(isReelPublished({ status: { publishing_phase: { status: "complete", publish_status: "draft" } } }), false);
  assert.equal(isReelPublished({ status: { publishing_phase: { status: "complete" } } }), false);
  assert.equal(isReelPublished({ status: { video_status: "published" } }), false);
  assert.equal(isReelPublished({ status: { video_status: "ready", publishing_phase: { status: "not_started" } } }), false);
  assert.equal(isReelPublished({ status: { video_status: "processing", publishing_phase: { status: "in_progress" } } }), false);
});

test("requires each Reel to lead to its already-published full episode", () => {
  assert.ok(validateReelCampaign({ ...valid, caption: "A short clip without the full episode link." }).some((e) => e.includes("exact HTTPS URL")));
  assert.deepEqual(validateReelCampaign(valid), []);
});
