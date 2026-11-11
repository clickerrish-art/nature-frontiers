import test from "node:test";
import assert from "node:assert/strict";
import { validateFeedRelease } from "./facebook-feed-guards.mjs";

const approved = {
  id: "nf-feed-001",
  network: "facebook",
  status: "approved",
  policy_review_passed: true,
  content_accuracy_confirmed: true,
  brand_fit_confirmed: true
};

test("accepts only a post with explicit human policy, accuracy and brand-fit signoff", () => {
  assert.deepEqual(validateFeedRelease(approved), []);
});

for (const [field, value] of [
  ["status", "draft"],
  ["policy_review_passed", false],
  ["content_accuracy_confirmed", false],
  ["brand_fit_confirmed", false]
]) {
  test(`blocks feed release when ${field} is ${String(value)}`, () => {
    assert.ok(validateFeedRelease({ ...approved, [field]: value }).length > 0);
  });
}

test("requires rights and originality clearance when media is attached", () => {
  assert.ok(validateFeedRelease({ ...approved, media: ["https://cdn.example.org/photo.jpg"] }).some((e) => e.includes("rights clearance")));
  assert.ok(validateFeedRelease({ ...approved, media_url: "https://cdn.example.org/video.mp4", media_rights_confirmed: true }).some((e) => e.includes("originality review")));
  assert.deepEqual(validateFeedRelease({
    ...approved,
    media: ["https://cdn.example.org/photo.jpg"],
    media_rights_confirmed: true,
    media_originality_confirmed: true
  }), []);
});
