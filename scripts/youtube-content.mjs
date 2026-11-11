import { readFile } from "node:fs/promises";

const policy = JSON.parse(await readFile(new URL("../data/youtube-content-policy.json", import.meta.url), "utf8"));
const products = JSON.parse(await readFile(new URL("../data/products.json", import.meta.url), "utf8"));

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

export function getRequiredDescriptionLinks() {
  return {
    channel: policy.channelUrl,
    products: products.map(({ id, title, url }) => ({ id, title, url })),
    affiliates: policy.affiliateLinks.map(({ label, url }) => ({ label, url }))
  };
}

export function validateYouTubeDescription(description) {
  const errors = [];
  if (!isNonEmptyString(description)) return ["YouTube description must be a non-empty string."];

  const links = getRequiredDescriptionLinks();
  if (!description.includes(links.channel)) errors.push("Description must include the Nature Frontiers YouTube channel link.");

  for (const product of links.products) {
    if (!description.includes(product.url)) errors.push("Description is missing catalogue product link: " + product.id + ".");
  }
  for (const affiliate of links.affiliates) {
    if (!description.includes(affiliate.url)) errors.push("Description is missing Safari.com affiliate link: " + affiliate.label + ".");
    try {
      const parsed = new URL(affiliate.url);
      if (parsed.hostname !== "www.safari.com" || parsed.searchParams.get("a") !== policy.affiliateId) {
        errors.push("Safari.com affiliate link has an unexpected destination or tracking identifier: " + affiliate.label + ".");
      }
    } catch {
      errors.push("Safari.com affiliate link is invalid: " + affiliate.label + ".");
    }
  }
  if (!description.includes(policy.description.productNotice)) errors.push("Description must disclose that the listed digital resources are paid products.");
  if (!description.includes(policy.description.affiliateDisclosure)) errors.push("Description must include the Safari.com affiliate disclosure.");
  return errors;
}

export function buildYouTubeDescription({
  seriesId,
  seasonNumber = 1,
  episodeNumber,
  title,
  synopsis,
  nextEpisodeTease,
  previousEpisodeUrl,
  nextEpisodeUrl,
  sources = []
}) {
  const series = policy.series.find((item) => item.id === seriesId);
  if (!series) throw new Error("A recognised Nature Frontiers seriesId is required.");
  if (!Number.isInteger(seasonNumber) || seasonNumber < 1) throw new Error("seasonNumber must be a positive integer.");
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1) throw new Error("episodeNumber must be a positive integer.");
  if (!isNonEmptyString(title) || !isNonEmptyString(synopsis) || !isNonEmptyString(nextEpisodeTease)) {
    throw new Error("title, synopsis and nextEpisodeTease are required for every series description.");
  }
  if (!Array.isArray(sources) || sources.some((source) => !isNonEmptyString(source))) {
    throw new Error("sources must be an array of non-empty source URLs or references.");
  }

  const links = getRequiredDescriptionLinks();
  const lines = [
    title.trim(),
    "",
    synopsis.trim(),
    "",
    "NATURE FRONTIERS — " + series.name + " | Season " + seasonNumber + ", Episode " + episodeNumber,
    "Watch more Nature Frontiers: " + links.channel,
    "",
    "NEXT EPISODE",
    nextEpisodeTease.trim()
  ];

  if (isNonEmptyString(previousEpisodeUrl)) lines.push("Previous episode: " + previousEpisodeUrl.trim());
  if (isNonEmptyString(nextEpisodeUrl)) lines.push("Next episode: " + nextEpisodeUrl.trim());

  lines.push("", "CREATOR RESOURCES & PRODUCTS");
  for (const product of links.products) lines.push(product.title + ": " + product.url);
  lines.push(policy.description.productNotice);

  lines.push("", "SAFARI PLANNING LINKS");
  for (const affiliate of links.affiliates) lines.push(affiliate.label + ": " + affiliate.url);
  lines.push(policy.description.affiliateDisclosure);

  if (sources.length) {
    lines.push("", "SOURCES & FURTHER READING");
    for (const source of sources) lines.push(source);
  }

  lines.push("", "#NatureFrontiers #Wildlife #NatureDocumentary");
  const description = lines.join("\n");
  const errors = validateYouTubeDescription(description);
  if (errors.length) throw new Error("Generated description failed validation: " + errors.join(" "));
  return description;
}

