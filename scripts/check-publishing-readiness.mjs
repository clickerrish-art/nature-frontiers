const groups = [
  {
    platform: "Meta (Facebook Page)",
    required: ["META_PAGE_ID", "META_PAGE_ACCESS_TOKEN", "META_GRAPH_API_VERSION"],
    note: "Presence only; Page token validity, Page tasks, app access level, and publishing eligibility are not verified."
  },
  {
    platform: "Instagram",
    required: ["INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_USER_ID", "INSTAGRAM_GRAPH_API_VERSION"],
    note: "Presence only; the token must match the selected Instagram API login path. Token validity, scopes, account ownership, App Review status, and publishing eligibility are not verified. Do not substitute the Facebook Page token."
  },
  {
    platform: "Pinterest",
    required: ["PINTEREST_ACCESS_TOKEN", "PINTEREST_BOARD_ID"],
    note: "Token must include the required pin/board scopes; this check does not validate them."
  },
  {
    platform: "TikTok",
    required: ["TIKTOK_ACCESS_TOKEN", "TIKTOK_OPEN_ID"],
    note: "Content Posting API access and any required app audit must be complete; this check does not validate them."
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
