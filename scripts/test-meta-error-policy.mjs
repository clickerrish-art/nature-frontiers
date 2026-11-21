import assert from "node:assert/strict";
import { shouldOpenMetaCircuit, shouldOpenMetaCircuitFromUsage } from "./meta-error-policy.mjs";

const cases = [
  [{ status: 429 }, true, "HTTP 429 opens the circuit"],
  [{ status: 400, code: 4 }, true, "app rate limit code 4 opens the circuit"],
  [{ status: 400, code: 17 }, true, "user rate limit code 17 opens the circuit"],
  [{ status: 400, code: 368 }, true, "abuse/disallowed action code 368 opens the circuit"],
  [{ status: 400, code: 3 }, true, "code 3 opens the circuit"],
  [{ status: 400, code: 6 }, true, "code 6 opens the circuit"],
  [{ status: 400, code: 8 }, true, "code 8 opens the circuit"],
  [{ status: 400, code: 190 }, true, "invalid OAuth token opens the circuit"],
  [{ status: 400, code: 200 }, true, "permission error opens the circuit"],
  [{ status: 400, code: 80001 }, true, "Page rate-limit code opens the circuit"],
  [{ status: 400, code: 80002 }, true, "Instagram rate-limit code opens the circuit"],
  [{ status: 400, message: "Page blocked for spam activity" }, true, "spam/block signals open the circuit"],
  [{ status: 500, code: 1, message: "Temporary service error" }, false, "ordinary transient server errors are not classified as policy blocks"],
  [{ status: 400, code: 100, message: "Invalid parameter" }, false, "ordinary validation errors are not classified as circuit events"]
];
for (const [input, expected, name] of cases) {
  assert.equal(shouldOpenMetaCircuit(input), expected, name);
  console.log("PASS:", name);
}
const usageCases = [
  [{ app: JSON.stringify({ call_count: 90 }) }, true, "app usage at 90 percent opens circuit"],
  [{ page: JSON.stringify({ total_time: 95 }) }, true, "Page total-time usage at 95 percent opens circuit"],
  [{ businessUseCase: JSON.stringify({ "123": [{ call_count: 91 }] }) }, true, "nested business-use-case usage opens circuit"],
  [{ app: JSON.stringify({ call_count: 89, total_time: 40 }) }, false, "usage below threshold does not open circuit"],
  [{ app: "not-json" }, false, "malformed usage header is ignored safely"],
  [{ retryAfter: "60" }, true, "Retry-After header opens circuit"]
];
for (const [input, expected, name] of usageCases) {
  assert.equal(shouldOpenMetaCircuitFromUsage(input), expected, name);
  console.log("PASS:", name);
}
console.log("Meta circuit-breaker policy tests passed: " + (cases.length + usageCases.length) + "/" + (cases.length + usageCases.length));
