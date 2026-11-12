import { spawnSync } from "node:child_process";

const sharedEnv = {
  META_PAGE_ID: "1003575786161492",
  EMERGENCY_STOP: "false",
  META_PAGE_ACCESS_TOKEN: "not-a-real-token-used-only-for-safe-stop-tests",
  META_GRAPH_API_VERSION: "v27.0",
  GITHUB_REPOSITORY: "clickerrish-art/nature-frontiers",
  GITHUB_REF_NAME: "codex/nature-frontiers-youtube-series",
  GITHUB_TOKEN: "not-a-real-token-used-only-for-safe-stop-tests"
};

const cases = [
  {
    name: "legacy feed publisher rejects a different live branch",
    script: "scripts/publish-facebook.mjs",
    env: { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false", PUBLISH_RUN_AUTHORIZED: "true", GITHUB_REF_NAME: "codex/facebook-reels-publisher" },
    expected: "Live publishing is restricted to the protected production branch main."
  },
  {
    name: "long-form publisher rejects a different live branch",
    script: "scripts/publish-facebook-video.mjs",
    env: { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false", PUBLISH_RUN_AUTHORIZED: "true", GITHUB_REF_NAME: "codex/facebook-reels-publisher" },
    expected: "Live publishing is restricted to the protected production branch main."
  },
  {
    name: "Reel publisher rejects a different live branch",
    script: "scripts/publish-facebook-reel.mjs",
    env: { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false", PUBLISH_RUN_AUTHORIZED: "true", GITHUB_REF_NAME: "codex/facebook-reels-publisher" },
    expected: "Live publishing is restricted to the protected production branch main."
  },

  ...[
    {
      name: "legacy feed publisher permits the protected production branch but finds no approved campaign",
      script: "scripts/publish-facebook.mjs",
      env: {
        PUBLISH_ENABLED: "true",
        PUBLISH_DRY_RUN: "false",
        PUBLISH_RUN_AUTHORIZED: "true",
        GITHUB_REF_NAME: "main"
      },
      expected: "No explicitly approved Facebook feed campaigns exist."
    },
    {
      name: "long-form publisher permits the protected production branch but finds no approved campaign",
      script: "scripts/publish-facebook-video.mjs",
      env: {
        PUBLISH_ENABLED: "true",
        PUBLISH_DRY_RUN: "false",
        PUBLISH_RUN_AUTHORIZED: "true",
        GITHUB_REF_NAME: "main"
      },
      expected: "No explicitly approved long-form video campaigns exist."
    },
    {
      name: "Reel publisher permits the protected production branch but finds no approved campaign",
      script: "scripts/publish-facebook-reel.mjs",
      env: {
        PUBLISH_ENABLED: "true",
        PUBLISH_DRY_RUN: "false",
        PUBLISH_RUN_AUTHORIZED: "true",
        GITHUB_REF_NAME: "main"
      },
      expected: "No explicitly approved Facebook Reel campaigns exist."
    }
  ],
  {
    name: "legacy feed publisher remains disabled by default",
    script: "scripts/publish-facebook.mjs",
    env: { PUBLISH_ENABLED: "false", PUBLISH_DRY_RUN: "true" },
    expected: "PUBLISH_ENABLED is not true; public publishing is disabled."
  },
  {
    name: "legacy feed publisher respects the emergency stop before live mode",
    script: "scripts/publish-facebook.mjs",
    env: { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "true", EMERGENCY_STOP: "" },
    expected: "EMERGENCY_STOP is active; public publishing is blocked."
  },
  {
    name: "legacy feed publisher requires separate per-run authorization before live mode",
    script: "scripts/publish-facebook.mjs",
    env: { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false" },
    expected: "PUBLISH_RUN_AUTHORIZED is not true; a separate per-run authorization is required."
  },
  {
    name: "legacy feed publisher with per-run authorization finds no approved campaigns",
    script: "scripts/publish-facebook.mjs",
    env: { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false", PUBLISH_RUN_AUTHORIZED: "true", GITHUB_REF_NAME: "main" },
    expected: "No explicitly approved Facebook feed campaigns exist."
  },
  {
    name: "legacy feed publisher refuses a non-Nature-Frontiers Page",
    script: "scripts/publish-facebook.mjs",
    env: { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false", PUBLISH_RUN_AUTHORIZED: "true", META_PAGE_ID: "123456789", GITHUB_REF_NAME: "main" },
    expected: "META_PAGE_ID does not match the exact Nature Frontiers Page ID"
  },
  {
    name: "long-form publisher is disabled by default",
    script: "scripts/publish-facebook-video.mjs",
    env: { PUBLISH_ENABLED: "false", PUBLISH_DRY_RUN: "true" },
    expected: "PUBLISH_ENABLED is not true; public publishing is disabled."
  },
  {
    name: "long-form publisher respects the emergency stop before live mode",
    script: "scripts/publish-facebook-video.mjs",
    env: { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "true", EMERGENCY_STOP: "true" },
    expected: "EMERGENCY_STOP is active; public publishing is blocked."
  },
  {
    name: "long-form publisher requires one-shot authorization for live mode",
    script: "scripts/publish-facebook-video.mjs",
    env: { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false" },
    expected: "PUBLISH_RUN_AUTHORIZED is not true; a separate per-run authorization is required."
  },
  {
    name: "long-form publisher refuses a non-Nature-Frontiers Page",
    script: "scripts/publish-facebook-video.mjs",
    env: { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false", PUBLISH_RUN_AUTHORIZED: "true", META_PAGE_ID: "123456789", GITHUB_REF_NAME: "main" },
    expected: "META_PAGE_ID does not match the exact Nature Frontiers Page ID"
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
    env: { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false", PUBLISH_RUN_AUTHORIZED: "true", GITHUB_REF_NAME: "main" },
    expected: "No explicitly approved long-form Facebook video campaigns exist."
  },
  {
    name: "discovery Reel publisher is disabled by default",
    script: "scripts/publish-facebook-reel.mjs",
    env: { PUBLISH_ENABLED: "false", PUBLISH_DRY_RUN: "true" },
    expected: "PUBLISH_ENABLED is not true; public publishing is disabled."
  },
  {
    name: "discovery Reel publisher respects the emergency stop before live mode",
    script: "scripts/publish-facebook-reel.mjs",
    env: { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "true", EMERGENCY_STOP: "true" },
    expected: "EMERGENCY_STOP is active; public publishing is blocked."
  },
  {
    name: "discovery Reel publisher requires one-shot authorization for live mode",
    script: "scripts/publish-facebook-reel.mjs",
    env: { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false" },
    expected: "PUBLISH_RUN_AUTHORIZED is not true; a separate per-run authorization is required."
  },
  {
    name: "discovery Reel publisher refuses a non-Nature-Frontiers Page",
    script: "scripts/publish-facebook-reel.mjs",
    env: { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false", PUBLISH_RUN_AUTHORIZED: "true", META_PAGE_ID: "123456789", GITHUB_REF_NAME: "main" },
    expected: "META_PAGE_ID does not match the exact Nature Frontiers Page ID"
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
    env: { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false", PUBLISH_RUN_AUTHORIZED: "true", GITHUB_REF_NAME: "main" },
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
