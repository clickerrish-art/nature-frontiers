export function createMemoryInstagramStateStore(initial = { version: 1, reservations: {} }) {
  let state = structuredClone(initial);
  return {
    async read() { return structuredClone(state); },
    async write(next) { state = structuredClone(next); return structuredClone(state); }
  };
}

export function createGitHubInstagramStateStore({ token, repository, branch, fetchImpl = fetch }) {
  if (!token || !repository || !branch || branch === "main" || branch === "master") {
    throw new Error("Instagram state requires a token, repository and a non-default feature branch.");
  }
  const path = "data/instagram-publishing-state.json";
  const url = `https://api.github.com/repos/${repository}/contents/${path}`;
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" };
  async function readFile() {
    const response = await fetchImpl(`${url}?ref=${encodeURIComponent(branch)}`, { headers });
    if (!response.ok) throw new Error(`Instagram durable state read failed (HTTP ${response.status}).`);
    const file = await response.json();
    const state = JSON.parse(Buffer.from(String(file.content).replace(/\\s/g, ""), "base64").toString("utf8"));
    if (state?.version !== 1 || !state.reservations || typeof state.reservations !== "object") throw new Error("Instagram durable state schema is invalid.");
    return { sha: file.sha, state };
  }
  return {
    async read() { return (await readFile()).state; },
    async write(next) {
      const current = await readFile();
      const response = await fetchImpl(url, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Persist Instagram campaign reservation and recovery state",
          content: Buffer.from(JSON.stringify(next, null, 2) + "\n").toString("base64"),
          sha: current.sha,
          branch
        })
      });
      if (!response.ok) throw new Error(`Instagram state compare-and-swap failed (HTTP ${response.status}); stop and inspect before any publish retry.`);
      return response.json();
    }
  };
}