export function validateEpisodePlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return ["Episode plan must be an object."];

  const series = policy.series.find((item) => item.id === plan.seriesId);
  if (!series) errors.push("Episode must belong to a configured Nature Frontiers series.");
  if (!Number.isInteger(plan.seasonNumber) || plan.seasonNumber < 1) errors.push("seasonNumber must be a positive integer.");
  if (!Number.isInteger(plan.episodeNumber) || plan.episodeNumber < 1) errors.push("episodeNumber must be a positive integer.");
  if (!isNonEmptyString(plan.title)) errors.push("Episode title is required.");

  const duration = plan.durationSeconds;
  if (!Number.isInteger(duration) || duration < policy.videoDurationSeconds.minimum || duration > policy.videoDurationSeconds.maximum) {
    errors.push("Long-form duration must be between 180 and 480 seconds (3–8 minutes).");
  }

  if (!Array.isArray(plan.segments)) {
    errors.push("Episode segments must be an array.");
  } else {
    const requiredBeats = policy.opening.requiredStoryBeats;
    const types = plan.segments.map((segment) => segment?.type);
    for (const beat of requiredBeats) {
      if (!types.includes(beat)) errors.push("Episode is missing required series story beat: " + beat + ".");
    }
    const hook = plan.segments[0];
    if (policy.opening.hookMustBeFirstSegment && (hook?.type !== "hook" || hook?.startSeconds !== 0)) {
      errors.push("The hook must be the first segment and begin at 0 seconds.");
    }
    if (!Number.isInteger(hook?.endSeconds) || hook.endSeconds < policy.opening.minimumHookSeconds) {
      errors.push("The opening hook must run for at least " + policy.opening.minimumHookSeconds + " seconds.");
    }
    let previousEnd = 0;
    for (const [index, segment] of plan.segments.entries()) {
      if (!Number.isInteger(segment?.startSeconds) || !Number.isInteger(segment?.endSeconds) ||
          segment.startSeconds < 0 || segment.endSeconds <= segment.startSeconds) {
        errors.push("Segment " + (index + 1) + " must have valid increasing integer startSeconds/endSeconds.");
        continue;
      }
      if (segment.startSeconds < previousEnd) errors.push("Episode segments must be ordered and must not overlap.");
      if (Number.isInteger(duration) && segment.endSeconds > duration) errors.push("Segment " + (index + 1) + " extends beyond the episode duration.");
      previousEnd = segment.endSeconds;
    }
  }

  const adBreaks = plan.adBreaks ?? [];
  if (!Array.isArray(adBreaks)) {
    errors.push("adBreaks must be an array.");
  } else if (adBreaks.length && Number.isInteger(duration) && duration < policy.midroll.minimumEligibleDurationSeconds) {
    errors.push("Mid-rolls are not eligible below 8 minutes; remove ad breaks from this episode.");
  } else {
    const hookEnd = plan.segments?.[0]?.endSeconds;
    let previousAd = -1;
    for (const [index, ad] of adBreaks.entries()) {
      if (!Number.isInteger(ad?.atSeconds) || ad.atSeconds <= previousAd) {
        errors.push("Mid-roll positions must be unique, increasing integer seconds.");
      }
      if (Number.isInteger(ad?.atSeconds) && ad.atSeconds < Math.max(policy.opening.minimumSecondsBeforeAnyMidroll, hookEnd ?? 0)) {
        errors.push("Every mid-roll must occur after the opening hook and at least 60 seconds into the episode.");
      }
      if (ad?.naturalBreakpoint !== true) errors.push("Every mid-roll must be placed at a reviewed natural narrative breakpoint.");
      if (isNonEmptyString(ad?.interrupts) && policy.midroll.prohibitedInterruptions.includes(ad.interrupts)) {
        errors.push("A mid-roll cannot interrupt " + ad.interrupts + ".");
      }
      if (Number.isInteger(duration) && Number.isInteger(ad?.atSeconds) && ad.atSeconds >= duration - 30) {
        errors.push("Mid-roll must leave at least 30 seconds for the closing section.");
      }
      previousAd = Number.isInteger(ad?.atSeconds) ? ad.atSeconds : previousAd;
    }
  }

  if (plan.status === "approved" && plan.originalFootageVerified !== true) errors.push("Approval is blocked until original camera footage and provenance are verified.");
  if (plan.status === "approved" && plan.rightsVerified !== true) errors.push("Approval is blocked until footage rights are verified.");
  if (plan.status === "approved" && plan.factCheckPassed !== true) errors.push("Approval is blocked until factual claims are checked.");
  return errors;
}

export function assertEpisodePlanValid(plan) {
  const errors = validateEpisodePlan(plan);
  if (errors.length) throw new Error("Episode plan failed validation: " + errors.join(" "));
  return true;
}
