const MIN_SECONDS = 300;
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
  if (!campaign || campaign.network !== "facebook") errors.push("campaign must target Facebook.");
  if (campaign?.status !== "approved") errors.push("campaign must be explicitly approved by a human.");
  if (campaign?.campaign_type !== "organic") errors.push("long-form wildlife videos must be organic campaigns.");
  if (campaign?.facebook_type !== "VIDEO") errors.push("campaign must explicitly declare facebook_type=VIDEO.");
  if (typeof campaign?.id !== "string" || !campaign.id.trim()) errors.push("campaign needs a stable id.");
  if (typeof campaign?.title !== "string" || !campaign.title.trim() || campaign.title.length > 255) errors.push("campaign needs a title of 1–255 characters.");
  if (typeof campaign?.caption !== "string" || !campaign.caption.trim() || campaign.caption.length > 60000) errors.push("campaign needs a caption of 1–60,000 characters.");
  if (typeof campaign?.hook_0_3s !== "string" || !campaign.hook_0_3s.trim()) errors.push("campaign needs a documented first-three-second hook.");
  if (typeof campaign?.script_text !== "string") errors.push("campaign needs its complete original narration script.");
  else {
    const words = campaign.script_text.trim().split(/\s+/).filter(Boolean).length;
    if (words < 500 || words > 1500) errors.push("long-form narration script must contain 500–1,500 words for a 5–8 minute production.");
  }
  if (!Number.isFinite(campaign?.duration_seconds) || campaign.duration_seconds < MIN_SECONDS || campaign.duration_seconds > MAX_SECONDS) {
    errors.push("long-form video duration must be between 300 and 480 seconds (5–8 minutes).");
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

  if (campaign?.synthetic_visuals !== true && campaign?.synthetic_visuals !== false) {
    errors.push("synthetic_visuals must be explicitly true or false.");
  }
  if (campaign?.synthetic_visuals === true) {
    if (typeof campaign?.ai_disclosure !== "string" || !campaign.ai_disclosure.trim()) {
      errors.push("synthetic visuals require a specific AI/illustrative disclosure.");
    } else if (!campaign.caption.includes(campaign.ai_disclosure)) {
      errors.push("caption must contain the exact AI/illustrative disclosure.");
    }
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
  if (typeof campaign?.next_episode_cta !== "string" || !campaign.next_episode_cta.trim()) {
    errors.push("the ending must direct viewers to a relevant next episode or series playlist.");
  }

  const breaks = campaign?.editorial_ad_breaks_seconds;
  const expectedCount = Number.isFinite(campaign?.duration_seconds) && campaign.duration_seconds >= 420 ? 2 : 1;
  if (!Array.isArray(breaks) || breaks.length !== expectedCount ||
      breaks.some((value) => !Number.isFinite(value) || value < 140 || value > campaign.duration_seconds - 45) ||
      breaks.some((value, index, values) => index > 0 && (value <= values[index - 1] || value - values[index - 1] < 120))) {
    errors.push("editorial ad-break markers must be one for 5–6:59 videos or two for 7–8 minute videos, placed at natural transitions at least 120 seconds apart.");
  }
  if (!Array.isArray(campaign?.editorial_ad_break_notes) ||
      campaign.editorial_ad_break_notes.length !== expectedCount ||
      campaign.editorial_ad_break_notes.some((note) => typeof note !== "string" || !note.trim())) {
    errors.push("each proposed ad-break marker needs an editorial transition note.");
  }

  return errors;
}
