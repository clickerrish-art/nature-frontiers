import { createHash } from "node:crypto";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const normalizeCaption = (value) => String(value ?? "").normalize("NFKC").toLowerCase().replace(/https?:\\/\\/\\S+/g, " ").replace(/[^\\p{L}\\p{N}]+/gu, " ").trim().replace(/\\s+/g, " ");

function issue(code, message) { return { code, message }; }

export function validatePrepublishCampaign(campaign, history, policy, now = new Date()) {
  const issues = [];
  const add = (code, message) => issues.push(issue(code, message));
  const caption = typeof campaign?.caption === "string" ? campaign.caption.trim() : "";
  if (!caption) add("CAPTION_MISSING", "Caption is missing.");
  if (caption.length > 60000) add("CAPTION_TOO_LONG", "Caption exceeds the configured safety limit.");

  const normalized = normalizeCaption(caption);
  if (normalized && (history ?? []).some((item) => item?.id !== campaign?.id && normalizeCaption(item?.caption) === normalized)) {
    add("DUPLICATE_CAPTION", "Caption duplicates another campaign or queued draft.");
  }
  const lower = caption.toLowerCase();
  for (const phrase of policy?.banned_phrases ?? []) {
    if (phrase && lower.includes(String(phrase).toLowerCase())) add("BANNED_CLAIM", `Caption contains blocked phrase: ${phrase}`);
  }

  const links = [...caption.matchAll(/https?:\\/\\/[^\\s)\\]}>,]+/gi)].map((match) => match[0].replace(/[.,!?;:]+$/, ""));
  if (!links.length) add("LINK_MISSING", "At least one HTTPS product link is required.");
  for (const link of links) {
    try {
      const url = new URL(link);
      if (url.protocol !== "https:" || !(policy?.allowed_link_hosts ?? []).includes(url.hostname.toLowerCase())) {
        add("LINK_HOST_NOT_ALLOWED", `Link host is not approved: ${url.hostname}`);
      }
    } catch { add("LINK_INVALID", "Caption contains an invalid URL."); }
  }
  const linkCheck = campaign?.link_check;
  const checkedAt = Date.parse(linkCheck?.checked_at ?? "");
  const maxAgeMs = Number(policy?.link_max_age_hours ?? 24) * 3600000;
  if (linkCheck?.status !== 200 || !Number.isFinite(checkedAt) || checkedAt > now.getTime() || now.getTime() - checkedAt > maxAgeMs) {
    add("LINK_CHECK_STALE_OR_MISSING", "A successful, recent (within 24 hours) external-link check with recorded final URL is required.");
  } else {
    try {
      const finalUrl = new URL(linkCheck.final_url);
      if (finalUrl.protocol !== "https:" || !(policy?.allowed_link_hosts ?? []).includes(finalUrl.hostname.toLowerCase())) {
        add("LINK_REDIRECT_NOT_ALLOWED", "The verified link destination is not an approved HTTPS host.");
      }
    } catch { add("LINK_FINAL_URL_MISSING", "The link check must record a valid final URL."); }
  }

  const assets = Array.isArray(campaign?.media_assets) ? campaign.media_assets : [];
  if (!assets.length) add("MEDIA_EVIDENCE_MISSING", "At least one media asset with a verified SHA-256 hash is required.");
  const mediaHashes = [];
  for (const [index, asset] of assets.entries()) {
    if (!/^[a-f0-9]{64}$/i.test(asset?.sha256 ?? "")) add("MEDIA_HASH_INVALID", `Media asset ${index + 1} is missing a valid SHA-256 hash.`);
    else mediaHashes.push(asset.sha256.toLowerCase());
    if (asset?.rights?.status !== "cleared" || !asset?.rights?.written_permission_ref || asset?.rights?.commercial_worldwide !== true || asset?.rights?.editing_allowed !== true || asset?.rights?.social_platforms?.includes("facebook") !== true) {
      add("RIGHTS_NOT_CLEARED", `Media asset ${index + 1} lacks documented worldwide commercial Facebook rights and editing permission.`);
    }
    if (asset?.originality?.status !== "verified" || !asset?.originality?.source_ref) add("ORIGINALITY_UNVERIFIED", `Media asset ${index + 1} lacks verified source/provenance evidence.`);
    if (asset?.watermark_scan?.status !== "clean") add("WATERMARK_NOT_CLEARED", `Media asset ${index + 1} has no clean watermark scan.`);
    const audio = asset?.audio;
    if (audio?.present === true && (audio.license_status !== "licensed" || !audio.license_ref)) add("AUDIO_NOT_CLEARED", `Media asset ${index + 1} contains audio without verified licensing evidence.`);
    if (audio?.present !== true && audio?.present !== false) add("AUDIO_STATUS_UNKNOWN", `Media asset ${index + 1} must explicitly declare whether audio is present.`);
    if (asset?.ai_generated === true && (asset?.ai_disclosure?.required !== true || asset?.ai_disclosure?.native_control_verified !== true)) {
      add("AI_DISCLOSURE_MISSING", `Media asset ${index + 1} requires verified destination-native AI disclosure.`);
    }
  }

  const captionHash = sha256(caption);
  const approval = campaign?.human_approval;
  const approvalAge = now.getTime() - Date.parse(approval?.approved_at ?? "");
  if (!approval?.reviewer || approval?.caption_sha256 !== captionHash ||
      !Array.isArray(approval?.media_sha256) ||
      [...approval.media_sha256].map((x) => String(x).toLowerCase()).sort().join(",") !== [...mediaHashes].sort().join(",") ||
      approval?.destination !== "facebook:nature-frontiers" ||
      !Number.isFinite(approvalAge) || approvalAge < 0 ||
      approvalAge > Number(policy?.approval_max_age_days ?? 30) * 86400000) {
    add("HUMAN_APPROVAL_NOT_BOUND", "Human approval must be recent and bound to the exact caption hash, media hashes and Nature Frontiers Facebook destination.");
  }
  if (campaign?.status !== "approved") add("CAMPAIGN_NOT_APPROVED", "Campaign status must be approved.");
  if (campaign?.disclosure?.paid_promotion !== true) add("PAID_DISCLOSURE_MISSING", "Paid-promotion disclosure has not been explicitly verified.");
  if (campaign?.destination !== "facebook:nature-frontiers") add("DESTINATION_MISMATCH", "Campaign destination is not the Nature Frontiers Facebook Page.");
  return { ok: issues.length === 0, issues, caption_sha256: captionHash, media_sha256: mediaHashes };
}
