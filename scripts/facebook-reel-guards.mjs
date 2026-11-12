const isSha256 = (value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const isSafeHttpsUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) &&
      !url.username && !url.password && !url.hash && !url.port &&
      url.hostname !== "localhost" && !url.hostname.endsWith(".localhost") &&
      !url.hostname.endsWith(".local") && !url.hostname.endsWith(".internal");
  } catch {
    return false;
  }
};
const isAllowedFacebookEpisodeUrl = (value) => {
  if (!isSafeHttpsUrl(value)) return false;
  const url = new URL(value);
  return ["facebook.com", "www.facebook.com", "m.facebook.com", "fb.watch"].includes(url.hostname);
};

export function validateReelCampaign(campaign) {
  const errors = [];
  if (!campaign || campaign.network !== "facebook") errors.push("campaign must target Facebook.");
  if (campaign?.status !== "approved") errors.push("campaign must be explicitly approved.");
  if (campaign?.facebook_type !== "REEL") errors.push("campaign must explicitly declare facebook_type=REEL.");
  if (typeof campaign?.id !== "string" || !campaign.id.trim()) errors.push("campaign needs a stable id.");
  if (typeof campaign?.caption !== "string" || !campaign.caption.trim()) errors.push("campaign needs a caption.");
  if (typeof campaign?.title !== "string" || !campaign.title.trim()) errors.push("campaign needs a Reel title.");
  if (typeof campaign?.media_url !== "string" || !isSafeHttpsUrl(campaign.media_url)) errors.push("media_url must be a public HTTPS URL without credentials, fragments, or non-standard ports.");
  if (campaign?.media_rights_confirmed !== true) errors.push("media rights must be explicitly human-confirmed.");
  if (campaign?.originality_confirmed !== true) errors.push("media originality must be explicitly human-confirmed.");
  if (campaign?.policy_review_passed !== true) errors.push("the exact Reel and caption must pass human policy review.");
  if (campaign?.wildlife_welfare_confirmed !== true) errors.push("wildlife footage must confirm no baiting, harassment, handling, staging or disturbance of animals.");
  if (campaign?.non_graphic_review_passed !== true) errors.push("wildlife footage must pass a human non-graphic imagery review.");
  if (campaign?.media_accessibility_confirmed !== true) errors.push("public media URL accessibility must be verified.");
  if (campaign?.media_technical_review_passed !== true) errors.push("media technical specifications must be reviewed and confirmed.");
  if (!isSha256(campaign?.media_sha256)) errors.push("a verified 64-character SHA-256 media hash is required.");
  for (const [field, label] of [
    ["script_sha256", "approved script"],
    ["voiceover_sha256", "final voiceover"],
    ["captions_sha256", "final captions"],
    ["thumbnail_sha256", "final thumbnail"],
    ["metadata_sha256", "approved metadata"]
  ]) {
    if (!isSha256(campaign?.[field])) errors.push(label + " must have a verified SHA-256 hash.");
  }
  if (typeof campaign?.media_rights_evidence_ref !== "string" || !campaign.media_rights_evidence_ref.trim()) errors.push("video footage rights must include a licence or ownership evidence reference.");
  if (typeof campaign?.audio_rights_evidence_ref !== "string" || !campaign.audio_rights_evidence_ref.trim()) errors.push("music and sound-effect rights must include a licence or ownership evidence reference.");
  if (!Array.isArray(campaign?.fact_check_sources) || campaign.fact_check_sources.length === 0 ||
      campaign.fact_check_sources.some((source) => !isSafeHttpsUrl(source))) {
    errors.push("at least one HTTPS fact-check source is required.");
  }
  if (campaign?.human_review_confirmed !== true) errors.push("the exact final Reel must receive recorded human approval.");
  const review = campaign?.human_review;
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    errors.push("a hash-bound human-review record is required.");
  } else {
    if (typeof review.reviewer !== "string" || !review.reviewer.trim() ||
        typeof review.reviewed_at !== "string" || !Number.isFinite(Date.parse(review.reviewed_at))) {
      errors.push("the human-review record requires a named reviewer and valid timestamp.");
    }
    for (const [reviewField, campaignField] of [
      ["video_sha256", "media_sha256"],
      ["script_sha256", "script_sha256"],
      ["voiceover_sha256", "voiceover_sha256"],
      ["captions_sha256", "captions_sha256"],
      ["thumbnail_sha256", "thumbnail_sha256"],
      ["metadata_sha256", "metadata_sha256"]
    ]) {
      if (!isSha256(review[reviewField]) || review[reviewField].toLowerCase() !== String(campaign?.[campaignField] ?? "").toLowerCase()) {
        errors.push("human review must be bound to the exact approved " + campaignField.replaceAll("_sha256", "") + " SHA-256.");
      }
    }
  }
  if (typeof campaign?.related_longform_campaign_id !== "string" || !campaign.related_longform_campaign_id.trim()) errors.push("Reel must reference its parent long-form video campaign.");
  if (typeof campaign?.full_video_url !== "string") errors.push("Reel must include the URL of its already-published full video.");
  else {
    try {
      const fullUrl = new URL(campaign.full_video_url);
      if (!isAllowedFacebookEpisodeUrl(campaign.full_video_url) || !campaign.caption.includes(campaign.full_video_url)) errors.push("Reel caption must include the exact HTTPS Facebook URL of the full video.");
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

export function isReelPublishedForPage(payload, expectedVideoId, expectedPageId) {
  return isReelPublished(payload) &&
    payload?.id === expectedVideoId &&
    payload?.from?.id === expectedPageId &&
    typeof payload?.permalink_url === "string" &&
    payload.permalink_url.startsWith("https://");
}

export function isReelPublished(payload) {
  // A completed publishing phase can still represent a scheduled or draft Reel.
  // Require Meta's explicit published state; upload/processing completion is not enough.
  return payload?.status?.publishing_phase?.publish_status === "published";
}
