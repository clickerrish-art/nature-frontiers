import test from "node:test";
import assert from "node:assert/strict";
import { createMetaAuditedFetch } from "./meta-ops-state.mjs";

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
