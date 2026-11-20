const MIN_SECONDS = 180;
const MAX_SECONDS = 480;

function isHttpsPublicCandidate(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.port &&
      url.hostname !== "localhost" &&
      !url.hostname.endsWith(".localhost") &&
      !url.hostname.endsWith(".local") &&
      !url.hostname.endsWith(".internal");
  } catch {
    return false;
  }
}

export function validateLongFormVideoCampaign(campaign) {
  const errors = [];
  const caption = typeof campaign?.caption === "string" ? campaign.caption : "";
  if (!campaign || campaign.network !== "facebook") errors.push("campaign must target Facebook.");
  if (campaign?.status !== "approved") errors.push("campaign must be explicitly approved by a human.");
  if (campaign?.campaign_type !== "organic") errors.push("long-form wildlife videos must be organic campaigns.");
  if (campaign?.facebook_type !== "VIDEO") errors.push("campaign must explicitly declare facebook_type=VIDEO.");
  if (typeof campaign?.id !== "string" || !campaign.id.trim()) errors.push("campaign needs a stable id.");
  if (typeof campaign?.title !== "string" || !campaign.title.trim() || campaign.title.length > 255) errors.push("campaign needs a title of 1–255 characters.");
  if (typeof campaign?.caption !== "string" || !campaign.caption.trim() || campaign.caption.length > 60000) errors.push("campaign needs a caption of 1–60,000 characters.");
  if (typeof campaign?.hook_0_3s !== "string" || !campaign.hook_0_3s.trim()) errors.push("campaign needs a documented first-three-second hook.");
  if (!Number.isFinite(campaign?.hook_duration_seconds) || campaign.hook_duration_seconds < 15 || campaign.hook_duration_seconds > 60) {
    errors.push("the opening hook must have a documented 15–60 second editorial window before any ad break.");
  }
  const hasSeriesMetadata = Boolean(campaign?.series_id || campaign?.series_title || campaign?.series_arc || campaign?.episode_number || campaign?.episode_title);
  if (campaign?.series_requires_parent === true || hasSeriesMetadata) {
    if (typeof campaign?.series_id !== "string" || !campaign.series_id.trim() ||
        typeof campaign?.series_title !== "string" || !campaign.series_title.trim() ||
        typeof campaign?.series_arc !== "string" || !campaign.series_arc.trim() ||
        !Number.isInteger(campaign?.episode_number) || campaign.episode_number < 1) {
      errors.push("series-linked long-form videos require a named series, positive episode number and documented series arc.");
    }
    if (typeof campaign?.episode_title !== "string" || !campaign.episode_title.trim() ||
        typeof campaign?.next_episode_teaser !== "string" || !campaign.next_episode_teaser.trim() ||
        typeof campaign?.next_episode_cta !== "string" || !campaign.next_episode_cta.trim()) {
      errors.push("series-linked long-form videos require an episode title, next-episode teaser and series CTA.");
    }
  }
  const productLinks = Array.isArray(campaign?.product_links) ? campaign.product_links : [];
  if (productLinks.length > 0) {
    if (campaign?.product_links_verified !== true || typeof campaign?.product_verification_note !== "string" || !campaign.product_verification_note.trim()) {
      errors.push("optional product links must be human-verified and accompanied by a verification note.");
    }
    if (productLinks.some((link) => typeof link !== "string" || !isHttpsPublicCandidate(link) || !caption.includes(link))) {
      errors.push("every supplied product link must be a valid HTTPS URL and appear verbatim in the description.");
    }
    if (typeof campaign?.product_disclosure !== "string" || !campaign.product_disclosure.trim() || !caption.includes(campaign.product_disclosure)) {
      errors.push("product links require their matching paid-product disclosure in the description.");
    }
  }
  const affiliateLinks = Array.isArray(campaign?.affiliate_links) ? campaign.affiliate_links : [];
  if (affiliateLinks.length > 0) {
    if (campaign?.affiliate_links_verified !== true || typeof campaign?.affiliate_verification_note !== "string" || !campaign.affiliate_verification_note.trim()) {
      errors.push("optional affiliate links must be human-verified and accompanied by a verification note.");
    }
    if (affiliateLinks.some((link) => typeof link !== "string" || !isHttpsPublicCandidate(link) || !caption.includes(link))) {
      errors.push("every supplied affiliate link must be a valid HTTPS URL and appear verbatim in the description.");
    }
    if (typeof campaign?.affiliate_disclosure !== "string" || !campaign.affiliate_disclosure.trim() || !caption.includes(campaign.affiliate_disclosure)) {
      errors.push("affiliate links require their explicit affiliate disclosure in the description.");
    }
  }
  if (typeof campaign?.script_text !== "string") errors.push("campaign needs its complete original narration script.");
  else {
    const words = campaign.script_text.trim().split(/\s+/).filter(Boolean).length;
    if (words < 300 || words > 1500) errors.push("long-form narration script must contain 300–1,500 words for a 3–8 minute production.");
    if (typeof campaign?.hook_0_3s === "string" && !campaign.script_text.trim().startsWith(campaign.hook_0_3s.trim())) {
      errors.push("the opening narration must begin with the approved first-three-second hook.");
    }
  }
  if (!Number.isFinite(campaign?.duration_seconds) || campaign.duration_seconds < MIN_SECONDS || campaign.duration_seconds > MAX_SECONDS) {
    errors.push("long-form video duration must be between 180 and 480 seconds (3–8 minutes).");
  }
  if (typeof campaign?.media_url !== "string" || !isHttpsPublicCandidate(campaign.media_url)) {
    errors.push("media_url must be a public HTTPS URL without credentials, fragments, or non-standard ports.");
  }
  if (typeof campaign?.media_sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(campaign.media_sha256)) {
    errors.push("a verified 64-character SHA-256 media hash is required.");
  }
  if (campaign?.media_url_immutable_confirmed !== true) errors.push("the media URL must be human-confirmed immutable between verification and Meta retrieval.");
  const requiredReviews = [
    ["script_originality_confirmed", "the complete script must pass human originality review."],
    ["voiceover_originality_confirmed", "voiceover must be original or appropriately licensed."],
    ["media_rights_confirmed", "all video footage must have human-confirmed commercial rights."],
    ["media_integrity_review_passed", "all visuals must pass human media-integrity review."],
    ["audio_rights_confirmed", "all music and sound effects must be cleared for commercial use."],
    ["policy_review_passed", "the exact video, thumbnail and caption must pass human Meta policy review."],
    ["content_accuracy_confirmed", "species identification and factual claims must be human-verified."],
    ["wildlife_welfare_confirmed", "footage must confirm no baiting, harassment, handling, staging or disturbance of animals."],
    ["non_graphic_review_passed", "the finished video must pass a human non-graphic imagery review."],
    ["thumbnail_accuracy_confirmed", "the thumbnail must accurately represent the actual episode."],
    ["media_technical_review_passed", "the final export must pass human technical review."],
    ["watermark_scan_passed", "the final export must pass a clean watermark scan."],
    ["human_review_confirmed", "the exact final export must receive human approval."]
  ];
  for (const [field, message] of requiredReviews) if (campaign?.[field] !== true) errors.push(message);
  if (campaign?.audio_present !== true && campaign?.audio_present !== false) errors.push("media must explicitly declare whether audio is present.");
  if (campaign?.audio_present === true && (campaign?.audio_license_status !== "licensed" || !campaign?.audio_license_ref)) errors.push("media audio requires verified licence evidence.");

  if (campaign?.synthetic_visuals !== false) errors.push("AI-generated or synthetic wildlife visuals are prohibited; synthetic_visuals must be false.");
  if (campaign?.ai_generated_video !== false) errors.push("AI-generated video must be explicitly false.");
  if (campaign?.media_origin === "licensed_stock") {
    if (campaign?.wildlife_media_policy !== "licensed_stock_allowed") errors.push("licensed stock requires the owner-approved licensed_stock_allowed wildlife media policy.");
    if (campaign?.stock_footage_used !== true) errors.push("licensed_stock media_origin requires stock_footage_used=true.");
    if (typeof campaign?.source_url !== "string" || !campaign.source_url.trim() || !isHttpsPublicCandidate(campaign.source_url)) errors.push("licensed stock requires its original public HTTPS source-page URL.");
    if (typeof campaign?.source_creator !== "string" || !campaign.source_creator.trim()) errors.push("licensed stock requires the credited creator.");
    if (typeof campaign?.license_name !== "string" || !campaign.license_name.trim()) errors.push("licensed stock requires the exact licence name.");
    if (typeof campaign?.license_evidence_url !== "string" || !isHttpsPublicCandidate(campaign.license_evidence_url)) errors.push("licensed stock requires a public HTTPS licence evidence URL.");
    if (campaign?.provenance_review_passed !== true) errors.push("stock provenance and licence must pass human review.");
    if (typeof campaign?.provenance_reviewer !== "string" || !campaign.provenance_reviewer.trim()) errors.push("a named provenance reviewer is required.");
    if (typeof campaign?.provenance_reviewed_at !== "string" || !Number.isFinite(Date.parse(campaign.provenance_reviewed_at))) errors.push("a valid provenance review timestamp is required.");
    if (campaign?.on_screen_disclosure_confirmed !== true) errors.push("licensed stock requires a confirmed on-screen disclosure against the final media hash.");
    if (typeof campaign?.on_screen_disclosure_text !== "string" || !/licensed stock footage/i.test(campaign.on_screen_disclosure_text)) errors.push("on-screen disclosure must clearly identify licensed stock footage.");
    if (typeof campaign?.caption_attribution !== "string" || !campaign.caption_attribution.trim() || !caption.includes(campaign.caption_attribution)) errors.push("licensed stock requires exact creator/source attribution in the caption or rendered credits.");
  } else if (campaign?.media_origin === "original_camera_recording") {
    if (campaign?.stock_footage_used !== false) errors.push("original camera recordings must explicitly set stock_footage_used=false.");
    if (campaign?.media_originality_confirmed !== true) errors.push("original camera visuals must pass human originality review.");
    if (typeof campaign?.source_recording_id !== "string" || !campaign.source_recording_id.trim()) errors.push("an identifiable original camera source recording is required.");
    if (typeof campaign?.original_camera_file_sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(campaign.original_camera_file_sha256)) errors.push("the retained original camera file must have a verified SHA-256 hash.");
    if (campaign?.original_recording_retained !== true) errors.push("the unedited original camera recording must be retained.");
    if (campaign?.provenance_review_passed !== true) errors.push("original camera provenance must pass human review before release.");
    if (typeof campaign?.provenance_reviewer !== "string" || !campaign.provenance_reviewer.trim()) errors.push("a named provenance reviewer is required.");
    if (typeof campaign?.provenance_reviewed_at !== "string" || !Number.isFinite(Date.parse(campaign.provenance_reviewed_at))) errors.push("a valid provenance review timestamp is required.");
  } else {
    errors.push("media_origin must be licensed_stock or original_camera_recording.");
  }

  if (!Array.isArray(campaign?.fact_check_sources) || campaign.fact_check_sources.length === 0 ||
      campaign.fact_check_sources.some((source) => typeof source !== "string" || !isHttpsPublicCandidate(source))) {
    errors.push("at least one HTTPS fact-check source is required; every source must be a URL.");
  }
  if (!Array.isArray(campaign?.retention_beats_seconds) || campaign.retention_beats_seconds.length < 3 ||
      campaign.retention_beats_seconds.some((value) => !Number.isFinite(value) || value < 40 || value >= campaign.duration_seconds) ||
      campaign.retention_beats_seconds.some((value, index, values) => index > 0 && (value <= values[index - 1] || value - values[index - 1] > 75))) {
    errors.push("curiosity beats must be timestamped in ascending order, at least three, with no gap over 75 seconds.");
  }
  if (campaign?.series_requires_parent === true && (typeof campaign?.next_episode_cta !== "string" || !campaign.next_episode_cta.trim())) {
    errors.push("series-linked episodes must direct viewers to a relevant next episode or series playlist.");
  }

  const breaks = campaign?.editorial_ad_breaks_seconds;
  const expectedCount = campaign?.monetization_enabled === true
    ? (Number.isFinite(campaign?.duration_seconds) && campaign.duration_seconds >= 420 ? 2 : 1)
    : 0;
  if (expectedCount > 0 && (!Array.isArray(breaks) || breaks.length !== expectedCount ||
      breaks.some((value) => !Number.isFinite(value) || value < 90 || value > campaign.duration_seconds - 45) ||
      breaks.some((value, index, values) => index > 0 && (value <= values[index - 1] || value - values[index - 1] < 120)) ||
      (breaks.length > 0 && (!Number.isFinite(campaign?.hook_duration_seconds) || breaks[0] < campaign.hook_duration_seconds + 60 || breaks[0] < 90)))) {
    errors.push("monetized long-form videos require valid natural-transition ad-break markers after the opening hook.");
  }
  if (expectedCount > 0 && (!Array.isArray(campaign?.editorial_ad_break_notes) ||
      campaign.editorial_ad_break_notes.length !== expectedCount ||
      campaign.editorial_ad_break_notes.some((note) => typeof note !== "string" || !note.trim()))) {
    errors.push("each monetized ad-break marker needs an editorial transition note.");
  }
  if (expectedCount === 0 && ((Array.isArray(breaks) && breaks.length > 0) ||
      (Array.isArray(campaign?.editorial_ad_break_notes) && campaign.editorial_ad_break_notes.length > 0))) {
    errors.push("ad-break markers must not be supplied unless monetization_enabled is explicitly true.");
  }

  return errors;
}

/**
 * Meta Page Videos accepts ad_breaks as time offsets in milliseconds.
 * These are explicit requested offsets, not a guarantee Meta will serve ads.
 */
export function toMetaAdBreakOffsetsMilliseconds(campaign) {
  if (campaign?.monetization_enabled !== true) return [];
  if (!Array.isArray(campaign?.editorial_ad_breaks_seconds) ||
      campaign.editorial_ad_breaks_seconds.length === 0 ||
      campaign.editorial_ad_breaks_seconds.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("Valid editorial ad-break offsets are required before creating Meta ad-break markers.");
  }
  return campaign.editorial_ad_breaks_seconds.map((seconds) => Math.round(seconds * 1000));
}
