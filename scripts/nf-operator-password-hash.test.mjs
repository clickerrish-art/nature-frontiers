import test from "node:test";
import assert from "node:assert/strict";
import { createOperatorPasswordHash, verifyOperatorPassword, ITERATIONS } from "./nf-operator-password-hash.mjs";

test("creates a compatible PBKDF2-SHA256 operator hash", () => {
  const salt = Buffer.from("00112233445566778899aabbccddeeff", "hex");
  const hash = createOperatorPasswordHash("correct horse battery staple", salt);
  assert.match(hash, /^pbkdf2\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
  assert.equal(verifyOperatorPassword("correct horse battery staple", hash), true);
  assert.equal(verifyOperatorPassword("incorrect password", hash), false);
  assert.equal(ITERATIONS, 100000);
});

test("rejects weak passwords and malformed hashes", () => {
  assert.throws(() => createOperatorPasswordHash("short"));
  assert.equal(verifyOperatorPassword("anything", "pbkdf2$1$00$00"), false);
});
