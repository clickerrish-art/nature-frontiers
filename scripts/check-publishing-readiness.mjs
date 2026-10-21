const groups = [
  {
    platform: "Meta (Facebook Page)",
    required: ["META_PAGE_ID", "META_PAGE_ACCESS_TOKEN"],
    note: "Token must have valid Page publishing access; app review and Page permissions may apply."
  },
  {
    platform: "Instagram",
    required: ["META_PAGE_ACCESS_TOKEN", "INSTAGRAM_USER_ID"],
    note: "Requires an eligible professional account and a supported Meta API setup."
  },
  {
    platform: "Pinterest",
    required: ["PINTEREST_ACCESS_TOKEN", "PINTEREST_BOARD_ID"],
    note: "Token must include the required pin/board scopes."
  },
  {
    platform: "TikTok",
    required: ["TIKTOK_ACCESS_TOKEN", "TIKTOK_OPEN_ID"],
    note: "Content Posting API access and any required app audit must be complete."
  },
  {
    platform: "YouTube",
    required: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN", "YOUTUBE_CHANNEL_ID"],
    note: "OAuth must be authorized for the intended channel; uploads are subject to quota and API restrictions."
  }
];

let missingTotal = 0;
console.log("Nature Frontiers publishing readiness");
console.log("This check reads only whether required environment variables are present.");
console.log("It never prints credential values and never contacts or publishes to social platforms.\n");

for (const group of groups) {
  const missing = group.required.filter((name) => !process.env[name]?.trim());
  const status = missing.length === 0 ? "CREDENTIALS PRESENT — authorization still needs verification" : "NOT READY";
  console.log(`${group.platform}: ${status}`);
  if (missing.length) {
    missingTotal += missing.length;
    console.log(`  Missing: ${missing.join(", ")}`);
  } else {
    console.log("  Required environment-variable names are present; token validity and platform permissions are not verified.");
  }
  console.log(`  Note: ${group.note}`);
}

console.log(`\nSummary: ${missingTotal} required credential field(s) missing across the listed platforms.`);
console.log("No content was published, scheduled, or sent.");
// Missing credentials are an expected setup state, not a script failure.
