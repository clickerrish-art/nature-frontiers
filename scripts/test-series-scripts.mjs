import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const plan = JSON.parse(await readFile(new URL("../data/video-series.json", import.meta.url), "utf8"));
const descriptions = JSON.parse(await readFile(new URL("../content/series/wild-encounters-crocodile-behaviour/episode-descriptions.json", import.meta.url), "utf8"));
const scriptFiles = [
  "episode-01-the-stillness-before-the-strike.md",
  "episode-02-a-world-beneath-the-water.md",
  "episode-03-the-split-second-ambush.md",
  "episode-04-a-crocodiles-early-life.md",
  "episode-05-when-the-river-changes.md",
  "episode-06-the-rivers-hidden-balance.md"
];

test("series media policy permits licensed stock with disclosure and prohibits synthetic wildlife media", () => {
  assert.equal(plan.wildlife_media_policy.licensed_stock_allowed, true);
  assert.equal(plan.wildlife_media_policy.original_camera_recording_allowed, true);
  assert.equal(plan.wildlife_media_policy.synthetic_wildlife_media_allowed, false);
  assert.match(plan.wildlife_media_policy.stock_disclosure, /Licensed stock footage/i);
  assert.equal(plan.wildlife_media_policy.monetization_enabled, false);
});

test("every episode description is editorial-first with no forced YouTube, product or affiliate links", () => {
  assert.equal(descriptions.episodes.length, 6);
  assert.match(descriptions.description_policy, /Do not append YouTube links/i);
  for (const [index, episode] of descriptions.episodes.entries()) {
    assert.equal(episode.episode_number, index + 1);
    assert.ok(episode.description.includes(episode.episode_title));
    assert.deepEqual(episode.product_links, []);
    assert.deepEqual(episode.affiliate_links, []);
    assert.ok(!episode.description.includes("youtube.com"));
    assert.ok(!episode.description.includes("selar.com"));
    assert.ok(!episode.description.includes("safari.com"));
  }
});

test("the series has six numbered episodes in the requested 3–8 minute range without default ad breaks", () => {
  assert.equal(plan.episodes.length, 6);
  for (const [index, episode] of plan.episodes.entries()) {
    assert.equal(episode.episode_number, index + 1);
    assert.ok(episode.target_duration_seconds >= 180 && episode.target_duration_seconds <= 480);
    assert.equal(episode.editorial_ad_breaks_seconds, undefined);
    assert.equal(episode.editorial_ad_break_notes, undefined);
  }
});

for (const [index, filename] of scriptFiles.entries()) {
  test(`episode ${index + 1} is a sourced draft with a hook-first narration and stock disclosure policy`, async () => {
    const episode = plan.episodes[index];
    const path = new URL("../content/series/wild-encounters-crocodile-behaviour/" + filename, import.meta.url);
    const markdown = await readFile(path, "utf8");
    const narration = markdown.split("## Narration draft")[1]?.split("## Footage and editorial requirements")[0] ?? "";
    const words = narration.replace(/\*\*[^*]+\*\*/g, " ").replace(/\[[^\]]+\]/g, " ").match(/\b[\p{L}\p{N}’'-]+\b/gu) ?? [];
    assert.match(markdown, /SCRIPT DRAFT — not approved for recording or publication/);
    assert.match(markdown, /Target length:\*\* 3–8 minutes/);
    assert.ok(narration.trim().startsWith(episode.hook), "spoken narration must open with the approved hook");
    assert.ok(words.length >= 300 && words.length <= 1500, "narration draft must fit the 300–1,500 word bounds");
    assert.ok(!markdown.includes("[META AD BREAK"), "no ad break is inserted unless separately approved");
    assert.ok(!markdown.includes("youtube.com"), "Nature Frontiers scripts must not direct viewers to YouTube");
    assert.match(markdown, /properly licensed stock/i, "scripts must allow properly licensed stock under the owner-approved policy");
    assert.match(markdown, /on-screen disclosure/i, "scripts must require visible stock disclosure");
    assert.match(markdown, /## Fact-check sources/);
    assert.ok(/https:\/\//.test(markdown), "each episode must cite research sources");
  });
}
