import test from "node:test";
import assert from "node:assert/strict";
import { validateInstagramReelCampaign } from "./instagram-reel-guards.mjs";

const valid = {
  id: "nf-instagram-reel-001",
  network: "instagram",
  status: "approved",
  instagram_type: "REEL",
  duration_seconds: 55,
  share_to_feed: true,
  title: "Nile crocodile behaviour",
  caption: "A responsible wildlife fact. Footage: Creator via Pexels. Licensed stock footage — illustrative, not a Nature Frontiers field recording.",
  media_url: "https://cdn.example.org/wildlife.mp4",
  media_url_immutable_confirmed: true,
  media_rights_confirmed: true,
  policy_review_passed: true,
  wildlife_welfare_confirmed: true,
  non_graphic_review_passed: true,
  media_accessibility_confirmed: true,
  media_technical_review_passed: true,
  media_sha256: "a".repeat(64),
  synthetic_visuals: false,
  ai_generated_video: false,
  media_origin: "licensed_stock",
  wildlife_media_policy: "licensed_stock_allowed",
  stock_footage_used: true,
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

test("accepts a rights-cleared 50–60 second Instagram wildlife Reel with explicit feed visibility", () => {
  assert.deepEqual(validateInstagramReelCampaign(valid), []);
});

test("rejects missing or incorrect Instagram media type and network", () => {
  assert.ok(validateInstagramReelCampaign({ ...valid, instagram_type: "VIDEO" }).some((e) => e.includes("instagram_type=REEL")));
  assert.ok(validateInstagramReelCampaign({ ...valid, network: "facebook" }).some((e) => e.includes("target Instagram")));
});

test("rejects duration outside the 50–60 second production target", () => {
  assert.ok(validateInstagramReelCampaign({ ...valid, duration_seconds: 49.9 }).some((e) => e.includes("50–60 seconds")));
  assert.ok(validateInstagramReelCampaign({ ...valid, duration_seconds: 60.1 }).some((e) => e.includes("50–60 seconds")));
});

test("requires a stable public video URL for Meta to fetch during processing", () => {
  assert.ok(validateInstagramReelCampaign({ ...valid, media_url_immutable_confirmed: false }).some((e) => e.includes("immutable")));
});

test("requires an explicit share_to_feed decision", () => {
  assert.ok(validateInstagramReelCampaign({ ...valid, share_to_feed: undefined }).some((e) => e.includes("share_to_feed")));
});

test("enforces Instagram caption limits", () => {
  assert.ok(validateInstagramReelCampaign({ ...valid, caption: "x".repeat(2201) }).some((e) => e.includes("2,200-character")));
  assert.ok(validateInstagramReelCampaign({ ...valid, caption: Array(31).fill("#wildlife").join(" ") }).some((e) => e.includes("30-hashtag")));
  assert.ok(validateInstagramReelCampaign({ ...valid, caption: Array(21).fill("@nature").join(" ") }).some((e) => e.includes("20-mention")));
});

test("rejects missing stock rights, source, provenance or on-screen disclosure", () => {
  assert.ok(validateInstagramReelCampaign({ ...valid, license_evidence_url: "" }).some((e) => e.includes("licence evidence URL")));
  assert.ok(validateInstagramReelCampaign({ ...valid, provenance_review_passed: false }).some((e) => e.includes("provenance")));
  assert.ok(validateInstagramReelCampaign({ ...valid, on_screen_disclosure_confirmed: false }).some((e) => e.includes("on-screen disclosure")));
  assert.ok(validateInstagramReelCampaign({ ...valid, wildlife_media_policy: "original_camera_only" }).some((e) => e.includes("owner-approved licensed_stock_allowed")));
});

test("rejects synthetic or unapproved campaign media", () => {
  assert.ok(validateInstagramReelCampaign({ ...valid, synthetic_visuals: true }).some((e) => e.includes("synthetic wildlife")));
  assert.ok(validateInstagramReelCampaign({ ...valid, status: "draft" }).some((e) => e.includes("explicitly approved")));
});
