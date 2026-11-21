import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLongFormVideoDescription, REQUIRED_PRODUCT_LINKS, APPROVED_AFFILIATE_LINKS,
  PRODUCT_DISCLOSURE, AFFILIATE_DISCLOSURE
} from "./video-description.mjs";

test("builds an editorial-only description without YouTube or commercial links", () => {
  const description = buildLongFormVideoDescription({ episodeDescription: "A responsible wildlife explainer." });
  assert.equal(description, "A responsible wildlife explainer.");
  assert.ok(!description.includes("youtube.com"));
  assert.ok(!description.includes("selar.com"));
  assert.ok(!description.includes("safari.com"));
});

test("adds only explicitly selected approved product links with paid disclosure", () => {
  const product = REQUIRED_PRODUCT_LINKS[0];
  const description = buildLongFormVideoDescription({ episodeDescription: "Wildlife creator resources.", productLinks: [product.url] });
  assert.ok(description.includes(product.url));
  assert.ok(description.includes(PRODUCT_DISCLOSURE));
  assert.ok(!description.includes(REQUIRED_PRODUCT_LINKS[1].url));
  assert.ok(!description.includes("youtube.com"));
});

test("adds only explicitly selected approved affiliate links with affiliate disclosure", () => {
  const affiliate = APPROVED_AFFILIATE_LINKS[0];
  const description = buildLongFormVideoDescription({ episodeDescription: "A safari planning resource.", affiliateLinks: [affiliate] });
  assert.ok(description.includes(affiliate));
  assert.ok(description.includes(AFFILIATE_DISCLOSURE));
  assert.ok(!description.includes(APPROVED_AFFILIATE_LINKS[1]));
});

test("supports optional series metadata without requiring a YouTube destination", () => {
  const description = buildLongFormVideoDescription({
    seriesTitle: "Wild Encounters",
    episodeNumber: 1,
    episodeTitle: "The Patient Ambush",
    episodeDescription: "A wildlife explainer.",
    nextEpisodeTeaser: "Next: crocodile senses."
  });
  assert.ok(description.includes("Wild Encounters — Episode 1: The Patient Ambush"));
  assert.ok(description.includes("Next episode: Next: crocodile senses."));
  assert.ok(!description.includes("youtube.com"));
});

test("rejects unknown commercial URLs and incomplete series metadata", () => {
  assert.throws(() => buildLongFormVideoDescription({ episodeDescription: "Text", productLinks: ["https://evil.example/"] }), /owner-approved catalogue/);
  assert.throws(() => buildLongFormVideoDescription({ episodeDescription: "Text", affiliateLinks: ["https://evil.example/"] }), /owner-approved Safari catalogue/);
  assert.throws(() => buildLongFormVideoDescription({ seriesTitle: "Series", episodeDescription: "Text" }), /episodeTitle is required/);
});
