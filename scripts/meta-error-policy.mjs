const CIRCUIT_BREAKER_CODES = new Set([3, 4, 6, 8, 17, 190, 200, 368]);

export function shouldOpenMetaCircuit({ status, code, message = "" } = {}) {
  const numericCode = Number(code);
  if (status === 429 || CIRCUIT_BREAKER_CODES.has(numericCode)) return true;
  return /spam|block(?:ed|ing)?|checkpoint|integrity restriction|action restricted|temporarily restricted/i.test(String(message));
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
