import { createHash } from "node:crypto";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const normalize = (value) => String(value ?? "").normalize("NFKC").toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");

export function validateInstagramCampaign(campaign, history = [], policy = {}, now = new Date()) {
  const issues = [];
  const add = (code, message) => issues.push({ code, message });
  const caption = typeof campaign?.caption === "string" ? campaign.caption.trim() : "";
  if (!caption) add("CAPTION_MISSING", "Caption is required.");
  if (caption.length > 2200) add("CAPTION_TOO_LONG", "Instagram caption exceeds 2,200 characters.");
  if (campaign?.network !== "instagram" || campaign?.destination !== "instagram:nature-frontiers") {
    add("DESTINATION_MISMATCH", "Campaign must target the Nature Frontiers Instagram account.");
  }
  if (campaign?.status !== "approved") add("CAMPAIGN_NOT_APPROVED", "Campaign must have approved status.");
  if (campaign?.commercial !== false && campaign?.commercial !== true) add("COMMERCIAL_STATUS_UNKNOWN", "Campaign must explicitly declare commercial true or false.");
  if (campaign?.disclosureRequired !== false && campaign?.disclosureRequired !== true) add("DISCLOSURE_STATUS_UNKNOWN", "Campaign must explicitly declare whether disclosure is required.");
  if (campaign?.commercial === true && campaign?.disclosureRequired !== true) add("COMMERCIAL_DISCLOSURE_POLICY", "Commercial content must explicitly require disclosure.");
  if (campaign?.disclosureRequired === true && campaign?.disclosure?.verified !== true) add("DISCLOSURE_NOT_VERIFIED", "Required disclosure must be verified and present in the caption.");
  if (campaign?.disclosureRequired === true && (typeof campaign?.disclosure?.text !== "string" || !campaign.disclosure.text.trim())) add("DISCLOSURE_TEXT_MISSING", "Required disclosure must include exact non-empty text.");
  if (campaign?.disclosureRequired === true && typeof campaign?.disclosure?.text === "string" && !caption.includes(campaign.disclosure.text)) {
    add("DISCLOSURE_TEXT_MISSING", "The exact verified disclosure text is missing from the caption.");
  }
  for (const phrase of policy.banned_phrases ?? []) {
    if (phrase && caption.toLowerCase().includes(String(phrase).toLowerCase())) add("BANNED_CLAIM", "Caption contains a prohibited claim.");
  }
  if (history.some((item) => item?.id !== campaign?.id && normalize(item?.caption) === normalize(caption))) {
    add("DUPLICATE_CAPTION", "Caption duplicates another Instagram campaign.");
  }

  const assets = Array.isArray(campaign?.media_assets) ? campaign.media_assets : [];
  if (assets.length !== 1) add("MEDIA_ASSET_COUNT", "Each Instagram campaign must contain exactly one approved image or Reel asset.");
  const mediaHashes = [];
  for (const [i, asset] of assets.entries()) {
    if (!/^[a-f0-9]{64}$/i.test(asset?.sha256 ?? "")) add("MEDIA_HASH_INVALID", `Media asset ${i + 1} needs a SHA-256 hash.`);
    else mediaHashes.push(asset.sha256.toLowerCase());
    if (!["image", "reel"].includes(asset?.kind)) add("MEDIA_KIND_INVALID", "Media kind must be image or reel.");
    if (asset?.kind === "reel" && typeof asset?.share_to_feed !== "boolean") add("REEL_FEED_SETTING_MISSING", "Reels must explicitly declare share_to_feed true or false.");
    const technical = asset?.technical_check;
    const technicalAt = Date.parse(technical?.checked_at ?? "");
    const technicalAge = now.getTime() - technicalAt;
    if (technical?.status !== "passed" || technical?.tool !== "ffprobe" || technical?.kind !== asset?.kind ||
        technical?.sha256 !== String(asset?.sha256 ?? "").toLowerCase() || !Number.isFinite(Number(technical?.file_size)) || technical.file_size <= 0 ||
        !Number.isFinite(technicalAge) || technicalAge < 0 ||
        technicalAge > Number(policy.media_check_max_age_days ?? 30) * 86400000) {
      add("MEDIA_TECHNICAL_CHECK_MISSING", "A recent ffprobe technical preflight bound to the exact media SHA-256 is required.");
    } else if (asset.kind === "image" &&
        (!Number.isFinite(Number(technical.width)) || !Number.isFinite(Number(technical.height)) || !Number.isFinite(Number(technical.aspect_ratio)) || technical.width < 320 || technical.width > 1440 || technical.aspect_ratio < 0.8 || technical.aspect_ratio > 1.91 || technical.file_size > 8_000_000 || !String(technical.format).toLowerCase().includes("jpeg"))) {
      add("IMAGE_SPEC_INVALID", "Image does not meet the supported JPEG dimensions or aspect-ratio specification.");
    } else if (asset.kind === "reel" &&
        (!String(technical.format).toLowerCase().includes("mp4") || !["h264", "hevc"].includes(technical.video?.codec) || !Number.isFinite(Number(technical.video?.fps)) || technical.video.fps < 23 || technical.video.fps > 60 ||
         !Number.isFinite(Number(technical.video?.duration_seconds)) || technical.video.duration_seconds < 3 || technical.video.duration_seconds > 900 ||
         !Number.isFinite(Number(technical.width)) || !Number.isFinite(Number(technical.height)) || !Number.isFinite(Number(technical.aspect_ratio)) || technical.file_size > 100_000_000 || technical.width > 1920 || technical.aspect_ratio < 0.01 || technical.aspect_ratio > 10 ||
         (Number.isFinite(Number(technical.video?.bitrate_bps)) && technical.video.bitrate_bps > 25_000_000) ||
         (asset.audio?.present === true && (technical.audio?.codec !== "aac" || technical.audio?.sample_rate > 48000 || ![1, 2].includes(technical.audio?.channels))))) {
      add("REEL_SPEC_INVALID", "Reel does not meet the supported container, codec, frame-rate, duration or dimension specification.");
    }
    if (typeof asset?.media_path !== "string" || !asset.media_path.trim() || asset.media_path.startsWith("/") || asset.media_path.includes("..") || /[?#\\]/.test(asset.media_path)) {
      add("MEDIA_PATH_INVALID", "Media must use a safe relative path on the configured public media host.");
    }
    const rights = asset?.rights;
    if (rights?.status !== "cleared" || !rights?.written_permission_ref ||
        rights?.worldwide !== true || (campaign?.commercial === true && rights?.commercial_worldwide !== true) || rights?.editing_allowed !== true ||
        rights?.social_platforms?.includes("instagram") !== true) {
      add("RIGHTS_NOT_CLEARED", "Asset lacks documented worldwide Instagram usage rights and editing permission.");
    }
    if (asset?.originality?.status !== "verified" || !asset?.originality?.source_ref) add("ORIGINALITY_UNVERIFIED", "Asset provenance is not verified.");
    if (asset?.watermark_scan?.status !== "clean") add("WATERMARK_NOT_CLEARED", "Asset has no clean watermark scan.");
    if (asset?.audio?.present === true && (asset.audio.license_status !== "licensed" || !asset.audio.license_ref)) add("AUDIO_NOT_CLEARED", "Reel audio lacks documented licensing.");
    if (asset?.audio?.present !== true && asset?.audio?.present !== false) add("AUDIO_STATUS_UNKNOWN", "Asset must explicitly declare whether audio is present.");
    if (asset?.ai_generated === true && (asset?.ai_disclosure?.required !== true || asset?.ai_disclosure?.native_control_verified !== true)) {
      add("AI_DISCLOSURE_MISSING", "AI-generated media requires verified destination-native disclosure.");
    }
  }

  const approval = campaign?.human_approval;
  const approvedAt = Date.parse(approval?.approved_at ?? "");
  const approvalAge = now.getTime() - approvedAt;
  const captionHash = sha256(caption);
  if (!approval?.reviewer || approval?.destination !== "instagram:nature-frontiers" ||
      approval?.caption_sha256 !== captionHash ||
      !Array.isArray(approval?.media_sha256) ||
      [...approval.media_sha256].map((x) => String(x).toLowerCase()).sort().join(",") !== [...mediaHashes].sort().join(",") ||
      !Number.isFinite(approvalAge) || approvalAge < 0 ||
      approvalAge > Number(policy.approval_max_age_days ?? 30) * 86400000) {
    add("HUMAN_APPROVAL_NOT_BOUND", "Human approval must be recent and bound to this exact caption, media hashes and Instagram destination.");
  }

  const links = [...caption.matchAll(/https?:\/\/[^\s)\]}>,]+/gi)].map((m) => m[0].replace(/[.,!?;:]+$/, ""));
  if (links.length) {
    const check = campaign?.link_check;
    if (links.length !== 1) add("LINK_CHECK_COUNT", "This publisher requires exactly one caption URL so the checked destination is unambiguous.");
    if (check?.url !== links[0]) add("LINK_CHECK_MISMATCH", "The checked source URL must exactly match the caption URL.");
    const checkedAt = Date.parse(check?.checked_at ?? "");
    if (check?.status !== 200 || !Number.isFinite(checkedAt) || checkedAt > now.getTime() ||
        now.getTime() - checkedAt > Number(policy.link_max_age_hours ?? 24) * 3600000) {
      add("LINK_CHECK_STALE_OR_MISSING", "Caption links need a recent successful destination check.");
    } else {
      try {
        const finalUrl = new URL(check.final_url);
        const allowed = (policy.allowed_link_hosts ?? []).includes(finalUrl.hostname.toLowerCase());
        if (finalUrl.protocol !== "https:" || !allowed) add("LINK_REDIRECT_NOT_ALLOWED", "Verified link destination is not an approved HTTPS host.");
      } catch { add("LINK_FINAL_URL_MISSING", "Link check must include a valid final URL."); }
    }
  }
  return { ok: issues.length === 0, issues, caption_sha256: captionHash, media_sha256: mediaHashes };
}
