const TIME_ZONE = "Africa/Johannesburg";
const MAX_LONG_FORM_PER_DAY = 2;
const MAX_REELS_PER_DAY = 1;
const MAX_TOTAL_RELEASES_PER_DAY = 3;

export function johannesburgDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("A valid publication timestamp is required.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return fields.year + "-" + fields.month + "-" + fields.day;
}

export function getJohannesburgDailyReleaseCounts(campaigns, now = new Date()) {
  if (!Array.isArray(campaigns)) throw new Error("Campaign state must be an array.");
  const dateKey = johannesburgDateKey(now);
  const todaysPublished = campaigns.filter((campaign) =>
    campaign?.status === "published" &&
    typeof campaign?.published_at === "string" &&
    johannesburgDateKey(campaign.published_at) === dateKey
  );
  return {
    date: dateKey,
    longForm: todaysPublished.filter((campaign) => campaign.facebook_type === "VIDEO").length,
    reels: todaysPublished.filter((campaign) => campaign.facebook_type === "REEL").length,
    total: todaysPublished.length
  };
}

export function assertDailyReleaseCapacity(campaigns, contentType, now = new Date()) {
  if (contentType !== "VIDEO" && contentType !== "REEL") {
    throw new Error("Only VIDEO and REEL release types are allowed by the Nature Frontiers daily cadence.");
  }
  const counts = getJohannesburgDailyReleaseCounts(campaigns, now);
  if (counts.total >= MAX_TOTAL_RELEASES_PER_DAY) {
    throw new Error("Daily publishing ceiling reached: Nature Frontiers allows no more than three total releases per Johannesburg calendar day.");
  }
  if (contentType === "VIDEO" && counts.longForm >= MAX_LONG_FORM_PER_DAY) {
    throw new Error("Daily long-form limit reached: Nature Frontiers allows no more than two 5–8 minute videos per Johannesburg calendar day.");
  }
  if (contentType === "REEL" && counts.reels >= MAX_REELS_PER_DAY) {
    throw new Error("Daily discovery Reel limit reached: Nature Frontiers allows no more than one approximately 30-second Reel per Johannesburg calendar day.");
  }
  return counts;
}
