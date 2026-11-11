import test from "node:test";
import assert from "node:assert/strict";
import { validateFeedRelease } from "./facebook-feed-guards.mjs";

const approved = {
  id: "nf-feed-001",
  network: "facebook",
  campaign_type: "organic",
  facebook_type: "POST",
  status: "approved",
  policy_review_passed: true,
  content_accuracy_confirmed: true,
  brand_fit_confirmed: true
};

test("accepts an explicitly approved organic wildlife feed post", () => {
  assert.deepEqual(validateFeedRelease(approved), []);
});

test("blocks missing or unsupported Facebook publication types", () => {
  assert.ok(validateFeedRelease({ ...approved, facebook_type: undefined }).some((e) => e.includes("Facebook POST")));
  assert.ok(validateFeedRelease({ ...approved, facebook_type: "STORY" }).some((e) => e.includes("Facebook POST")));
  assert.ok(validateFeedRelease({ ...approved, facebook_type: "REEL" }).some((e) => e.includes("Facebook POST")));
});

test("blocks missing or unsupported campaign types", () => {
  assert.ok(validateFeedRelease({ ...approved, campaign_type: undefined }).some((e) => e.includes("campaign_type")));
  assert.ok(validateFeedRelease({ ...approved, campaign_type: "unknown" }).some((e) => e.includes("campaign_type")));
});

test("requires a product reference for promotions and forbids it on organic posts", () => {
  assert.ok(validateFeedRelease({ ...approved, campaign_type: "promotion" }).some((e) => e.includes("approved product")));
  assert.ok(validateFeedRelease({ ...approved, product_id: "product-1" }).some((e) => e.includes("must not reference a product")));
  assert.deepEqual(validateFeedRelease({ ...approved, campaign_type: "promotion", product_id: "product-1" }), []);
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

test("requires rights and originality clearance and refuses unsupported media attachments", () => {
  const attached = { ...approved, media: ["https://cdn.example.org/photo.jpg"] };
  assert.ok(validateFeedRelease(attached).some((e) => e.includes("rights clearance")));
  assert.ok(validateFeedRelease(attached).some((e) => e.includes("originality review")));
  const reviewed = { ...attached, media_rights_confirmed: true, media_originality_confirmed: true };
  assert.ok(validateFeedRelease(reviewed).some((e) => e.includes("not supported")));
});
