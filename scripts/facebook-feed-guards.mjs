import { createHash } from "node:crypto";

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const isSha256 = (value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);

export function createFeedReviewDigest(campaign) {
  const reviewedRelease = {
    id: campaign?.id ?? null,
    network: campaign?.network ?? null,
    facebook_type: campaign?.facebook_type ?? null,
    campaign_type: campaign?.campaign_type ?? null,
    product_id: campaign?.product_id ?? null,
    caption: campaign?.caption ?? null,
    link_verified: campaign?.link_verified === true,
    shared_url_confirmed: campaign?.shared_url_confirmed === true,
    policy_review_passed: campaign?.policy_review_passed === true,
    content_accuracy_confirmed: campaign?.content_accuracy_confirmed === true,
    brand_fit_confirmed: campaign?.brand_fit_confirmed === true,
    wildlife_welfare_confirmed: campaign?.wildlife_welfare_confirmed === true,
    non_graphic_review_passed: campaign?.non_graphic_review_passed === true,
    media_rights_confirmed: campaign?.media_rights_confirmed === true,
    media_originality_confirmed: campaign?.media_originality_confirmed === true
  };
  return createHash("sha256").update(JSON.stringify(reviewedRelease)).digest("hex");
}

export function validateFeedRelease(campaign) {
  const errors = [];
  if (!campaign || campaign.network !== "facebook") errors.push("campaign must target Facebook.");
  if (campaign?.status !== "approved") errors.push("campaign must be explicitly approved.");
  if (campaign?.facebook_type !== "POST") errors.push("feed publisher accepts only explicitly declared Facebook POST campaigns.");
  if (!["organic", "promotion"].includes(campaign?.campaign_type)) {
    errors.push("campaign_type must be explicitly organic or promotion.");
  }
  if (campaign?.campaign_type === "promotion" && (typeof campaign?.product_id !== "string" || !campaign.product_id.trim())) {
    errors.push("promotional campaigns must reference an approved product.");
  }
  if (campaign?.campaign_type === "organic" && campaign?.product_id) {
    errors.push("organic campaigns must not reference a product.");
  }
  if (campaign?.policy_review_passed !== true) errors.push("the exact post must pass human Meta policy review.");
  if (campaign?.content_accuracy_confirmed !== true) errors.push("all factual and product claims must be human-verified.");
  if (campaign?.brand_fit_confirmed !== true) errors.push("the post must be confirmed appropriate for the Nature Frontiers audience.");
  if (campaign?.campaign_type === "organic" && campaign?.wildlife_welfare_confirmed !== true) errors.push("wildlife content must confirm no baiting, harassment, handling, staging or disturbance of animals.");
  if (campaign?.campaign_type === "organic" && campaign?.non_graphic_review_passed !== true) errors.push("wildlife content must pass a human non-graphic imagery review.");
  const review = campaign?.human_review;
  if (!review || review.approved !== true || !isNonEmptyString(review.reviewer) ||
      !isNonEmptyString(review.reviewed_at) || !Number.isFinite(Date.parse(review.reviewed_at)) ||
      !isSha256(review.release_sha256) || review.release_sha256 !== createFeedReviewDigest(campaign)) {
    errors.push("feed approval requires a named, timestamped human review bound to the exact release metadata SHA-256.");
  }
  if (campaign?.media?.length || campaign?.media_url) {
    if (campaign?.media_rights_confirmed !== true) errors.push("all attached media must have human-confirmed rights clearance.");
    if (campaign?.media_originality_confirmed !== true) errors.push("all attached media must pass human originality review.");
    errors.push("feed media attachments are not supported by this adapter; refusing to silently publish a text-only version.");
  }
  return errors;
}
