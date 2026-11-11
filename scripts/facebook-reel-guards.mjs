export function validateReelCampaign(campaign) {
  const errors = [];
  if (!campaign || campaign.network !== "facebook") errors.push("campaign must target Facebook.");
  if (campaign?.status !== "approved") errors.push("campaign must be explicitly approved.");
  if (campaign?.facebook_type !== "REEL") errors.push("campaign must explicitly declare facebook_type=REEL.");
  if (typeof campaign?.id !== "string" || !campaign.id.trim()) errors.push("campaign needs a stable id.");
  if (typeof campaign?.caption !== "string" || !campaign.caption.trim()) errors.push("campaign needs a caption.");
  if (typeof campaign?.title !== "string" || !campaign.title.trim()) errors.push("campaign needs a Reel title.");
  if (typeof campaign?.media_url !== "string") errors.push("campaign needs a public media_url.");
  try {
    const url = new URL(campaign.media_url);
    if (url.protocol !== "https:" || !url.hostname || url.hostname === "localhost") errors.push("media_url must be a public HTTPS URL.");
  } catch { errors.push("media_url must be a valid public HTTPS URL."); }
  if (campaign?.media_rights_confirmed !== true) errors.push("media rights must be explicitly human-confirmed.");
  if (campaign?.originality_confirmed !== true) errors.push("media originality must be explicitly human-confirmed.");
  if (campaign?.policy_review_passed !== true) errors.push("the exact Reel and caption must pass human policy review.");
  if (campaign?.media_accessibility_confirmed !== true) errors.push("public media URL accessibility must be verified.");
  if (campaign?.media_technical_review_passed !== true) errors.push("media technical specifications must be reviewed and confirmed.");
  if (typeof campaign?.media_sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(campaign.media_sha256)) errors.push("a verified 64-character SHA-256 media hash is required.");
  if (campaign?.synthetic_visuals === true) {
    if (typeof campaign?.ai_disclosure !== "string" || !campaign.ai_disclosure.trim()) errors.push("synthetic visuals require an explicit AI/illustrative disclosure.");
    else if (!campaign.caption.includes(campaign.ai_disclosure)) errors.push("caption must contain the exact AI/illustrative disclosure.");
  }
  if (campaign?.synthetic_visuals !== true && campaign?.synthetic_visuals !== false) errors.push("synthetic_visuals must be explicitly true or false.");
  if (campaign?.caption?.length > 60000) errors.push("caption exceeds the platform-safe input limit.");
  if (campaign?.title?.length > 255) errors.push("title exceeds the platform-safe input limit.");
  return errors;
}

export function isReelPublished(payload) {
  // A completed publishing phase can still represent a scheduled or draft Reel.
  // Require Meta's explicit published state; upload/processing completion is not enough.
  return payload?.status?.publishing_phase?.publish_status === "published";
}
