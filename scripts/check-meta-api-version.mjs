import { appendFile } from "node:fs/promises";

const docsUrl = "https://developers.facebook.com/docs/graph-api/guides/versioning";
const pinned = process.env.META_GRAPH_API_VERSION ?? "";
const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;

async function summary(line) {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, line + "\n");
  }
}

let response;
try {
  response = await fetch(docsUrl, {
    headers: { "user-agent": "NatureFrontiers-Meta-Version-Monitor/1.0" }
  });
} catch (error) {
  await summary("WARNING: Could not reach the official Meta Graph API versioning page: " + String(error));
  process.exitCode = 1;
}

if (response && !response.ok) {
  await summary(\`WARNING: Meta versioning page returned HTTP \${response.status}; version status is unverified.\`);
  process.exitCode = 1;
}

let latest = null;
if (response?.ok) {
  const html = await response.text();
  const match = html.match(/latest Graph API version[^\n]{0,300}?v(\d+\.\d+)/i)
    ?? html.match(/latest version[^\n]{0,200}?v(\d+\.\d+)/i);
  if (match) latest = "v" + match[1];
  if (!latest) {
    await summary("WARNING: Could not parse the current Graph API version from the official Meta page; manual review required.");
    process.exitCode = 1;
  }
}

if (latest) {
  await summary(\`Official Meta Graph API version currently documented: \${latest}\`);
  await summary(\`Repository pinned version: \${pinned || "NOT CONFIGURED"}\`);
  if (!pinned || !/^v\d+\.\d+$/.test(pinned)) {
    await summary("HOLD: Set an explicitly tested META_GRAPH_API_VERSION repository variable. No automatic version change was made.");
    process.exitCode = 1;
  } else if (pinned !== latest) {
    await summary("MAINTENANCE REQUIRED: Meta has a newer Graph API version. Test and review migration; this monitor will not auto-upgrade production.");
    process.exitCode = 1;
  } else {
    await summary("Version pin matches the current official version. Retirement date and changelog still require periodic human review.");
  }

  if (process.env.GITHUB_ACTIONS === "true" && token && repository && process.exitCode) {
    const [owner, repo] = repository.split("/");
    const title = \`Meta Graph API version review required: pinned \${pinned || "unset"}, latest \${latest}\`;
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: \`Bearer \${token}\`,
      "X-GitHub-Api-Version": "2022-11-28"
    };
    const existing = await fetch(\`https://api.github.com/repos/\${owner}/\${repo}/issues?state=open&per_page=100\`, { headers });
    if (existing.ok) {
      const issues = await existing.json();
      if (!issues.some((issue) => issue.title === title)) {
        const created = await fetch(\`https://api.github.com/repos/\${owner}/\${repo}/issues\`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            body: \`The daily version monitor found a version mismatch or unconfigured pin. Official source: \${docsUrl}. Latest: \${latest}. Pinned: \${pinned || "unset"}. Do not update production until development-app tests and owner review pass. This issue contains no credentials and no production API mutation was made.\`
          })
        });
        if (!created.ok) await summary(\`WARNING: Could not open a GitHub maintenance issue (HTTP \${created.status}).\`);
      }
    } else {
      await summary(\`WARNING: Could not inspect open maintenance issues (HTTP \${existing.status}).\`);
    }
  }
}
