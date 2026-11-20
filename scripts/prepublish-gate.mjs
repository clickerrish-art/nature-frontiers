import { createHash } from "node:crypto";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const normalizeCaption = (value) => String(value ?? "").normalize("NFKC").toLowerCase()
  .replace(/https?:\/\/\S+/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
const issue = (code, message) => ({ code, message });

export function validatePrepublishCampaign(campaign, history = [], policy = {}, now = new Date()) {
  const issues = [];
  const add = (code, message) => issues.push(issue(code, message));
  const caption = typeof campaign?.caption === "string" ? campaign.caption.trim() : "";
  const network = campaign?.network;
  const destination = network === "facebook" || network === "instagram" ? network + ":nature-frontiers" : "";
  if (!caption) add("CAPTION_MISSING", "Caption is missing.");
  if (caption.length > 60000) add("CAPTION_TOO_LONG", "Caption exceeds the configured safety limit.");
  if (!["facebook", "instagram"].includes(network)) add("NETWORK_INVALID", "Network must be Facebook or Instagram.");
  if (campaign?.destination !== destination) add("DESTINATION_MISMATCH", "Campaign destination must match its verified Nature Frontiers platform.");
  if (!["organic", "promotion"].includes(campaign?.campaign_type)) add("CAMPAIGN_TYPE_INVALID", "campaign_type must be explicitly organic or promotion.");
  if (campaign?.status !== "approved") add("CAMPAIGN_NOT_APPROVED", "Campaign status must be approved.");
  if (campaign?.policy_review_passed !== true) add("POLICY_REVIEW_MISSING", "The exact post must pass human platform-policy review.");
  if (campaign?.content_accuracy_confirmed !== true) add("CONTENT_ACCURACY_MISSING", "Content accuracy must be human-confirmed.");
  if (campaign?.brand_fit_confirmed !== true) add("BRAND_FIT_MISSING", "Nature Frontiers brand fit must be human-confirmed.");
  if (campaign?.wildlife_welfare_confirmed !== true) add("WILDLIFE_WELFARE_MISSING", "Wildlife welfare and no-disturbance review must pass.");
  if (campaign?.non_graphic_review_passed !== true) add("NON_GRAPHIC_REVIEW_MISSING", "Wildlife imagery must pass a human non-graphic review.");

  const normalized = normalizeCaption(caption);
  if (normalized && (history ?? []).some((item) => item?.id !== campaign?.id && normalizeCaption(item?.caption) === normalized)) {
    add("DUPLICATE_CAPTION", "Caption duplicates another campaign or queued draft.");
  }
  const lower = caption.toLowerCase();
  for (const phrase of policy?.banned_phrases ?? []) {
    if (phrase && lower.includes(String(phrase).toLowerCase())) add("BANNED_CLAIM", "Caption contains blocked phrase: " + phrase);
  }

  const links = [...caption.matchAll(/https?:\/\/[^\s)\]}>,]+/gi)].map((match) => match[0].replace(/[.,!?;:]+$/, ""));
  if (campaign?.campaign_type === "promotion" && links.length === 0) add("LINK_MISSING", "Promotional campaigns require a verified product or affiliate link.");
  for (const link of links) {
    try {
      const url = new URL(link);
      if (url.protocol !== "https:" || !(policy?.allowed_link_hosts ?? []).includes(url.hostname.toLowerCase())) {
        add("LINK_HOST_NOT_ALLOWED", "Link host is not approved: " + url.hostname);
      }
    } catch { add("LINK_INVALID", "Caption contains an invalid URL."); }
  }
  if (links.length > 0 || campaign?.campaign_type === "promotion") {
    const linkCheck = campaign?.link_check;
    const checkedAt = Date.parse(linkCheck?.checked_at ?? "");
    const maxAgeMs = Number(policy?.link_max_age_hours ?? 24) * 3600000;
    if (linkCheck?.status !== 200 || !Number.isFinite(checkedAt) || checkedAt > now.getTime() || now.getTime() - checkedAt > maxAgeMs) {
      add("LINK_CHECK_STALE_OR_MISSING", "A successful, recent external-link check is required for every linked campaign.");
    } else {
      try {
        const finalUrl = new URL(linkCheck.final_url);
        if (finalUrl.protocol !== "https:" || !(policy?.allowed_link_hosts ?? []).includes(finalUrl.hostname.toLowerCase())) {
          add("LINK_REDIRECT_NOT_ALLOWED", "The verified link destination is not an approved HTTPS host.");
        }
      } catch { add("LINK_FINAL_URL_MISSING", "The link check must record a valid final URL."); }
    }
  }

  if (campaign?.campaign_type === "promotion") {
    const disclosure = campaign?.disclosure?.paid_promotion_text ?? "Disclosure: This is a promotional post for a paid digital product.";
    if (campaign?.disclosure?.paid_promotion !== true || !caption.includes(disclosure)) {
      add("PAID_DISCLOSURE_MISSING", "Promotional campaigns require the matching paid-promotion disclosure in the caption.");
    }
  }

  const mediaRequired = campaign?.facebook_type === "REEL" || campaign?.facebook_type === "VIDEO" ||
    campaign?.instagram_type === "REEL" || Boolean(campaign?.media_url);
  const mediaAssets = Array.isArray(campaign?.media_assets) && campaign.media_assets.length
    ? campaign.media_assets
    : campaign?.media_url ? [campaign] : [];
  if (mediaRequired && mediaAssets.length === 0) add("MEDIA_EVIDENCE_MISSING", "A media-based campaign requires exact media evidence.");
  const mediaHashes = [];

  for (const [index, asset] of mediaAssets.entries()) {
    const hash = asset?.sha256 ?? asset?.media_sha256;
    if (!/^[a-f0-9]{64}$/i.test(hash ?? "")) add("MEDIA_HASH_INVALID", "Media asset " + (index + 1) + " is missing a verified SHA-256 hash.");
    else {
      mediaHashes.push(String(hash).toLowerCase());
      if ((history ?? []).some((item) => item?.id !== campaign?.id && item?.media_sha256 === hash)) {
        add("DUPLICATE_MEDIA", "Media SHA-256 duplicates another campaign.");
      }
    }
    if (asset?.media_rights_confirmed !== true) add("RIGHTS_NOT_CLEARED", "Media asset " + (index + 1) + " lacks human-confirmed rights clearance.");
    if (asset?.synthetic_visuals !== false || asset?.ai_generated_video !== false) add("SYNTHETIC_MEDIA_PROHIBITED", "Synthetic or AI-generated wildlife visuals are prohibited.");
    if (asset?.media_technical_review_passed !== true) add("MEDIA_TECHNICAL_REVIEW_MISSING", "Media asset " + (index + 1) + " lacks technical review.");
    if (asset?.media_accessibility_confirmed !== true) add("MEDIA_ACCESSIBILITY_MISSING", "Media asset " + (index + 1) + " lacks public accessibility verification.");
    if (asset?.watermark_scan_passed !== true) add("WATERMARK_NOT_CLEARED", "Media asset " + (index + 1) + " lacks a clean watermark review.");
    if (asset?.audio_present !== true && asset?.audio_present !== false) add("AUDIO_STATUS_UNKNOWN", "Media asset " + (index + 1) + " must explicitly declare whether audio is present.");
    if (asset?.audio_present === true && (asset?.audio_license_status !== "licensed" || !asset?.audio_license_ref)) {
      add("AUDIO_NOT_CLEARED", "Media asset " + (index + 1) + " contains audio without verified licence evidence.");
    }

    if (asset?.media_origin === "licensed_stock") {
      if (asset?.wildlife_media_policy !== "licensed_stock_allowed") add("STOCK_POLICY_MISSING", "Licensed stock requires the owner-approved wildlife media policy.");
      if (typeof asset?.source_url !== "string" || !/^https:\/\//i.test(asset.source_url)) add("STOCK_SOURCE_MISSING", "Licensed stock requires its HTTPS source-page URL.");
      if (typeof asset?.source_creator !== "string" || !asset.source_creator.trim()) add("STOCK_CREATOR_MISSING", "Licensed stock requires creator attribution.");
      if (typeof asset?.license_name !== "string" || !asset.license_name.trim()) add("STOCK_LICENSE_MISSING", "Licensed stock requires its exact licence name.");
      if (typeof asset?.license_evidence_url !== "string" || !/^https:\/\//i.test(asset.license_evidence_url)) add("STOCK_LICENSE_EVIDENCE_MISSING", "Licensed stock requires HTTPS licence evidence.");
      if (asset?.provenance_review_passed !== true || !asset?.provenance_reviewer || !Number.isFinite(Date.parse(asset?.provenance_reviewed_at ?? ""))) {
        add("STOCK_PROVENANCE_MISSING", "Licensed stock requires named, timestamped human provenance review.");
      }
      if (asset?.on_screen_disclosure_confirmed !== true || !/licensed stock footage/i.test(asset?.on_screen_disclosure_text ?? "")) {
        add("STOCK_DISCLOSURE_MISSING", "Licensed stock requires visible on-screen stock disclosure confirmed against the final media hash.");
      }
      if (typeof asset?.caption_attribution !== "string" || !asset.caption_attribution.trim() || !caption.includes(asset.caption_attribution)) {
        add("STOCK_ATTRIBUTION_MISSING", "Licensed stock creator/source attribution must appear in the caption or rendered credits.");
      }
    } else if (asset?.media_origin === "original_camera_recording") {
      if (asset?.media_originality_confirmed !== true || !asset?.source_recording_id ||
          !/^[a-f0-9]{64}$/i.test(asset?.original_camera_file_sha256 ?? "") || asset?.original_recording_retained !== true) {
        add("ORIGINAL_PROVENANCE_MISSING", "Original camera media requires a retained original, source ID, hash and human originality confirmation.");
      }
      if (asset?.provenance_review_passed !== true || !asset?.provenance_reviewer ||
          !Number.isFinite(Date.parse(asset?.provenance_reviewed_at ?? ""))) {
        add("ORIGINAL_PROVENANCE_REVIEW_MISSING", "Original camera provenance requires named, timestamped human review.");
      }
    } else {
      add("MEDIA_ORIGIN_INVALID", "Media origin must be licensed_stock or original_camera_recording.");
    }
  }

  const captionHash = sha256(caption);
  const approval = campaign?.human_approval;
  const approvalAge = now.getTime() - Date.parse(approval?.approved_at ?? "");
  if (!approval?.reviewer || approval?.caption_sha256 !== captionHash ||
      !Array.isArray(approval?.media_sha256) ||
      [...approval.media_sha256].map((value) => String(value).toLowerCase()).sort().join(",") !== [...mediaHashes].sort().join(",") ||
      approval?.destination !== destination ||
      !Number.isFinite(approvalAge) || approvalAge < 0 ||
      approvalAge > Number(policy?.approval_max_age_days ?? 30) * 86400000) {
    add("HUMAN_APPROVAL_NOT_BOUND", "Human approval must be recent and bound to the exact caption hash, media hashes and Nature Frontiers destination.");
  }
  return { ok: issues.length === 0, issues, caption_sha256: captionHash, media_sha256: mediaHashes };
}
