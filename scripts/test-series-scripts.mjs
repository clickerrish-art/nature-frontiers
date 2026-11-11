import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const plan = JSON.parse(await readFile(new URL("../data/video-series.json", import.meta.url), "utf8"));
const scriptFiles = [
  "episode-01-the-stillness-before-the-strike.md",
  "episode-02-a-world-beneath-the-water.md",
  "episode-03-the-split-second-ambush.md",
  "episode-04-a-crocodiles-early-life.md",
  "episode-05-when-the-river-changes.md",
  "episode-06-the-rivers-hidden-balance.md"
];

test("the series has six numbered episodes in the requested 3–8 minute range", () => {
  assert.equal(plan.episodes.length, 6);
  for (const [index, episode] of plan.episodes.entries()) {
    assert.equal(episode.episode_number, index + 1);
    assert.ok(episode.target_duration_seconds >= 180 && episode.target_duration_seconds <= 480);
    assert.equal(episode.editorial_ad_breaks_seconds.length, 1);
    assert.ok(episode.editorial_ad_breaks_seconds[0] >= episode.hook_duration_seconds + 60);
  }
});

for (const [index, filename] of scriptFiles.entries()) {
  test(`episode ${index + 1} is a sourced draft with a hook before its ad break`, async () => {
    const episode = plan.episodes[index];
    const path = new URL("../content/series/wild-encounters-crocodile-behaviour/" + filename, import.meta.url);
    const markdown = await readFile(path, "utf8");
    const narration = markdown.split("## Narration draft")[1]?.split("## Footage and editorial requirements")[0] ?? "";
    const beforeBreak = narration.split("[META AD BREAK")[0];
    const words = narration.replace(/\*\*[^*]+\*\*/g, " ").replace(/\[[^\]]+\]/g, " ").match(/\b[\p{L}\p{N}’'-]+\b/gu) ?? [];
    const beforeWords = beforeBreak.replace(/\*\*[^*]+\*\*/g, " ").replace(/\[[^\]]+\]/g, " ").match(/\b[\p{L}\p{N}’'-]+\b/gu) ?? [];
    const marker = markdown.match(/\[META AD BREAK — (\d{2}):(\d{2})/);
    assert.match(markdown, /SCRIPT DRAFT — not approved for recording or publication/);
    assert.match(markdown, /Target length:\*\* 3–8 minutes/);
    assert.ok(narration.trim().startsWith(episode.hook), "the spoken narration must open with the approved hook");
    assert.ok(words.length >= 300 && words.length <= 1500, "narration draft must fit the validator's 300–1,500 word bounds");
    assert.ok(marker, "a clearly marked Meta ad-break position is required");
    assert.equal(Number(marker[1]) * 60 + Number(marker[2]), episode.editorial_ad_breaks_seconds[0]);
    assert.ok(beforeWords.length >= 240, "the hook and opening story must be established before the first ad marker");
    assert.ok(markdown.includes("## Fact-check sources"));
    assert.ok(/https:\/\//.test(markdown), "each episode must cite research sources");
    assert.ok(/original camera/i.test(markdown), "every episode must require original camera recordings");
    assert.ok(markdown.includes("Nature Frontiers on YouTube"), "each script must direct viewers to the YouTube series");
  });
}
