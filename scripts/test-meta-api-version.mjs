import assert from "node:assert/strict";

const docsUrl = "https://developers.facebook.com/docs/graph-api/guides/versioning";
const issuesUrl = "https://api.github.com/repos/clickerrish-art/nature-frontiers/issues?state=open&per_page=100";
const originalFetch = globalThis.fetch;
const originalLog = console.log;
const originalEnv = { ...process.env };
let scenarioNumber = 0;

async function runScenario({ docsStatus = 200, docsBody = "Latest Graph API version v27.0", pinned = "v26.0", issuesStatus = 200 }) {
  const calls = [];
  const logs = [];
  let createdIssue = null;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method || "GET" });
    if (url === docsUrl) return new Response(docsBody, { status: docsStatus });
    if (url === issuesUrl) return new Response(JSON.stringify([]), { status: issuesStatus });
    if (url === "https://api.github.com/repos/clickerrish-art/nature-frontiers/issues" && init.method === "POST") {
      createdIssue = JSON.parse(init.body);
      return new Response(JSON.stringify({ html_url: "https://github.com/clickerrish-art/nature-frontiers/issues/999" }), { status: 201 });
    }
    throw new Error("Unexpected network request: " + url);
  };
  console.log = (...values) => logs.push(values.join(" "));
  process.env.META_GRAPH_API_VERSION = pinned;
  process.env.GITHUB_ACTIONS = "true";
  process.env.GITHUB_TOKEN = "test-token";
  process.env.GITHUB_REPOSITORY = "clickerrish-art/nature-frontiers";
  delete process.env.GITHUB_STEP_SUMMARY;
  process.exitCode = undefined;
  await import("./check-meta-api-version.mjs?scenario=" + (++scenarioNumber));
  const exitCode = process.exitCode;
  process.exitCode = undefined;
  return { calls, logs: logs.join("\n"), createdIssue, exitCode };
}

try {
  const mismatch = await runScenario({ pinned: "v26.0", docsBody: "Latest Graph API version v27.0" });
  assert.equal(mismatch.exitCode, 1);
  assert.match(mismatch.logs, /Official Meta Graph API version currently documented: v27\.0/);
  assert.match(mismatch.logs, /Repository pinned version: v26\.0/);
  assert.ok(mismatch.createdIssue, "a version mismatch should create a maintenance issue when GitHub API access is available");
  assert.match(mismatch.createdIssue.title, /pinned v26\.0, latest v27\.0/);
  assert.ok(!mismatch.logs.includes("${latest}"), "template interpolation must not be escaped");

  const current = await runScenario({ pinned: "v27.0", docsBody: "Latest Graph API version v27.0" });
  assert.equal(current.exitCode, undefined);
  assert.match(current.logs, /Version pin matches the current official version/);
  assert.equal(current.calls.filter((call) => call.method === "POST").length, 0);

  const forbidden = await runScenario({ pinned: "v26.0", docsBody: "Latest Graph API version v27.0", issuesStatus: 403 });
  assert.equal(forbidden.exitCode, 1);
  assert.match(forbidden.logs, /Could not inspect open maintenance issues \(HTTP 403\)/);
  assert.ok(!forbidden.logs.includes("${existing.status}"), "HTTP error details must be interpolated");

  const docsUnavailable = await runScenario({ docsStatus: 503, docsBody: "unavailable" });
  assert.equal(docsUnavailable.exitCode, 1);
  assert.match(docsUnavailable.logs, /Meta versioning page returned HTTP 503/);
  assert.ok(!docsUnavailable.logs.includes("${response.status}"));

  console.log("PASS: Meta API version monitor interpolates live versions and HTTP errors, opens mismatch issues, and passes matching pins");
} finally {
  globalThis.fetch = originalFetch;
  console.log = originalLog;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  for (const [key, value] of Object.entries(originalEnv)) process.env[key] = value;
  process.exitCode = 0;
}
