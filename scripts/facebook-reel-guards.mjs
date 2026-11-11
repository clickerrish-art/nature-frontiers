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
  if (campaign?.wildlife_welfare_confirmed !== true) errors.push("wildlife footage must confirm no baiting, harassment, handling, staging or disturbance of animals.");
  if (campaign?.non_graphic_review_passed !== true) errors.push("wildlife footage must pass a human non-graphic imagery review.");
  if (campaign?.media_accessibility_confirmed !== true) errors.push("public media URL accessibility must be verified.");
  if (campaign?.media_technical_review_passed !== true) errors.push("media technical specifications must be reviewed and confirmed.");
  if (typeof campaign?.media_sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(campaign.media_sha256)) errors.push("a verified 64-character SHA-256 media hash is required.");
  if (typeof campaign?.related_longform_campaign_id !== "string" || !campaign.related_longform_campaign_id.trim()) errors.push("Reel must reference its parent long-form video campaign.");
  if (typeof campaign?.full_video_url !== "string") errors.push("Reel must include the URL of its already-published full video.");
  else {
    try {
      const fullUrl = new URL(campaign.full_video_url);
      if (fullUrl.protocol !== "https:" || !fullUrl.hostname || !campaign.caption.includes(campaign.full_video_url)) errors.push("Reel caption must include the exact HTTPS URL of the full video.");
    } catch { errors.push("full_video_url must be a valid HTTPS URL."); }
  }
  // Nature Frontiers accepts only genuine original wildlife camera recordings.
  // Disclosure never makes synthetic or stock wildlife footage eligible.
  if (campaign?.synthetic_visuals !== false) errors.push("AI-generated or synthetic wildlife visuals are prohibited; synthetic_visuals must be false.");
  if (campaign?.ai_generated_video !== false) errors.push("AI-generated video must be explicitly false.");
  if (campaign?.stock_footage_used !== false) errors.push("stock footage and stock-clip compilations are prohibited; stock_footage_used must be false.");
  if (campaign?.media_origin !== "original_camera_recording") errors.push("media_origin must be original_camera_recording.");
  if (typeof campaign?.source_recording_id !== "string" || !campaign.source_recording_id.trim()) errors.push("an identifiable original camera source recording is required.");
  if (typeof campaign?.original_camera_file_sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(campaign.original_camera_file_sha256)) errors.push("the retained original camera file must have a verified SHA-256 hash.");
  if (campaign?.original_recording_retained !== true) errors.push("the unedited original camera recording must be retained.");
  if (campaign?.provenance_review_passed !== true) errors.push("original camera provenance must pass human review before release.");
  if (typeof campaign?.provenance_reviewer !== "string" || !campaign.provenance_reviewer.trim()) errors.push("a named provenance reviewer is required.");
  if (typeof campaign?.provenance_reviewed_at !== "string" || !Number.isFinite(Date.parse(campaign.provenance_reviewed_at))) errors.push("a valid provenance review timestamp is required.");
  if (campaign?.caption?.length > 60000) errors.push("caption exceeds the platform-safe input limit.");
  if (campaign?.title?.length > 255) errors.push("title exceeds the platform-safe input limit.");
  return errors;
}

export function isReelPublished(payload) {
  // A completed publishing phase can still represent a scheduled or draft Reel.
  // Require Meta's explicit published state; upload/processing completion is not enough.
  return payload?.status?.publishing_phase?.publish_status === "published";
}
