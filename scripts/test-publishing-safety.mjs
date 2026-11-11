import { spawnSync } from "node:child_process";

const sharedEnv = {
  META_PAGE_ID: "1003575786161492",
  META_PAGE_ACCESS_TOKEN: "not-a-real-token-used-only-for-safe-stop-tests",
  META_GRAPH_API_VERSION: "v27.0",
  GITHUB_REPOSITORY: "clickerrish-art/nature-frontiers",
  GITHUB_REF_NAME: "codex/facebook-reels-publisher",
  GITHUB_TOKEN: "not-a-real-token-used-only-for-safe-stop-tests"
};

const cases = [
  {
    name: "legacy feed publisher remains disabled by default",
    script: "scripts/publish-facebook.mjs",
    env: { PUBLISH_ENABLED: "false", PUBLISH_DRY_RUN: "true" },
    expected: "PUBLISH_ENABLED is not true; public publishing is disabled."
  },
  {
    name: "legacy feed publisher has no approved campaigns",
    script: "scripts/publish-facebook.mjs",
    env: { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false" },
    expected: "No explicitly approved Facebook feed campaigns exist."
  },
  {
    name: "long-form publisher is disabled by default",
    script: "scripts/publish-facebook-video.mjs",
    env: { PUBLISH_ENABLED: "false", PUBLISH_DRY_RUN: "true" },
    expected: "PUBLISH_ENABLED is not true; public publishing is disabled."
  },
  {
    name: "long-form publisher makes no request in dry-run mode",
    script: "scripts/publish-facebook-video.mjs",
    env: { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "true" },
    expected: "PUBLISH_DRY_RUN is not false; no public publishing is permitted."
  },
  {
    name: "long-form publisher finds no approved video campaigns and makes no Meta request",
    script: "scripts/publish-facebook-video.mjs",
    env: { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false" },
    expected: "No explicitly approved long-form Facebook video campaigns exist."
  },
  {
    name: "discovery Reel publisher is disabled by default",
    script: "scripts/publish-facebook-reel.mjs",
    env: { PUBLISH_ENABLED: "false", PUBLISH_DRY_RUN: "true" },
    expected: "PUBLISH_ENABLED is not true; public publishing is disabled."
  },
  {
    name: "discovery Reel publisher makes no request in dry-run mode",
    script: "scripts/publish-facebook-reel.mjs",
    env: { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "true" },
    expected: "PUBLISH_DRY_RUN is not false; no public publishing is permitted."
  },
  {
    name: "discovery Reel publisher finds no approved funnel clips and makes no Meta request",
    script: "scripts/publish-facebook-reel.mjs",
    env: { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false" },
    expected: "No explicitly approved Facebook Reel campaigns exist."
  }
];

let failed = 0;
for (const scenario of cases) {
  const result = spawnSync(process.execPath, [scenario.script], {
    encoding: "utf8",
    env: { ...process.env, ...sharedEnv, ...scenario.env }
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status !== 0 || !output.includes(scenario.expected)) {
    failed++;
    console.error(`FAIL: ${scenario.name}`);
    console.error(output);
  } else {
    console.log(`PASS: ${scenario.name}`);
  }
}
if (failed) process.exit(1);
console.log("Fail-closed publishing safety tests passed. No platform API requests were made.");
