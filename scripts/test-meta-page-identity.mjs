import test from "node:test";
import assert from "node:assert/strict";
import { isVerifiedMetaPageIdentity } from "./meta-page-identity.mjs";

test("accepts matching numeric configured and independently expected Page IDs", () => {
  assert.equal(isVerifiedMetaPageIdentity("1431329126735709", "1431329126735709"), true);
});

test("rejects mismatched Page IDs", () => {
  assert.equal(isVerifiedMetaPageIdentity("1003575786161492", "1431329126735709"), false);
});

test("rejects missing, empty and non-numeric Page IDs", () => {
  for (const [actual, expected] of [
    ["", "1431329126735709"],
    ["1431329126735709", ""],
    [undefined, "1431329126735709"],
    ["1431329126735709", undefined],
    ["nature-frontiers", "nature-frontiers"],
    ["1431329126735709x", "1431329126735709x"]
  ]) assert.equal(isVerifiedMetaPageIdentity(actual, expected), false);
});
