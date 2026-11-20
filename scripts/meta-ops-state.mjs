import { randomUUID } from "node:crypto";
import { shouldOpenMetaCircuit, shouldOpenMetaCircuitFromUsage, parseMetaUsageHeader, redactMetaError } from "./meta-error-policy.mjs";

const API_ROOT = "https://api.github.com/repos/";
const MAX_AUDIT_EVENTS = 500;

export function createGitHubMetaStateStore({ repository, branch, githubToken, fetchImpl = fetch }) {
  if (!repository?.includes("/") || !branch || !githubToken) {
    throw new Error("GitHub repository, branch and token are required for durable Meta circuit-breaker/audit state.");
  }
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: "Bearer " + githubToken,
    "X-GitHub-Api-Version": "2022-11-28"
  };
  async function readJsonFile(path) {
    const url = API_ROOT + repository + "/contents/" + path + "?ref=" + encodeURIComponent(branch);
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Unable to read durable Meta state file " + path + " (HTTP " + response.status + ").");
    const payload = await response.json();
    const encoded = String(payload.content ?? "").replace(/[\r\n]/g, "");
    return { sha: payload.sha, value: JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) };
  }
  async function writeJsonFile(path, sha, value, message) {
    const url = API_ROOT + repository + "/contents/" + path;
    const content = Buffer.from(JSON.stringify(value, null, 2) + "\n").toString("base64");
    const response = await fetchImpl(url, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ message, content, sha, branch }),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error("Unable to persist durable Meta state file " + path + " (HTTP " + response.status + ").");
    return response.json();
  }

  return {
    async readCircuitState() {
      const file = await readJsonFile("data/meta-circuit-breaker.json");
      if (!file.value || !["open", "closed"].includes(file.value.state)) {
        throw new Error("Meta circuit-breaker state is malformed; fail closed.");
      }
      return file.value;
    },
    async recordEvent(event, openCircuit) {
      if (openCircuit) {
        const stateFile = await readJsonFile("data/meta-circuit-breaker.json");
        const current = stateFile.value;
        if (current.state !== "open") {
          const next = {
            ...current,
            state: "open",
            open: true,
            opened_at: event.timestamp,
            reason: event.circuit_reason ?? "Meta API safety threshold reached",
            opened_by_event_id: event.event_id,
            last_event_at: event.timestamp,
            updated_at: event.timestamp
          };
          await writeJsonFile("data/meta-circuit-breaker.json", stateFile.sha, next, "Open Meta publishing circuit breaker after safety event");
        } else {
          const next = { ...current, open: true, last_event_at: event.timestamp, updated_at: event.timestamp };
          await writeJsonFile("data/meta-circuit-breaker.json", stateFile.sha, next, "Update open Meta circuit-breaker event time");
        }
      }
      const auditFile = await readJsonFile("data/meta-api-audit.json");
      if (!Array.isArray(auditFile.value)) throw new Error("Meta API audit log is malformed; fail closed.");
      const nextAudit = [...auditFile.value, { ...event, circuit_opened: openCircuit === true }].slice(-MAX_AUDIT_EVENTS);
      await writeJsonFile("data/meta-api-audit.json", auditFile.sha, nextAudit, "Record redacted Meta API audit event");
    }
  };
}

export function createMetaAuditedFetch({ fetchImpl = fetch, readCircuitState, recordEvent }) {
  if (typeof readCircuitState !== "function" || typeof recordEvent !== "function") {
    throw new Error("Meta audited fetch requires durable circuit-state read and event persistence functions.");
  }
  return async function metaAuditedFetch(input, init = {}) {
    const rawUrl = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
    const url = new URL(rawUrl);
    if (url.hostname !== "graph.facebook.com") return fetchImpl(input, init);
    const method = String(init.method ?? input?.method ?? "GET").toUpperCase();
    const mutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
    if (mutation) {
      const state = await readCircuitState();
      if (state?.state === "open" || state?.open === true) {
        const event = {
          event_id: randomUUID(), timestamp: new Date().toISOString(), correlation_id: randomUUID(),
          method, endpoint: url.pathname, status: null, latency_ms: 0, blocked: true,
          meta_error: null, usage: null, retry_after: null, circuit_reason: "Existing Meta circuit breaker is open"
        };
        await recordEvent(event, false);
        throw new Error("Meta publishing circuit breaker is OPEN; mutation blocked until owner review and explicit reset.");
      }
    }

    const started = Date.now();
    let response;
    try {
      response = await fetchImpl(input, init);
    } catch (error) {
      const event = {
        event_id: randomUUID(), timestamp: new Date().toISOString(), correlation_id: randomUUID(),
        method, endpoint: url.pathname, status: null, latency_ms: Date.now() - started,
        network_error: error?.name ?? "NetworkError", meta_error: null, usage: null, retry_after: null
      };
      try { await recordEvent(event, false); }
      catch { throw new Error("Meta request failed and durable audit logging also failed; reconcile any ambiguous result before retrying."); }
      throw error;
    }

    const usage = {
      app: parseMetaUsageHeader(response.headers.get("x-app-usage")),
      page: parseMetaUsageHeader(response.headers.get("x-page-usage")),
      business_use_case: parseMetaUsageHeader(response.headers.get("x-business-use-case-usage"))
    };
    const retryAfter = response.headers.get("retry-after");
    let payload = {};
    if (!response.ok) payload = await response.clone().json().catch(() => ({}));
    const error = payload?.error ?? {};
    const openCircuit = shouldOpenMetaCircuit({
      status: response.status,
      code: error.code,
      message: error.message ?? ""
    }) || shouldOpenMetaCircuitFromUsage({
      app: response.headers.get("x-app-usage"),
      page: response.headers.get("x-page-usage"),
      businessUseCase: response.headers.get("x-business-use-case-usage"),
      retryAfter
    });
    const event = {
      event_id: randomUUID(),
      timestamp: new Date().toISOString(),
      correlation_id: randomUUID(),
      method,
      endpoint: url.pathname,
      status: response.status,
      latency_ms: Date.now() - started,
      meta_error: response.ok ? null : redactMetaError(error),
      usage,
      retry_after: retryAfter,
      circuit_reason: openCircuit ? "Meta rate-limit, auth, permission, abuse or usage threshold" : null
    };
    try { await recordEvent(event, openCircuit); }
    catch {
      throw new Error("Meta response received but durable audit/circuit state could not be saved; treat the result as ambiguous and reconcile before any retry.");
    }
    return response;
  };
}
