import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const buffer = JSON.parse(await readFile(new URL("../content/campaigns/wild-encounters-42-piece-buffer.json", import.meta.url), "utf8"));
const reels = buffer.items.filter((item) => item.format === "reel");
const feed = buffer.items.filter((item) => item.format === "feed_post");
const ids = buffer.items.map((item) => item.id);
const wordCount = (value) => (value.match(/\b[\p{L}\p{N}’'-]+\b/gu) || []).length;

assert.equal(buffer.buffer_target.reels, 28);
assert.equal(buffer.buffer_target.feed_posts, 14);
assert.equal(buffer.buffer_target.total, 42);
assert.equal(buffer.buffer_target.window_days, 14);
assert.equal(buffer.items.length, 42);
assert.equal(reels.length, 28);
assert.equal(feed.length, 14);
assert.equal(new Set(ids).size, 42, "all 42 content IDs must be unique");
assert.equal(buffer.status, "EDITORIAL DRAFT BUFFER — NOT PRODUCTION READY");
assert.equal(buffer.policy.publishing_enabled, false);
assert.equal(buffer.policy.dry_run, true);
assert.equal(buffer.policy.emergency_stop, true);
assert.equal(buffer.policy.licensed_stock_allowed, true);
assert.equal(buffer.policy.synthetic_wildlife_media_allowed, false);

for (const item of buffer.items) {
  assert.ok(item.title && item.caption, item.id + " needs a title and caption");
  assert.ok(["ep1", "ep2", "ep3", "ep4", "ep5", "ep6"].includes(item.source_episode), item.id + " needs a source episode");
  assert.ok(item.source_urls.length >= 2, item.id + " needs multiple fact-check sources");
  assert.ok(item.source_urls.every((url) => url.startsWith("https://")), item.id + " has a non-HTTPS source");
  assert.deepEqual(item.target_platforms, ["facebook", "instagram"]);
  assert.equal(item.youtube_target, false);
  assert.equal(item.commercial, false);
  assert.equal(item.monetization_enabled, false);
  assert.equal(item.editorial_status, "draft");
  assert.equal(item.approval_status, "not_submitted");
  assert.equal(item.publication_status, "draft");
  assert.equal(item.publishable, false);
  assert.equal(item.media_url, null);
  assert.equal(item.media_sha256, null);
  assert.equal(item.approved_media_sha256, null);
  assert.equal(item.scheduled_at, null);
  assert.ok(item.required_inputs.length >= 5);
  const copy = [item.title, item.hook || "", item.narration || "", item.caption, item.visual_direction || "", item.carousel_outline || ""].join(" ").toLowerCase();
  assert.ok(!copy.includes("youtube.com"), item.id + " must not route Nature Frontiers to YouTube");
  assert.ok(!copy.includes("selar.com") && !copy.includes("safari.com"), item.id + " must remain editorial, not promotional");
}

for (const item of reels) {
  assert.equal(item.target_duration_seconds, 55);
  assert.equal(item.narration_word_target.min, 100);
  assert.equal(item.narration_word_target.max, 140);
  const words = wordCount(item.narration);
  assert.ok(words >= 100 && words <= 140, item.id + " narration has " + words + " words, outside the 50–60 second draft target");
  assert.ok(item.visual_direction && /stock|source|footage/i.test(item.visual_direction));
}

for (const item of feed) {
  assert.ok(wordCount(item.caption) >= 35, item.id + " caption is too short to stand alone");
  assert.ok(item.carousel_outline && item.carousel_outline.length > 20, item.id + " needs a useful carousel direction");
}

console.log("PASS: 42-piece editorial buffer contains 28 Reels and 14 feed posts, with sourced draft copy, correct platforms, stock safeguards and no publication-ready claims");
