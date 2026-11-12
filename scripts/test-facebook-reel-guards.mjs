import test from "node:test";
import assert from "node:assert/strict";
import { validateReelCampaign, isReelPublished, isReelPublishedForPage } from "./facebook-reel-guards.mjs";

const valid = {
  id: "nf-reel-001",
  network: "facebook",
  status: "approved",
  facebook_type: "REEL",
  title: "Wildlife behaviour explained",
  caption: "A responsible wildlife education Reel. Watch the full episode: https://www.facebook.com/watch/?v=123456789",
  media_url: "https://cdn.example.org/wildlife.mp4",
  media_rights_confirmed: true,
  originality_confirmed: true,
  policy_review_passed: true,
  wildlife_welfare_confirmed: true,
  non_graphic_review_passed: true,
  media_accessibility_confirmed: true,
  media_technical_review_passed: true,
  media_sha256: "a".repeat(64),
  script_sha256: "c".repeat(64),
  voiceover_sha256: "d".repeat(64),
  captions_sha256: "e".repeat(64),
  thumbnail_sha256: "f".repeat(64),
  metadata_sha256: "1".repeat(64),
  media_rights_evidence_ref: "rights-record://reel-video-001",
  audio_rights_evidence_ref: "rights-record://reel-audio-001",
  fact_check_sources: ["https://example.org/wildlife-research"],
  human_review_confirmed: true,
  human_review: {
    reviewer: "wildlife-editor",
    reviewed_at: "2026-11-11T10:30:00Z",
    video_sha256: "a".repeat(64),
    script_sha256: "c".repeat(64),
    voiceover_sha256: "d".repeat(64),
    captions_sha256: "e".repeat(64),
    thumbnail_sha256: "f".repeat(64),
    metadata_sha256: "1".repeat(64)
  },
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
  ["script_sha256", "missing"],
  ["voiceover_sha256", "missing"],
  ["captions_sha256", "missing"],
  ["thumbnail_sha256", "missing"],
  ["metadata_sha256", "missing"],
  ["media_rights_evidence_ref", ""],
  ["audio_rights_evidence_ref", ""],
  ["human_review_confirmed", false],
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

test("Reel human approval is bound to exact media and metadata hashes", () => {
  assert.ok(validateReelCampaign({ ...valid, human_review: { ...valid.human_review, video_sha256: "z".repeat(64) } }).some((error) => error.includes("exact approved media SHA-256")));
  assert.ok(validateReelCampaign({ ...valid, human_review: { ...valid.human_review, metadata_sha256: "z".repeat(64) } }).some((error) => error.includes("exact approved metadata SHA-256")));
  assert.ok(validateReelCampaign({ ...valid, human_review: { ...valid.human_review, reviewer: "" } }).some((error) => error.includes("named reviewer and valid timestamp")));
});

test("rejects synthetic wildlife video even when fully disclosed", () => {
  const disclosure = "Visual disclosure: AI-generated illustrative animation, not documentary footage.";
  const errors = validateReelCampaign({ ...valid, synthetic_visuals: true, ai_disclosure: disclosure, caption: `A wildlife fact. Watch the full episode: ${valid.full_video_url}. ${disclosure}` });
  assert.ok(errors.some((e) => e.includes("AI-generated or synthetic wildlife visuals are prohibited")));
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

test("Reel receipt must confirm the exact video ID, Page owner and HTTPS permalink", () => {
  const receipt = {
    id: "reel-123",
    from: { id: "1003575786161492" },
    permalink_url: "https://www.facebook.com/reel/123",
    status: { publishing_phase: { publish_status: "published" } }
  };
  assert.equal(isReelPublishedForPage(receipt, "reel-123", "1003575786161492"), true);
  assert.equal(isReelPublishedForPage({ ...receipt, from: { id: "wrong-page" } }, "reel-123", "1003575786161492"), false);
  assert.equal(isReelPublishedForPage({ ...receipt, id: "other-video" }, "reel-123", "1003575786161492"), false);
  assert.equal(isReelPublishedForPage({ ...receipt, permalink_url: "http://www.facebook.com/reel/123" }, "reel-123", "1003575786161492"), false);
});
