import { validateReelCampaign } from "./facebook-reel-guards.mjs";

export function validateInstagramReelCampaign(campaign) {
  const errors = validateReelCampaign({ ...campaign, network: "facebook", facebook_type: "REEL" });
  if (campaign?.network !== "instagram") errors.push("campaign must target Instagram.");
  if (campaign?.instagram_type !== "REEL") errors.push("campaign must explicitly declare instagram_type=REEL.");
  if (!Number.isFinite(campaign?.duration_seconds) || campaign.duration_seconds < 50 || campaign.duration_seconds > 60) {
    errors.push("Nature Frontiers Instagram wildlife Reels must target 50–60 seconds.");
  }
  if (typeof campaign?.share_to_feed !== "boolean") errors.push("share_to_feed must be explicitly set to true or false.");
  if (typeof campaign?.caption === "string") {
    if (campaign.caption.length > 2200) errors.push("Instagram caption exceeds the 2,200-character limit.");
    const hashtags = campaign.caption.match(/#[\\p{L}\\p{N}_]+/gu) ?? [];
    const mentions = campaign.caption.match(/@[A-Za-z0-9._]+/g) ?? [];
    if (hashtags.length > 30) errors.push("Instagram caption exceeds the 30-hashtag limit.");
    if (mentions.length > 20) errors.push("Instagram caption exceeds the 20-mention limit.");
  }
  return errors;
}
