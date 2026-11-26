import { test } from "node:test";
import assert from "node:assert/strict";
import { metaGraphRead } from "./meta-oauth.js";

test("Meta Graph reads reject unexpected redirects without following them", async () => {
  const originalFetch = globalThis.fetch;
  let redirectMode;
  globalThis.fetch = async (_input, init = {}) => {
    redirectMode = init.redirect;
    return new Response(null, {
      status: 302,
      headers: { location: "https://unexpected.example.invalid/redirect" }
    });
  };
  try {
    await assert.rejects(
      () => metaGraphRead("me/permissions", "test-token", "v27.0"),
      error => error?.status === 502 && /Meta OAuth failed during graph_api_read/.test(error.message)
    );
    assert.equal(redirectMode, "manual");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
