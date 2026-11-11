import { NATURE_FRONTIERS_YOUTUBE_URL, REQUIRED_PRODUCT_LINKS, APPROVED_AFFILIATE_LINKS, AFFILIATE_DISCLOSURE, PRODUCT_DISCLOSURE } from "./video-description.mjs";

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
  if (typeof campaign?.series_id !== "string" || !campaign.series_id.trim() ||
      typeof campaign?.series_title !== "string" || !campaign.series_title.trim() ||
      typeof campaign?.series_arc !== "string" || !campaign.series_arc.trim() ||
      !Number.isInteger(campaign?.episode_number) || campaign.episode_number < 1) {
    errors.push("every long-form video must belong to a named series with a positive episode number and a documented series arc.");
  }
  if (typeof campaign?.episode_title !== "string" || !campaign.episode_title.trim() ||
      typeof campaign?.next_episode_teaser !== "string" || !campaign.next_episode_teaser.trim()) {
    errors.push("every series episode needs its own episode title and a teaser for the next episode.");
  }
  if (typeof campaign?.caption !== "string" || !caption.includes(NATURE_FRONTIERS_YOUTUBE_URL)) {
    errors.push("every video description must include the Nature Frontiers YouTube channel link: " + NATURE_FRONTIERS_YOUTUBE_URL);
  }
  if (!Array.isArray(campaign?.product_links) ||
      REQUIRED_PRODUCT_LINKS.some((item) => !campaign.product_links.includes(item.url)) ||
      REQUIRED_PRODUCT_LINKS.some((item) => !caption.includes(item.url))) {
    errors.push("every video description must include all six owner-catalogued Selar product URLs verbatim.");
  }
  if (!Array.isArray(campaign?.affiliate_links) ||
      APPROVED_AFFILIATE_LINKS.some((link) => !campaign.affiliate_links.includes(link)) ||
      APPROVED_AFFILIATE_LINKS.some((link) => !caption.includes(link)) ||
      campaign.affiliate_links.some((link) => typeof link !== "string" || !isHttpsPublicCandidate(link))) {
    errors.push("every video description must include all five owner-approved Safari.com affiliate URLs verbatim, preserving the a=GM26 tracking parameter.");
  }
  if (campaign?.affiliate_links_verified !== true ||
      typeof campaign?.affiliate_verification_note !== "string" || !campaign.affiliate_verification_note.trim()) {
    errors.push("affiliate tracking links must be human-verified and accompanied by a verification note before release.");
  }
  if (campaign?.affiliate_disclosure !== AFFILIATE_DISCLOSURE ||
      !caption.includes(AFFILIATE_DISCLOSURE)) {
    errors.push("every video description must include the standard explicit affiliate disclosure verbatim.");
  }
  if (campaign?.product_disclosure !== PRODUCT_DISCLOSURE ||
      !caption.includes(PRODUCT_DISCLOSURE)) {
    errors.push("every video description must include the standard paid-product disclosure verbatim.");
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
    ["media_originality_confirmed", "visuals must pass human originality review."],
    ["audio_rights_confirmed", "all music and sound effects must be cleared for commercial use."],
    ["policy_review_passed", "the exact video, thumbnail and caption must pass human Meta policy review."],
    ["content_accuracy_confirmed", "species identification and factual claims must be human-verified."],
    ["wildlife_welfare_confirmed", "footage must confirm no baiting, harassment, handling, staging or disturbance of animals."],
    ["non_graphic_review_passed", "the finished video must pass a human non-graphic imagery review."],
    ["thumbnail_accuracy_confirmed", "the thumbnail must accurately represent the actual episode."],
    ["media_technical_review_passed", "the final export must pass human technical review."],
    ["human_review_confirmed", "the exact final export must receive human approval."]
  ];
  for (const [field, message] of requiredReviews) if (campaign?.[field] !== true) errors.push(message);

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

  if (!Array.isArray(campaign?.fact_check_sources) || campaign.fact_check_sources.length === 0 ||
      campaign.fact_check_sources.some((source) => typeof source !== "string" || !isHttpsPublicCandidate(source))) {
    errors.push("at least one HTTPS fact-check source is required; every source must be a URL.");
  }
  if (!Array.isArray(campaign?.retention_beats_seconds) || campaign.retention_beats_seconds.length < 3 ||
      campaign.retention_beats_seconds.some((value) => !Number.isFinite(value) || value < 40 || value >= campaign.duration_seconds) ||
      campaign.retention_beats_seconds.some((value, index, values) => index > 0 && (value <= values[index - 1] || value - values[index - 1] > 75))) {
    errors.push("curiosity beats must be timestamped in ascending order, at least three, with no gap over 75 seconds.");
  }
  if (typeof campaign?.next_episode_cta !== "string" || !campaign.next_episode_cta.trim()) {
    errors.push("the ending must direct viewers to a relevant next episode or series playlist.");
  }

  const breaks = campaign?.editorial_ad_breaks_seconds;
  const expectedCount = Number.isFinite(campaign?.duration_seconds) && campaign.duration_seconds >= 420 ? 2 : 1;
  if (!Array.isArray(breaks) || breaks.length !== expectedCount ||
      breaks.some((value) => !Number.isFinite(value) || value < 90 || value > campaign.duration_seconds - 45) ||
      breaks.some((value, index, values) => index > 0 && (value <= values[index - 1] || value - values[index - 1] < 120)) ||
      (Array.isArray(breaks) && breaks.length > 0 && (!Number.isFinite(campaign?.hook_duration_seconds) || breaks[0] < campaign.hook_duration_seconds + 60 || breaks[0] < 90))) {
    errors.push("editorial ad-break markers must be one for 3–6:59 videos or two for 7–8 minute videos, placed at natural transitions after the opening hook and at least 120 seconds apart.");
  }
  if (!Array.isArray(campaign?.editorial_ad_break_notes) ||
      campaign.editorial_ad_break_notes.length !== expectedCount ||
      campaign.editorial_ad_break_notes.some((note) => typeof note !== "string" || !note.trim())) {
    errors.push("each proposed ad-break marker needs an editorial transition note.");
  }

  return errors;
}

/**
 * Meta Page Videos accepts ad_breaks as time offsets in milliseconds.
 * These are explicit requested offsets, not a guarantee Meta will serve ads.
 */
export function toMetaAdBreakOffsetsMilliseconds(campaign) {
  if (!Array.isArray(campaign?.editorial_ad_breaks_seconds) ||
      campaign.editorial_ad_breaks_seconds.length === 0 ||
      campaign.editorial_ad_breaks_seconds.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("Valid editorial ad-break offsets are required before creating Meta ad-break markers.");
  }
  return campaign.editorial_ad_breaks_seconds.map((seconds) => Math.round(seconds * 1000));
}
