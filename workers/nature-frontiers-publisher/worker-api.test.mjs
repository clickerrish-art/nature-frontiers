import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "./worker.js";

const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
database.exec(readFileSync(new URL("./migrations/0001_initial_schema.sql", import.meta.url), "utf8"));
database.exec(readFileSync(new URL("./migrations/0002_meta_webhook_events.sql", import.meta.url), "utf8"));
database.exec(readFileSync(new URL("./migrations/0003_media_evidence.sql", import.meta.url), "utf8"));
database.exec(readFileSync(new URL("./migrations/0004_review_evidence.sql", import.meta.url), "utf8"));
database.exec(readFileSync(new URL("./migrations/0005_educational_story.sql", import.meta.url), "utf8"));

function d1Adapter(db) {
  function statement(sql, params = []) {
    return {
      bind(...values) { return statement(sql, values); },
      async first() { return db.prepare(sql).get(...params) || null; },
      async all() { return { results: db.prepare(sql).all(...params) }; },
      async run() {
        const result = db.prepare(sql).run(...params);
        return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid || 0) } };
      },
      _run() {
        const result = db.prepare(sql).run(...params);
        return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid || 0) } };
      }
    };
  }
  return {
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((item) => item._run());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
  };
}

const env = {
  DB: d1Adapter(database),
  PUBLISHER_API_TOKEN: "test-publisher-token",
  PUBLISH_ENABLED: "false",
  PUBLISH_DRY_RUN: "true",
  PUBLISH_EMERGENCY_STOP: "true",
  META_PAGE_ID: "1431329126735709",
  META_EXPECTED_PAGE_ID: "1431329126735709",
  META_INSTAGRAM_USER_ID: "17841413164146618",
  META_EXPECTED_INSTAGRAM_USER_ID: "17841413164146618"
};

