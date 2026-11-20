import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validatePrepublishCampaign } from "./prepublish-gate.mjs";

const now = new Date("2026-11-20T12:00:00.000Z");
const policy = { banned_phrases: ["guaranteed income"], allowed_link_hosts: ["selar.com"], link_max_age_hours: 24, approval_max_age_days: 30 };
const caption = "A wildlife fact. Footage: Creator via Pexels. Licensed stock footage — illustrative, not a Nature Frontiers field recording.";
const media = {
  media_sha256: "a".repeat(64),
  media_rights_confirmed: true,
  synthetic_visuals: false,
  ai_generated_video: false,
  media_technical_review_passed: true,
  media_accessibility_confirmed: true,
  media_url_immutable_confirmed: true,
  watermark_scan_passed: true,
  audio_present: false,
  media_origin: "licensed_stock",
  wildlife_media_policy: "licensed_stock_allowed",
  source_url: "https://www.pexels.com/video/example/",
  source_creator: "Creator",
  license_name: "Pexels License",
  license_evidence_url: "https://www.pexels.com/license/",
  provenance_review_passed: true,
  provenance_reviewer: "editor",
  provenance_reviewed_at: "2026-11-20T10:00:00Z",
  on_screen_disclosure_confirmed: true,
  on_screen_disclosure_text: "Licensed stock footage — illustrative, not a Nature Frontiers field recording.",
  caption_attribution: "Footage: Creator via Pexels."
};
function validCampaign(overrides = {}) {
  const campaign = {
    id: "nf-ig-001", network: "instagram", instagram_type: "REEL", status: "approved",
    campaign_type: "organic", destination: "instagram:nature-frontiers", caption,
    policy_review_passed: true, content_accuracy_confirmed: true, brand_fit_confirmed: true,
    wildlife_welfare_confirmed: true, non_graphic_review_passed: true,
    media_url: "https://cdn.example.org/nature.mp4", media_sha256: media.media_sha256,
    ...structuredClone(media)
  };
  campaign.human_approval = {
    reviewer: "owner-reviewer", approved_at: "2026-11-20T11:00:00.000Z",
    destination: campaign.destination,
    caption_sha256: createHash("sha256").update(campaign.caption.trim()).digest("hex"),
    media_sha256: [campaign.media_sha256]
  };
  return { ...campaign, ...overrides };
}

test("allows editorial wildlife content with licensed stock and no unrelated commercial link or paid disclosure", () => {
  assert.deepEqual(validatePrepublishCampaign(validCampaign(), [], policy, now).issues, []);
});

test("allows original camera footage only with retained original and provenance evidence", () => {
  const campaign = validCampaign({
    media_origin: "original_camera_recording",
    media_originality_confirmed: true,
    source_recording_id: "camera-001",
    original_camera_file_sha256: "b".repeat(64),
    original_recording_retained: true,
    source_url: undefined, source_creator: undefined, license_name: undefined,
    license_evidence_url: undefined, on_screen_disclosure_confirmed: undefined,
    on_screen_disclosure_text: undefined, caption_attribution: undefined,
    caption: "Original Nature Frontiers field recording. Wildlife observed responsibly.",
    human_approval: undefined
  });
  campaign.human_approval = {
    reviewer: "owner-reviewer", approved_at: "2026-11-20T11:00:00.000Z",
    destination: campaign.destination,
    caption_sha256: createHash("sha256").update(campaign.caption.trim()).digest("hex"),
    media_sha256: [campaign.media_sha256]
  };
  assert.deepEqual(validatePrepublishCampaign(campaign, [], policy, now).issues, []);
});

test("requires a link check and paid disclosure only for promotional campaigns", () => {
  const campaign = validCampaign({ campaign_type: "promotion", caption: "Get the creator pack: https://selar.com/example. Footage: Creator via Pexels." });
  campaign.link_check = { status: 200, checked_at: "2026-11-20T11:30:00.000Z", final_url: "https://selar.com/example" };
  campaign.disclosure = { paid_promotion: true, paid_promotion_text: "Disclosure: This is a promotional post for a paid digital product." };
  campaign.caption += " Disclosure: This is a promotional post for a paid digital product.";
  campaign.human_approval.caption_sha256 = createHash("sha256").update(campaign.caption.trim()).digest("hex");
  assert.ok(validatePrepublishCampaign(campaign, [], policy, now).issues.length === 0);
  assert.ok(validatePrepublishCampaign({ ...campaign, disclosure: { paid_promotion: false } }, [], policy, now).issues.some((e) => e.code === "PAID_DISCLOSURE_MISSING"));
});

test("blocks duplicate captions, stale links and banned claims", () => {
  const c = validCampaign({ caption: caption + " guaranteed income" });
  c.human_approval.caption_sha256 = createHash("sha256").update(c.caption.trim()).digest("hex");
  const result = validatePrepublishCampaign(c, [{ id: "older", caption: c.caption }], policy, now);
  assert.ok(result.issues.some((e) => e.code === "DUPLICATE_CAPTION"));
  assert.ok(result.issues.some((e) => e.code === "BANNED_CLAIM"));
  const linked = validCampaign({ caption: "Visit https://selar.com/example" , link_check: { status: 200, checked_at: "2026-11-18T00:00:00.000Z", final_url: "https://selar.com/example" } });
  assert.ok(validatePrepublishCampaign(linked, [], policy, now).issues.some((e) => e.code === "LINK_CHECK_STALE_OR_MISSING"));
});

test("blocks stock without disclosure, source, licence, attribution or provenance", () => {
  for (const [field, value, code] of [
    ["on_screen_disclosure_confirmed", false, "STOCK_DISCLOSURE_MISSING"],
    ["source_url", "", "STOCK_SOURCE_MISSING"],
    ["license_evidence_url", "", "STOCK_LICENSE_EVIDENCE_MISSING"],
    ["caption_attribution", "", "STOCK_ATTRIBUTION_MISSING"],
    ["provenance_review_passed", false, "STOCK_PROVENANCE_MISSING"]
  ]) assert.ok(validatePrepublishCampaign(validCampaign({ [field]: value }), [], policy, now).issues.some((e) => e.code === code));
});

test("blocks unlicensed audio, missing watermark review and synthetic wildlife visuals", () => {
  assert.ok(validatePrepublishCampaign(validCampaign({ audio_present: true, audio_license_status: "unknown" }), [], policy, now).issues.some((e) => e.code === "AUDIO_NOT_CLEARED"));
  assert.ok(validatePrepublishCampaign(validCampaign({ watermark_scan_passed: false }), [], policy, now).issues.some((e) => e.code === "WATERMARK_NOT_CLEARED"));
  assert.ok(validatePrepublishCampaign(validCampaign({ synthetic_visuals: true }), [], policy, now).issues.some((e) => e.code === "SYNTHETIC_MEDIA_PROHIBITED"));
});

test("binds human approval to exact caption, media hash, destination and review age", () => {
  assert.ok(validatePrepublishCampaign(validCampaign({ destination: "facebook:other-page" }), [], policy, now).issues.some((e) => e.code === "DESTINATION_MISMATCH"));
  const c = validCampaign();
  c.human_approval.media_sha256 = ["0".repeat(64)];
  assert.ok(validatePrepublishCampaign(c, [], policy, now).issues.some((e) => e.code === "HUMAN_APPROVAL_NOT_BOUND"));
});
