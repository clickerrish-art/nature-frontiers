import test from "node:test";
import assert from "node:assert/strict";
import { createMetaAuditedFetch, createGitHubMetaStateStore } from "./meta-ops-state.mjs";

function response(payload = {}, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json", ...headers } });
}
function store(initial = { state: "closed", open: false }) {
  const state = { ...initial };
  const events = [];
  return {
    state,
    events,
    readCircuitState: async () => ({ ...state }),
    recordEvent: async (event, open) => {
      events.push({ ...event, circuit_opened: open });
      if (open) { state.state = "open"; state.open = true; state.reason = event.circuit_reason; }
    }
  };
}

test("audits successful Graph API reads without recording query strings or credentials", async () => {
  const memory = store();
  let calls = 0;
  const fetchImpl = async () => { calls++; return response({ id: "page-1" }); };
  const audited = createMetaAuditedFetch({ fetchImpl, readCircuitState: memory.readCircuitState, recordEvent: memory.recordEvent });
  const result = await audited("https://graph.facebook.com/v27.0/123?access_token=secret", { method: "GET" });
  assert.equal(result.status, 200);
  assert.equal(calls, 1);
  assert.equal(memory.events.length, 1);
  assert.equal(memory.events[0].endpoint, "/v27.0/123");
  assert.ok(!JSON.stringify(memory.events).includes("secret"));
});

test("opens the persistent circuit on HTTP 429 and blocks the next mutation before network access", async () => {
  const memory = store();
  let calls = 0;
  const fetchImpl = async () => { calls++; return response({ error: { code: 4, message: "Application request limit reached" } }, 429); };
  const audited = createMetaAuditedFetch({ fetchImpl, readCircuitState: memory.readCircuitState, recordEvent: memory.recordEvent });
  const result = await audited("https://graph.facebook.com/v27.0/page/media", { method: "POST" });
  assert.equal(result.status, 429);
  assert.equal(memory.state.state, "open");
  await assert.rejects(audited("https://graph.facebook.com/v27.0/page/media_publish", { method: "POST" }), /circuit breaker is OPEN/);
  assert.equal(calls, 1, "blocked follow-up mutation must not reach Meta");
  assert.ok(memory.events.some((event) => event.blocked === true));
});

test("allows read-only reconciliation GETs while the mutation circuit is open", async () => {
  const memory = store({ state: "open", open: true });
  let calls = 0;
  const audited = createMetaAuditedFetch({
    fetchImpl: async () => { calls++; return response({ id: "media-1" }); },
    readCircuitState: memory.readCircuitState,
    recordEvent: memory.recordEvent
  });
  const result = await audited("https://graph.facebook.com/v27.0/media-1", { method: "GET" });
  assert.equal(result.status, 200);
  assert.equal(calls, 1);
});

test("opens circuit on permission errors and usage headers at 90 percent", async () => {
  for (const [status, payload, headers] of [
    [400, { error: { code: 200, message: "Permissions error" } }, {}],
    [200, { id: "page-1" }, { "x-app-usage": JSON.stringify({ call_count: 90 }) }]
  ]) {
    const memory = store();
    const audited = createMetaAuditedFetch({
      fetchImpl: async () => response(payload, status, headers),
      readCircuitState: memory.readCircuitState,
      recordEvent: memory.recordEvent
    });
    await audited("https://graph.facebook.com/v27.0/page", { method: "GET" });
    assert.equal(memory.state.state, "open");
  }
});

test("fails closed when audit persistence fails after a Meta response", async () => {
  const memory = store();
  const audited = createMetaAuditedFetch({
    fetchImpl: async () => response({ id: "created-object" }),
    readCircuitState: memory.readCircuitState,
    recordEvent: async () => { throw new Error("GitHub state unavailable"); }
  });
  await assert.rejects(audited("https://graph.facebook.com/v27.0/page/media", { method: "POST" }), /durable audit\/circuit state could not be saved/);
});

test("GitHub state adapter durably opens the circuit before appending its audit event", async () => {
  const files = {
    "data/meta-circuit-breaker.json": { sha: "circuit-sha-1", value: { state: "closed", open: false, opened_at: null } },
    "data/meta-api-audit.json": { sha: "audit-sha-1", value: [] }
  };
  let sequence = 1;
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const path = parsed.pathname.split("/contents/")[1];
    if (!files[path]) return new Response("missing", { status: 404 });
    if (!init.method || init.method === "GET") {
      const file = files[path];
      return response({ sha: file.sha, content: Buffer.from(JSON.stringify(file.value)).toString("base64") });
    }
    if (init.method === "PUT") {
      const body = JSON.parse(init.body);
      files[path] = { sha: "sha-" + (++sequence), value: JSON.parse(Buffer.from(body.content, "base64").toString("utf8")) };
      return response({ content: { sha: files[path].sha } });
    }
    return new Response("method not allowed", { status: 405 });
  };
  const store = createGitHubMetaStateStore({
    repository: "owner/repository",
    branch: "feature-branch",
    githubToken: "test-token",
    fetchImpl
  });
  await store.recordEvent({ event_id: "event-1", timestamp: "2026-11-20T12:00:00.000Z", circuit_reason: "HTTP 429" }, true);
  assert.equal((await store.readCircuitState()).state, "open");
  assert.equal(files["data/meta-api-audit.json"].value.length, 1);
  assert.equal(files["data/meta-api-audit.json"].value[0].circuit_opened, true);
});

test("records network errors without retrying the Meta request", async () => {
  const memory = store();
  let calls = 0;
  const audited = createMetaAuditedFetch({
    fetchImpl: async () => { calls++; throw new TypeError("network failed"); },
    readCircuitState: memory.readCircuitState,
    recordEvent: memory.recordEvent
  });
  await assert.rejects(audited("https://graph.facebook.com/v27.0/page/media", { method: "POST" }), /network failed/);
  assert.equal(calls, 1);
  assert.equal(memory.events.length, 1);
  assert.equal(memory.state.state, "closed");
});
