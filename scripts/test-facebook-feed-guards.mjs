import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createFeedReviewDigest, validateFeedRelease } from "./facebook-feed-guards.mjs";

const approvedBase = {
  id: "nf-feed-001",
  network: "facebook",
  campaign_type: "organic",
  facebook_type: "POST",
  status: "approved",
  caption: "A careful wildlife fact post.",
  policy_review_passed: true,
  content_accuracy_confirmed: true,
  brand_fit_confirmed: true,
  wildlife_welfare_confirmed: true,
  non_graphic_review_passed: true
};
const approved = {
  ...approvedBase,
  human_review: {
    approved: true,
    reviewer: "Nature Frontiers editorial reviewer",
    reviewed_at: "2026-11-12T10:00:00.000Z",
    release_sha256: createFeedReviewDigest(approvedBase)
  }
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
  const approvedPromotion = { ...approved, campaign_type: "promotion", product_id: "product-1" };
  approvedPromotion.human_review = { ...approved.human_review, release_sha256: createFeedReviewDigest(approvedPromotion) };
  assert.deepEqual(validateFeedRelease(approvedPromotion), []);
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

test("blocks wildlife content without animal-welfare and non-graphic review", () => {
  assert.ok(validateFeedRelease({ ...approved, wildlife_welfare_confirmed: false }).some((e) => e.includes("baiting")));
  assert.ok(validateFeedRelease({ ...approved, non_graphic_review_passed: false }).some((e) => e.includes("non-graphic")));
});

test("requires a named, timestamped human approval bound to the exact release metadata", () => {
  assert.ok(validateFeedRelease({ ...approved, human_review: undefined }).some((e) => e.includes("named, timestamped human review")));
  assert.ok(validateFeedRelease({ ...approved, human_review: { ...approved.human_review, reviewer: "" } }).some((e) => e.includes("named, timestamped human review")));
  assert.ok(validateFeedRelease({ ...approved, human_review: { ...approved.human_review, reviewed_at: "not-a-date" } }).some((e) => e.includes("named, timestamped human review")));
  assert.ok(validateFeedRelease({ ...approved, human_review: { ...approved.human_review, release_sha256: "0".repeat(64) } }).some((e) => e.includes("named, timestamped human review")));
});

test("invalidates the feed approval when caption or reviewed metadata changes", () => {
  assert.ok(validateFeedRelease({ ...approved, caption: "Changed after review." }).some((e) => e.includes("bound to the exact release metadata")));
  assert.ok(validateFeedRelease({ ...approved, brand_fit_confirmed: false }).some((e) => e.includes("bound to the exact release metadata")));
});

test("every repository Facebook campaign draft links to the Nature Frontiers YouTube channel", async () => {
  const campaigns = JSON.parse(await readFile(new URL("../data/campaigns.json", import.meta.url), "utf8"));
  assert.ok(campaigns.length > 0);
  for (const campaign of campaigns) {
    assert.ok(
      campaign.caption.includes("https://www.youtube.com/@naturefrontiers-life"),
      campaign.id + " is missing the required Nature Frontiers YouTube channel CTA"
    );
  }
});
