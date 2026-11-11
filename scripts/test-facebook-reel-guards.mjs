import test from "node:test";
import assert from "node:assert/strict";
import { validateReelCampaign, isReelPublished } from "./facebook-reel-guards.mjs";

const valid = {
  id: "nf-reel-001",
  network: "facebook",
  status: "approved",
  facebook_type: "REEL",
  title: "Wildlife behaviour explained",
  caption: "A responsible wildlife education Reel.",
  media_url: "https://cdn.example.org/wildlife.mp4",
  media_rights_confirmed: true,
  originality_confirmed: true,
  policy_review_passed: true,
  media_accessibility_confirmed: true,
  media_technical_review_passed: true,
  media_sha256: "a".repeat(64),
  synthetic_visuals: false
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
  ["media_accessibility_confirmed", false],
  ["media_technical_review_passed", false],
  ["media_sha256", "missing"],
  ["synthetic_visuals", true],
  ["media_url", "http://cdn.example.org/wildlife.mp4"]
]) {
  test(`blocks unsafe Reel when ${field} is ${String(value)}`, () => {
    const candidate = { ...valid, [field]: value };
    assert.ok(validateReelCampaign(candidate).length > 0);
  });
}

test("blocks synthetic media without a matching disclosure in the caption", () => {
  assert.ok(validateReelCampaign({ ...valid, synthetic_visuals: true }).some((e) => e.includes("disclosure")));
  const disclosure = "Visual disclosure: AI-generated illustrative animation, not documentary footage.";
  assert.ok(validateReelCampaign({ ...valid, synthetic_visuals: true, ai_disclosure: disclosure }).some((e) => e.includes("caption")));
  assert.deepEqual(validateReelCampaign({ ...valid, synthetic_visuals: true, ai_disclosure: disclosure, caption: `A wildlife fact. ${disclosure}` }), []);
});

test("requires Meta to confirm completed publishing, not merely ready media", () => {
  assert.equal(isReelPublished({ status: { publishing_phase: { status: "complete" } } }), true);
  assert.equal(isReelPublished({ status: { video_status: "published" } }), true);
  assert.equal(isReelPublished({ status: { video_status: "ready" } }), false);
  assert.equal(isReelPublished({ status: { video_status: "processing" } }), false);
  assert.equal(isReelPublished({ status: { publishing_phase: { status: "not_started" } } }), false);
});
