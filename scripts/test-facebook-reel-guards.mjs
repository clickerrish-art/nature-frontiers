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
  synthetic_visuals: false
};

test("accepts only a fully reviewed, rights-cleared Reel", () => {
  assert.deepEqual(validateReelCampaign(valid), []);
});

for (const [field, value] of [
  ["status", "draft"],
  ["facebook_type", "POST"],
  ["media_rights_confirmed", false],
  ["originality_confirmed", false],
  ["policy_review_passed", false],
  ["synthetic_visuals", true],
  ["media_url", "http://cdn.example.org/wildlife.mp4"]
]) {
  test(`blocks unsafe Reel when ${field} is ${String(value)}`, () => {
    const candidate = { ...valid, [field]: value };
    assert.ok(validateReelCampaign(candidate).length > 0);
  });
}

test("blocks synthetic media without explicit disclosure", () => {
  assert.ok(validateReelCampaign({ ...valid, synthetic_visuals: true }).some((e) => e.includes("disclosure")));
});

test("recognizes only a completed/ready publication phase", () => {
  assert.equal(isReelPublished({ status: { publishing_phase: { status: "complete" } } }), true);
  assert.equal(isReelPublished({ status: { video_status: "processing" } }), false);
  assert.equal(isReelPublished({ status: { publishing_phase: { status: "not_started" } } }), false);
});
