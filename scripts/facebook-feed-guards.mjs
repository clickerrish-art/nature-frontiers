export function validateFeedRelease(campaign) {
  const errors = [];
  if (!campaign || campaign.network !== "facebook") errors.push("campaign must target Facebook.");
  if (campaign?.status !== "approved") errors.push("campaign must be explicitly approved.");
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
  if (campaign?.media?.length || campaign?.media_url) {
    if (campaign?.media_rights_confirmed !== true) errors.push("all attached media must have human-confirmed rights clearance.");
    if (campaign?.media_originality_confirmed !== true) errors.push("all attached media must pass human originality review.");
    errors.push("feed media attachments are not supported by this adapter; refusing to silently publish a text-only version.");
  }
  return errors;
}
