const CIRCUIT_BREAKER_CODES = new Set([3, 4, 6, 8, 17, 190, 200, 368, 613, 80001, 80002]);

export function shouldOpenMetaCircuit({ status, code, message = "" } = {}) {
  const numericCode = Number(code);
  if (status === 429 || CIRCUIT_BREAKER_CODES.has(numericCode)) return true;
  return /spam|block(?:ed|ing)?|checkpoint|integrity restriction|action restricted|temporarily restricted/i.test(String(message));
}

export function parseMetaUsageHeader(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function shouldOpenMetaCircuitFromUsage({ app, page, businessUseCase, retryAfter } = {}) {
  if (typeof retryAfter === "string" && retryAfter.trim() && Number(retryAfter) > 0) return true;
  const roots = [app, page, businessUseCase].map(parseMetaUsageHeader).filter(Boolean);
  const watchedMetrics = new Set(["call_count", "total_cputime", "total_time", "cpu_time", "time"]);
  const visit = (value) => {
    if (!value || typeof value !== "object") return false;
    for (const [key, item] of Object.entries(value)) {
      if (watchedMetrics.has(key.toLowerCase()) && Number.isFinite(Number(item)) && Number(item) >= 90) return true;
      if (item && typeof item === "object" && visit(item)) return true;
    }
    return false;
  };
  return roots.some(visit);
}

export function redactMetaError(error = {}) {
  return {
    code: Number.isInteger(Number(error.code)) ? Number(error.code) : null,
    error_subcode: Number.isInteger(Number(error.error_subcode)) ? Number(error.error_subcode) : null,
    type: typeof error.type === "string" ? error.type.slice(0, 100) : null,
    message: typeof error.message === "string" ? error.message.slice(0, 500) : "Unspecified Meta API error",
    fbtrace_id: typeof error.fbtrace_id === "string" ? error.fbtrace_id.slice(0, 100) : null
  };
}
