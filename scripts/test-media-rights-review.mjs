import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const review = JSON.parse(await readFile(new URL("../data/media-rights-review.json", import.meta.url), "utf8"));
assert.equal(review.schema_version, 1);
assert.equal(review.brand, "Nature Frontiers");
assert.equal(review.license_findings.editing_permitted, true);
assert.equal(review.license_findings.social_media_use_explicitly_includes_facebook_and_instagram, true);
assert.equal(review.license_findings.attribution_required, false);
assert.ok(review.license_findings.restrictions.length >= 4);
assert.match(review.license_findings.territorial_scope, /worldwide, non-exclusive and royalty-free/i);
assert.match(review.license_findings.territorial_scope, /additional third-party/i);
assert.ok(review.license_terms_source.endsWith("/terms-of-service/"));
assert.equal(review.license_terms_last_updated, "2026-10-20");
assert.equal(review.assets.length, 5);
const ids = new Set();
for (const asset of review.assets) {
  assert.ok(asset.pexels_id && asset.creator && asset.source_page.startsWith("https://www.pexels.com/video/"));
  assert.ok(asset.source_file_url.startsWith("https://videos.pexels.com/video-files/"));
  assert.ok(asset.canva_asset_id);
  assert.equal(asset.source_license_label, "Free");
  assert.equal(asset.source_review, "passed");
  assert.equal(asset.final_export_sha256, null);
  assert.equal(asset.final_audio_review, "pending");
  assert.equal(asset.final_visual_review, "pending");
  assert.equal(asset.owner_approval, "pending");
  assert.equal(asset.publication_status, "held");
  assert.ok(!ids.has(asset.pexels_id), "Pexels source IDs must be unique");
  ids.add(asset.pexels_id);
}
assert.ok(review.excluded_assets.some((asset) => asset.pexels_id === "35076399"));
assert.equal(review.release_gate.publishing_enabled, false);
assert.equal(review.release_gate.dry_run, true);
assert.equal(review.release_gate.emergency_stop, true);
console.log("Pexels source-rights registry tests: 5 assets held; release gates intact.");
