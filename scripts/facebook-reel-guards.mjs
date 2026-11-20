export function validateReelCampaign(campaign) {
  const errors = [];
  const caption = typeof campaign?.caption === "string" ? campaign.caption : "";
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
  if (campaign?.policy_review_passed !== true) errors.push("the exact Reel and caption must pass human policy review.");
  if (campaign?.wildlife_welfare_confirmed !== true) errors.push("wildlife footage must confirm no baiting, harassment, handling, staging or disturbance of animals.");
  if (campaign?.non_graphic_review_passed !== true) errors.push("wildlife footage must pass a human non-graphic imagery review.");
  if (campaign?.media_accessibility_confirmed !== true) errors.push("public media URL accessibility must be verified.");
  if (campaign?.media_technical_review_passed !== true) errors.push("media technical specifications must be reviewed and confirmed.");
  if (typeof campaign?.media_sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(campaign.media_sha256)) errors.push("a verified 64-character SHA-256 media hash is required.");

  if (campaign?.synthetic_visuals !== false) errors.push("AI-generated or synthetic wildlife visuals are prohibited; synthetic_visuals must be false.");
  if (campaign?.ai_generated_video !== false) errors.push("AI-generated video must be explicitly false.");

  if (campaign?.media_origin === "licensed_stock") {
    if (campaign?.wildlife_media_policy !== "licensed_stock_allowed") errors.push("licensed stock requires the owner-approved licensed_stock_allowed wildlife media policy.");
    if (campaign?.stock_footage_used !== true) errors.push("licensed_stock media_origin requires stock_footage_used=true.");
    if (typeof campaign?.source_url !== "string" || !campaign.source_url.trim()) errors.push("licensed stock requires its original source-page URL.");
    else {
      try { const source = new URL(campaign.source_url); if (source.protocol !== "https:") errors.push("stock source URL must use HTTPS."); }
      catch { errors.push("stock source URL must be valid HTTPS."); }
    }
    if (typeof campaign?.source_creator !== "string" || !campaign.source_creator.trim()) errors.push("licensed stock requires the credited creator.");
    if (typeof campaign?.license_name !== "string" || !campaign.license_name.trim()) errors.push("licensed stock requires the exact licence name.");
    if (typeof campaign?.license_evidence_url !== "string") errors.push("licensed stock requires a licence evidence URL.");
    else {
      try { const license = new URL(campaign.license_evidence_url); if (license.protocol !== "https:") errors.push("licence evidence URL must use HTTPS."); }
      catch { errors.push("licence evidence URL must be valid HTTPS."); }
    }
    if (campaign?.provenance_review_passed !== true) errors.push("stock provenance and licence must pass human review.");
    if (typeof campaign?.provenance_reviewer !== "string" || !campaign.provenance_reviewer.trim()) errors.push("a named provenance reviewer is required.");
    if (typeof campaign?.provenance_reviewed_at !== "string" || !Number.isFinite(Date.parse(campaign.provenance_reviewed_at))) errors.push("a valid provenance review timestamp is required.");
    if (campaign?.on_screen_disclosure_confirmed !== true) errors.push("licensed stock requires a confirmed on-screen disclosure.");
    if (typeof campaign?.on_screen_disclosure_text !== "string" || !/licensed stock footage/i.test(campaign.on_screen_disclosure_text)) errors.push("on-screen disclosure must clearly identify licensed stock footage.");
    if (typeof campaign?.caption_attribution !== "string" || !campaign.caption_attribution.trim()) errors.push("licensed stock requires creator/source attribution in the caption or credits.");
  } else if (campaign?.media_origin === "original_camera_recording") {
    if (campaign?.stock_footage_used !== false) errors.push("original camera recordings must explicitly set stock_footage_used=false.");
    if (typeof campaign?.source_recording_id !== "string" || !campaign.source_recording_id.trim()) errors.push("an identifiable original camera source recording is required.");
    if (typeof campaign?.original_camera_file_sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(campaign.original_camera_file_sha256)) errors.push("the retained original camera file must have a verified SHA-256 hash.");
    if (campaign?.original_recording_retained !== true) errors.push("the unedited original camera recording must be retained.");
    if (campaign?.provenance_review_passed !== true) errors.push("original camera provenance must pass human review before release.");
    if (typeof campaign?.provenance_reviewer !== "string" || !campaign.provenance_reviewer.trim()) errors.push("a named provenance reviewer is required.");
    if (typeof campaign?.provenance_reviewed_at !== "string" || !Number.isFinite(Date.parse(campaign.provenance_reviewed_at))) errors.push("a valid provenance review timestamp is required.");
  } else {
    errors.push("media_origin must be licensed_stock or original_camera_recording.");
  }

  if (campaign?.series_requires_parent === true) {
    if (typeof campaign?.related_longform_campaign_id !== "string" || !campaign.related_longform_campaign_id.trim()) errors.push("series-linked Reel requires a parent long-form campaign id.");
    if (typeof campaign?.full_video_url !== "string") errors.push("series-linked Reel requires the published full-video URL.");
    else {
      try {
        const fullUrl = new URL(campaign.full_video_url);
        if (fullUrl.protocol !== "https:" || !caption.includes(campaign.full_video_url)) errors.push("Reel caption must include the exact HTTPS URL of the full video.");
      } catch { errors.push("full_video_url must be a valid HTTPS URL."); }
    }
  }

  const affiliateLinks = Array.isArray(campaign?.affiliate_links) ? campaign.affiliate_links : [];
  if (affiliateLinks.length > 0) {
    if (campaign?.affiliate_links_verified !== true || typeof campaign?.affiliate_verification_note !== "string" || !campaign.affiliate_verification_note.trim()) errors.push("affiliate URLs require human verification evidence.");
    if (typeof campaign?.affiliate_disclosure !== "string" || !campaign.affiliate_disclosure.trim() || !caption.includes(campaign.affiliate_disclosure)) errors.push("affiliate links require a matching disclosure in the caption.");
    for (const link of affiliateLinks) {
      try { if (new URL(link).protocol !== "https:" || !caption.includes(link)) errors.push("every supplied affiliate link must be HTTPS and appear verbatim in the caption."); }
      catch { errors.push("affiliate links must be valid HTTPS URLs."); }
    }
  }
  const productLinks = Array.isArray(campaign?.product_links) ? campaign.product_links : [];
  if (productLinks.length > 0) {
    if (typeof campaign?.product_disclosure !== "string" || !campaign.product_disclosure.trim() || !caption.includes(campaign.product_disclosure)) errors.push("paid product links require a matching disclosure in the caption.");
    for (const link of productLinks) {
      try { if (new URL(link).protocol !== "https:" || !caption.includes(link)) errors.push("every supplied product link must be HTTPS and appear verbatim in the caption."); }
      catch { errors.push("product links must be valid HTTPS URLs."); }
    }
  }
  if (campaign?.caption?.length > 60000) errors.push("caption exceeds the platform-safe input limit.");
  if (campaign?.title?.length > 255) errors.push("title exceeds the platform-safe input limit.");
  return errors;
}

export function isReelPublished(payload) {
  return payload?.status?.publishing_phase?.publish_status === "published";
}