function request(path, method = "GET", body, token = "test-publisher-token") {
  const headers = {};
  if (token !== null) headers.authorization = "Bearer " + token;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request("https://publisher.example" + path, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

async function call(path, method, body, token) {
  return worker.fetch(request(path, method, body, token), env);
}

const missingToken = await worker.fetch(request("/api/content", "GET", undefined, null), { ...env, PUBLISHER_API_TOKEN: undefined });
assert.equal(missingToken.status, 503);
assert.equal((await call("/api/content", "GET", undefined, "wrong-token")).status, 401);

const mediaHash = "a".repeat(64);
const educationalStory = {
  title: "How elephants use their trunks",
  learning_objective: "Explain how an elephant uses its trunk to gather food and water",
  audience_takeaway: "The trunk is a versatile muscular organ used for feeding and drinking",
  claims: [{ text: "Elephants use their trunks to gather food and draw water", sources: ["https://www.nationalgeographic.com/animals/mammals/facts/african-elephant"], visual_evidence: "Original footage visibly shows an elephant using its trunk to gather food or water" }],
  story_beats: [
    { type: "hook_question", description: "What can an elephant do with its trunk?" },
    { type: "evidence", description: "Show the elephant using its trunk to gather food or water" },
    { type: "explanation", description: "Explain the trunk's role in feeding and drinking" },
    { type: "takeaway", description: "Summarize how the trunk helps the elephant meet daily needs" }
  ],
  media_kind: "video",
  visual_claim_alignment: "The original footage directly shows the trunk action described by the claim",
  species_identification_basis: "Species identification confirmed by a qualified reviewer",
  brand_logo: "lion_face",
  original_camera_provenance: true,
  rights_verified: true,
  human_editorial_review: true,
  accessibility: { captions: true, sound_off_comprehensible: true, alt_text_or_visual_description: "An elephant uses its trunk to gather food" },
  ai_generated_wildlife_visuals: false,
  generic_stock_footage: false
};
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
}
const educationalStorySha256 = createHash("sha256").update(canonicalJson(educationalStory)).digest("hex");

const created = await call("/api/content", "POST", {
  id: "crocodile-reel-001", content_type: "reel", caption: "A careful wildlife fact. Footage: Creator via Pexels.",
  media_url: "https://cdn.example.org/crocodile.mp4", media_sha256: mediaHash, educational_story: educationalStory
});
assert.equal(created.status, 201);
assert.equal((await created.json()).status, "draft");

const unsafeUrl = await call("/api/content", "POST", {
  id: "bad-content-001", content_type: "reel", caption: "Unsafe URL",
  media_url: "http://127.0.0.1/video.mp4", media_sha256: "b".repeat(64)
});
assert.equal(unsafeUrl.status, 400);

const rights = await call("/api/content/crocodile-reel-001/rights", "PUT", {
  media_sha256: mediaHash, rights_status: "licensed", rights_holder: "Original camera operator",
  source_url: "https://creator.example.org/original-recording", license_reference: "Direct written licence on file",
  verified_by: "rights-reviewer", verified_at: "2026-11-21T05:00:00.000Z"
});
assert.equal(rights.status, 200);

const mediaEvidence = await call("/api/content/crocodile-reel-001/media-evidence", "PUT", {
  media_sha256: mediaHash, media_origin: "original_camera_recording", stock_footage_used: false,
  synthetic_visuals: false, ai_generated_video: false, source_recording_id: "NF-CAMERA-001",
  original_camera_file_sha256: mediaHash, original_recording_retained: true,
  provenance_review_passed: true, provenance_reviewer: "rights-reviewer",
  provenance_reviewed_at: "2026-11-21T05:05:00.000Z"
});
assert.equal(mediaEvidence.status, 200);

const stockRejected = await call("/api/content/crocodile-reel-001/media-evidence", "PUT", {
  media_sha256: mediaHash, media_origin: "licensed_stock", stock_footage_used: true,
  synthetic_visuals: false, ai_generated_video: false, source_creator: "Creator",
  license_name: "Pexels License", license_evidence_url: "https://www.pexels.com/license/",
  provenance_review_passed: true, provenance_reviewer: "rights-reviewer",
  provenance_reviewed_at: "2026-11-21T05:05:00.000Z",
  on_screen_disclosure_text: "Licensed stock footage — illustrative.",
  on_screen_disclosure_media_sha256: mediaHash, caption_attribution: "Footage: Creator via Pexels."
});
assert.equal(stockRejected.status, 400);
assert.equal((await stockRejected.json()).error, "original_camera_recording_required");

const mismatchedRights = await call("/api/content/crocodile-reel-001/rights", "PUT", {
  media_sha256: "f".repeat(64), rights_status: "licensed", rights_holder: "Creator",
  source_url: "https://www.pexels.com/video/example/", license_reference: "Pexels License",
  verified_by: "rights-reviewer", verified_at: "2026-11-21T05:00:00.000Z"
});
assert.equal(mismatchedRights.status, 400);

const reviewMissing = await call("/api/content/crocodile-reel-001/submit-review", "POST", {});
assert.equal(reviewMissing.status, 409);

const reviewBody = {
  content_sha256: mediaHash, educational_story_sha256: educationalStorySha256, reviewer: "editorial-reviewer", reviewed_at: "2026-11-21T05:10:00.000Z",
  human_review_confirmed: true, content_accuracy_confirmed: true, wildlife_welfare_confirmed: true,
  non_graphic_review_passed: true, media_integrity_review_passed: true, media_technical_review_passed: true,
  watermark_scan_passed: true, media_accessibility_confirmed: true,
  script_originality_confirmed: true, voiceover_originality_confirmed: true
};
const incompleteReview = await call("/api/content/crocodile-reel-001/review-evidence", "PUT", {
  ...reviewBody, wildlife_welfare_confirmed: false
});
assert.equal(incompleteReview.status, 400);
const reviewRecorded = await call("/api/content/crocodile-reel-001/review-evidence", "PUT", reviewBody);
assert.equal(reviewRecorded.status, 200);

const submitted = await call("/api/content/crocodile-reel-001/submit-review", "POST", {});
assert.equal(submitted.status, 200);
const hashMismatch = await call("/api/content/crocodile-reel-001/approval", "POST", {
  decision: "approved", reviewer: "owner", content_sha256: "f".repeat(64), educational_story_sha256: educationalStorySha256
});
assert.equal(hashMismatch.status, 400);

const approved = await call("/api/content/crocodile-reel-001/approval", "POST", {
  decision: "approved", reviewer: "owner", content_sha256: mediaHash, educational_story_sha256: educationalStorySha256
});
assert.equal(approved.status, 200);
assert.equal((await approved.json()).status, "approved");

const wrongStoryApproval = await call("/api/content/crocodile-reel-001/approval", "POST", {
  decision: "approved", reviewer: "owner", content_sha256: mediaHash, educational_story_sha256: "0".repeat(64)
});
assert.equal(wrongStoryApproval.status, 400);

const disabledReservation = await call("/api/publication-reservations", "POST", {
  content_id: "crocodile-reel-001", platform: "facebook", account_id: "1431329126735709",
  idempotency_key: "reservation-disabled-001", media_sha256: mediaHash
});
assert.equal(disabledReservation.status, 423);

env.PUBLISH_ENABLED = "true";
env.PUBLISH_DRY_RUN = "false";
env.PUBLISH_EMERGENCY_STOP = "false";

database.prepare("UPDATE content_items SET educational_story_json = ? WHERE id = ?").run(JSON.stringify({ ...educationalStory, title: "Tampered after approval" }), "crocodile-reel-001");
const tamperedStoryReservation = await call("/api/publication-reservations", "POST", {
  content_id: "crocodile-reel-001", platform: "facebook", account_id: "1431329126735709",
  idempotency_key: "reservation-tampered-story", media_sha256: mediaHash
});
assert.equal(tamperedStoryReservation.status, 409);
database.prepare("UPDATE content_items SET educational_story_json = ? WHERE id = ?").run(canonicalJson(educationalStory), "crocodile-reel-001");

const wrongAccount = await call("/api/publication-reservations", "POST", {
  content_id: "crocodile-reel-001", platform: "facebook", account_id: "1000000000000000",
  idempotency_key: "reservation-wrong-account", media_sha256: mediaHash
});
assert.equal(wrongAccount.status, 409);

const reservationBody = {
  content_id: "crocodile-reel-001", platform: "facebook", account_id: "1431329126735709",
  idempotency_key: "reservation-crocodile-001", media_sha256: mediaHash
};
const reservation = await call("/api/publication-reservations", "POST", reservationBody);
assert.equal(reservation.status, 201);
const reservationJson = await reservation.json();
assert.equal(reservationJson.state, "reserved");

const idempotentReplay = await call("/api/publication-reservations", "POST", reservationBody);
assert.equal(idempotentReplay.status, 200);
assert.equal((await idempotentReplay.json()).reservation_id, reservationJson.reservation_id);

const duplicateAttempt = await call("/api/publication-reservations", "POST", {
  ...reservationBody, idempotency_key: "reservation-crocodile-002"
});
assert.equal(duplicateAttempt.status, 409);

const ambiguous = await call("/api/publication-attempts/" + reservationJson.reservation_id + "/reconcile", "POST", {
  outcome: "ambiguous", error_code: "REMOTE_TIMEOUT"
});
assert.equal(ambiguous.status, 200);
const held = await call("/api/content/crocodile-reel-001", "GET");
const heldJson = await held.json();
assert.equal(heldJson.item.status, "held");
assert.equal(heldJson.attempts[0].state, "ambiguous");

const confirmed = await call("/api/publication-attempts/" + reservationJson.reservation_id + "/reconcile", "POST", {
  outcome: "confirmed", platform_post_id: "meta-media-123"
});
assert.equal(confirmed.status, 200);
const published = await call("/api/content/crocodile-reel-001", "GET");
const publishedJson = await published.json();
assert.equal(publishedJson.item.status, "published");
assert.equal(publishedJson.targets[0].status, "published");
assert.equal(publishedJson.targets[0].platform_media_id, "meta-media-123");
const publishedStoryEdit = await call("/api/content/crocodile-reel-001/educational-story", "PUT", { educational_story: educationalStory });
assert.equal(publishedStoryEdit.status, 409);

const confirmationReplay = await call("/api/publication-attempts/" + reservationJson.reservation_id + "/reconcile", "POST", {
  outcome: "confirmed", platform_post_id: "meta-media-123"
});
assert.equal(confirmationReplay.status, 200);
const conflictingConfirmation = await call("/api/publication-attempts/" + reservationJson.reservation_id + "/reconcile", "POST", {
  outcome: "confirmed", platform_post_id: "different-remote-id"
});
assert.equal(conflictingConfirmation.status, 409);

const storyEditContent = await call("/api/content", "POST", {
  id: "story-edit-001", content_type: "feed_post", caption: "Story revision test",
  media_url: "https://cdn.example.org/story-edit.jpg", media_sha256: "c".repeat(64), educational_story: educationalStory
});
assert.equal(storyEditContent.status, 201);
database.prepare("UPDATE content_items SET status = 'approved' WHERE id = ?").run("story-edit-001");
database.prepare("INSERT INTO approvals (id, content_id, reviewer, decision, content_sha256, educational_story_sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run("story-edit-approval", "story-edit-001", "owner", "approved", "c".repeat(64), educationalStorySha256, "2026-11-21T05:00:00.000Z");
database.prepare("INSERT INTO review_evidence (content_id, content_sha256, educational_story_sha256, human_review_confirmed, content_accuracy_confirmed, wildlife_welfare_confirmed, non_graphic_review_passed, media_integrity_review_passed, media_technical_review_passed, watermark_scan_passed, media_accessibility_confirmed, script_originality_confirmed, voiceover_originality_confirmed, reviewer, reviewed_at) VALUES (?, ?, ?, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, ?, ?)").run("story-edit-001", "c".repeat(64), educationalStorySha256, "editor", "2026-11-21T05:00:00.000Z");
const invalidStoryRevision = await call("/api/content/story-edit-001/educational-story", "PUT", {
  educational_story: { ...educationalStory, claims: [{ ...educationalStory.claims[0], sources: [] }] }
});
assert.equal(invalidStoryRevision.status, 400);
const revisedStory = { ...educationalStory, audience_takeaway: "A revised, more precise learning takeaway" };
const storyRevision = await call("/api/content/story-edit-001/educational-story", "PUT", { educational_story: revisedStory });
assert.equal(storyRevision.status, 200);
const revisedRecord = await call("/api/content/story-edit-001", "GET");
const revisedRecordJson = await revisedRecord.json();
assert.equal(revisedRecordJson.item.status, "held");
assert.notEqual(revisedRecordJson.item.educational_story_sha256, educationalStorySha256);
assert.equal(revisedRecordJson.approvals.length, 0);
assert.equal(revisedRecordJson.review_evidence, null);

const expiredContent = await call("/api/content", "POST", {
  id: "expired-rights-001", content_type: "feed_post", caption: "Expired licence test.",
  media_url: "https://cdn.example.org/expired.jpg", media_sha256: "b".repeat(64), educational_story: educationalStory
});
assert.equal(expiredContent.status, 201);
const expiredRights = await call("/api/content/expired-rights-001/rights", "PUT", {
  media_sha256: "b".repeat(64), rights_status: "licensed", rights_holder: "Creator",
  source_url: "https://www.pexels.com/video/example/", license_reference: "Pexels License",
  verified_by: "rights-reviewer", verified_at: "2020-01-01T00:00:00.000Z",
  expires_at: "2020-01-02T00:00:00.000Z"
});
assert.equal(expiredRights.status, 400);

const list = await call("/api/content", "GET");
assert.equal(list.status, 200);
const listJson = await list.json();
assert.equal(listJson.items.length, 2);

const counts = database.prepare("SELECT event_type, COUNT(*) AS count FROM audit_events GROUP BY event_type ORDER BY event_type").all();
assert.ok(counts.some((row) => row.event_type === "publication.confirmed" && row.count === 1));
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM publication_attempts").get().count, 1);

console.log("PASS: authenticated D1 content, rights, exact-hash approval, fail-closed reservation, target identity, idempotency, ambiguous reconciliation and audit persistence");
database.close();
