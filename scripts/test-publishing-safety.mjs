import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const cases = [
  {
    name: "emergency stop defaults active even if all live gates are enabled",
    env: { PUBLISH_EMERGENCY_STOP: "", FACEBOOK_PUBLISH_ENABLED: "YES", PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false" },
    expected: "PUBLISH_EMERGENCY_STOP is active; publishing is blocked."
  },
  {
    name: "feature branches cannot run the live Facebook publisher",
    env: { GITHUB_REF_NAME: "codex/instagram-unified-login-setup", PUBLISH_EMERGENCY_STOP: "false", FACEBOOK_PUBLISH_ENABLED: "YES", PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false" },
    expected: "Live Facebook publishing is restricted to the production main branch; feature branches cannot publish."
  },
  {
    name: "Facebook publishing is disabled by default even when the generic publish gate is enabled",
    env: { PUBLISH_EMERGENCY_STOP: "false", FACEBOOK_PUBLISH_ENABLED: "NO", PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false" },
    expected: "FACEBOOK_PUBLISH_ENABLED is not YES; Facebook publishing is disabled."
  },
  {
    name: "publishing remains disabled when Facebook opt-in is YES but repository opt-in is false",
    env: { PUBLISH_EMERGENCY_STOP: "false", FACEBOOK_PUBLISH_ENABLED: "YES", PUBLISH_ENABLED: "false", PUBLISH_DRY_RUN: "true" },
    expected: "PUBLISH_ENABLED is not true; public publishing is disabled."
  },
  {
    name: "enabled workflow does nothing without approved campaigns",
    env: { PUBLISH_EMERGENCY_STOP: "false", FACEBOOK_PUBLISH_ENABLED: "YES", PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "true" },
    expected: "No explicitly approved Facebook campaigns exist."
  },
  {
    name: "live mode still does nothing without approved campaigns",
    env: { PUBLISH_EMERGENCY_STOP: "false", FACEBOOK_PUBLISH_ENABLED: "YES", PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false" },
    expected: "No explicitly approved Facebook campaigns exist."
  }
];

let failed = 0;
for (const test of cases) {
  const result = spawnSync(process.execPath, ["scripts/publish-facebook.mjs"], {
    encoding: "utf8",
    env: { ...process.env, GITHUB_REF_NAME: "main", ...test.env }
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status !== 0 || !output.includes(test.expected)) {
    failed++;
    console.error(`FAIL: ${test.name}`);
    console.error(output);
  } else {
    console.log(`PASS: ${test.name}`);
  }
}
const workflow = await readFile(".github/workflows/publishing-readiness.yml", "utf8");
const instagramRunner = await readFile("scripts/publish-instagram.mjs", "utf8");
if (workflow.includes("github.ref == 'refs/heads/main'") &&
    workflow.includes("facebook-publisher:\n    if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'") &&
    !workflow.includes("INSTAGRAM_STATE_BRANCH") &&
    instagramRunner.includes('process.env.GITHUB_REF_NAME !== "main"') &&
    instagramRunner.includes('const stateBranch = "instagram-publishing-state";')) {
  console.log("PASS: Instagram live publisher is main-only and writes durable state to its dedicated non-default branch");
} else {
  failed++;
  console.error("FAIL: Instagram publisher production-branch or dedicated-state-branch wiring is missing");
}
const facebookPublisher = await readFile("scripts/publish-facebook.mjs", "utf8");
const instagramPublisher = await readFile("scripts/publish-instagram.mjs", "utf8");
if (facebookPublisher.includes("platformIdentityError(pageId, process.env.META_EXPECTED_PAGE_ID") &&
    facebookPublisher.includes("checkFacebookLiveReadiness(") &&
    instagramPublisher.includes("META_EXPECTED_INSTAGRAM_USER_ID") &&
    instagramPublisher.includes("platformIdentityError(") &&
    instagramPublisher.includes("checkInstagramLiveReadiness(")) {
  console.log("PASS: both live publishers require an exact owner-approved destination ID match");
} else {
  failed++;
  console.error("FAIL: a live publisher can target an unverified Meta destination");
}
const mediaHostWorkflow = await readFile(".github/workflows/publishing-readiness.yml", "utf8");
if (mediaHostWorkflow.includes("format('https://raw.githubusercontent.com/{0}/{1}/media/instagram/', github.repository, github.sha)") &&
    !mediaHostWorkflow.includes("vars.INSTAGRAM_MEDIA_BASE_URL")) {
  console.log("PASS: Instagram media origin is pinned to immutable zero-cost GitHub raw hosting");
} else {
  failed++;
  console.error("FAIL: Instagram media origin is not pinned to the zero-cost immutable GitHub raw host");
}
if (failed) process.exit(1);
console.log("Publishing safety tests passed. No platform API requests were made.");
