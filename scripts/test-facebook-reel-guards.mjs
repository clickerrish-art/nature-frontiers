import test from "node:test";
import assert from "node:assert/strict";
import { validateReelCampaign, isReelPublished } from "./facebook-reel-guards.mjs";

const base = {
  id: "nf-editorial-reel-001", network: "facebook", status: "approved", facebook_type: "REEL",
  title: "Nile crocodile behaviour", caption: "A responsible wildlife fact. Footage: Creator via Pexels. Licensed stock footage — illustrative, not a Nature Frontiers field recording.",
  media_url: "https://cdn.example.org/wildlife.mp4",
  media_url_immutable_confirmed: true,
  duration_seconds: 30,
  media_duration_min_seconds: 25,
  media_duration_max_seconds: 35, media_rights_confirmed: true,
  policy_review_passed: true, wildlife_welfare_confirmed: true, non_graphic_review_passed: true,
  media_accessibility_confirmed: true, media_technical_review_passed: true,
  media_sha256: "a".repeat(64), synthetic_visuals: false, ai_generated_video: false,
  media_origin: "licensed_stock", wildlife_media_policy: "licensed_stock_allowed", stock_footage_used: true,
  source_url: "https://www.pexels.com/video/example/", source_creator: "Creator",
  license_name: "Pexels License", license_evidence_url: "https://www.pexels.com/license/",
  provenance_review_passed: true, provenance_reviewer: "editor", provenance_reviewed_at: "2026-11-20T10:00:00Z",
  on_screen_disclosure_confirmed: true,
  on_screen_disclosure_text: "Licensed stock footage — illustrative, not a Nature Frontiers field recording.",
  caption_attribution: "Footage: Creator via Pexels."
};

test("requires stable media URL and the campaign's declared duration profile", () => {
  assert.ok(validateReelCampaign({ ...base, media_url_immutable_confirmed: false }).some((e) => e.includes("stable")));
  assert.ok(validateReelCampaign({ ...base, duration_seconds: 36 }).some((e) => e.includes("duration_seconds")));
});

test("accepts an editorial-only standalone Reel using properly documented licensed stock", () => {
  assert.deepEqual(validateReelCampaign(base), []);
});

test("accepts an original camera recording with its retained original and provenance review", () => {
  const original = { ...base, media_origin: "original_camera_recording", stock_footage_used: false,
    source_recording_id: "camera-001", original_camera_file_sha256: "b".repeat(64),
    original_recording_retained: true, on_screen_disclosure_confirmed: undefined,
    on_screen_disclosure_text: undefined, source_url: undefined, source_creator: undefined,
    license_name: undefined, license_evidence_url: undefined, caption_attribution: undefined };
  assert.deepEqual(validateReelCampaign(original), []);
});

for (const [field, value, message] of [
  ["media_rights_confirmed", false, "media rights"],
  ["policy_review_passed", false, "human policy review"],
  ["wildlife_welfare_confirmed", false, "wildlife footage"],
  ["non_graphic_review_passed", false, "non-graphic"],
  ["media_accessibility_confirmed", false, "accessibility"],
  ["media_technical_review_passed", false, "technical"],
  ["media_sha256", "bad", "SHA-256"],
  ["synthetic_visuals", true, "synthetic"],
  ["ai_generated_video", true, "AI-generated video"],
  ["source_url", "", "source-page URL"],
  ["source_url", "javascript:alert(1)", "HTTPS"],
  ["source_creator", "", "credited creator"],
  ["license_name", "", "licence name"],
  ["license_evidence_url", "javascript:alert(1)", "HTTPS"],
  ["provenance_review_passed", false, "provenance"],
  ["provenance_reviewer", "", "reviewer"],
  ["provenance_reviewed_at", "invalid", "timestamp"],
  ["on_screen_disclosure_confirmed", false, "on-screen disclosure"],
  ["on_screen_disclosure_text", "Footage shown", "clearly identify licensed stock"],
  ["caption_attribution", "", "attribution"]
]) {
  test("blocks licensed-stock Reel when " + field + " is invalid", () => {
    assert.ok(validateReelCampaign({ ...base, [field]: value }).some((error) => error.toLowerCase().includes(message.toLowerCase())));
  });
}

test("blocks licensed stock unless the owner-approved policy is explicitly attached to the campaign", () => {
  assert.ok(validateReelCampaign({ ...base, wildlife_media_policy: "original_camera_only" }).some((error) => error.includes("owner-approved licensed_stock_allowed")));
});

test("blocks a stock-origin claim when stock_footage_used is false", () => {
  assert.ok(validateReelCampaign({ ...base, stock_footage_used: false }).some((error) => error.includes("stock_footage_used=true")));
});

test("blocks unreviewed or undisclosed synthetic footage", () => {
  assert.ok(validateReelCampaign({ ...base, synthetic_visuals: true }).some((error) => error.includes("synthetic wildlife")));
});

test("blocks standalone original camera footage without original file evidence", () => {
  const original = { ...base, media_origin: "original_camera_recording", stock_footage_used: false };
  assert.ok(validateReelCampaign(original).some((error) => error.includes("original camera source recording")));
});

test("does not require unrelated YouTube, product or affiliate links for editorial-only Reels", () => {
  assert.deepEqual(validateReelCampaign(base), []);
});

test("requires disclosures and verification only when promotional links are actually supplied", () => {
  const affiliate = "https://www.safari.com/sabi-sand?a=GM26";
  assert.ok(validateReelCampaign({ ...base, affiliate_links: [affiliate], caption: base.caption + " " + affiliate }).some((e) => e.includes("affiliate URLs require human verification")));
  assert.ok(validateReelCampaign({ ...base, product_links: ["https://selar.com/example"] }).some((e) => e.includes("paid product links require")));
});

test("requires a parent long-form episode only when the campaign explicitly belongs to a series", () => {
  assert.deepEqual(validateReelCampaign(base), []);
  assert.ok(validateReelCampaign({ ...base, series_requires_parent: true }).some((e) => e.includes("parent long-form campaign id")));
});

test("blocks non-approved campaigns and malformed public media URLs", () => {
  assert.ok(validateReelCampaign({ ...base, status: "draft" }).some((e) => e.includes("explicitly approved")));
  assert.ok(validateReelCampaign({ ...base, media_url: "http://localhost/video.mp4" }).length > 0);
});

test("requires Meta's explicit published state, not merely upload completion", () => {
  assert.equal(isReelPublished({ status: { publishing_phase: { status: "complete", publish_status: "published" } } }), true);
  assert.equal(isReelPublished({ status: { publishing_phase: { status: "complete", publish_status: "scheduled" } } }), false);
  assert.equal(isReelPublished({ status: { video_status: "published" } }), false);
});
