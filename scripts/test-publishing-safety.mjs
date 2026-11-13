import { spawnSync } from "node:child_process";

const cases = [
  {
    name: "emergency stop defaults active even if live gates are enabled",
    env: { PUBLISH_EMERGENCY_STOP: "", PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false" },
    expected: "PUBLISH_EMERGENCY_STOP is active; publishing is blocked."
  },
  {
    name: "publishing remains disabled when emergency stop is explicitly released but repository opt-in is false",
    env: { PUBLISH_EMERGENCY_STOP: "false", PUBLISH_ENABLED: "false", PUBLISH_DRY_RUN: "true" },
    expected: "PUBLISH_ENABLED is not true; public publishing is disabled."
  },
  {
    name: "enabled workflow does nothing without approved campaigns",
    env: { PUBLISH_EMERGENCY_STOP: "false", PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "true" },
    expected: "No explicitly approved Facebook campaigns exist."
  },
  {
    name: "live mode still does nothing without approved campaigns",
    env: { PUBLISH_EMERGENCY_STOP: "false", PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false" },
    expected: "No explicitly approved Facebook campaigns exist."
  }
];

let failed = 0;
for (const test of cases) {
  const result = spawnSync(process.execPath, ["scripts/publish-facebook.mjs"], {
    encoding: "utf8",
    env: { ...process.env, ...test.env }
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
if (failed) process.exit(1);
console.log("Publishing safety tests passed. No platform API requests were made.");
