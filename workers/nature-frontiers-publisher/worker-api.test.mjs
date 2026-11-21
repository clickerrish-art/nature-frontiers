import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "./worker.js";

const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
database.exec(readFileSync(new URL("./migrations/0001_initial_schema.sql", import.meta.url), "utf8"));
database.exec(readFileSync(new URL("./migrations/0002_meta_webhook_events.sql", import.meta.url), "utf8"));
database.exec(readFileSync(new URL("./migrations/0003_media_evidence.sql", import.meta.url), "utf8"));
database.exec(readFileSync(new URL("./migrations/0004_review_evidence.sql", import.meta.url), "utf8"));

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
const created = await call("/api/content", "POST", {
  id: "crocodile-reel-001", content_type: "reel", caption: "A careful wildlife fact. Footage: Creator via Pexels.",
  media_url: "https://cdn.example.org/crocodile.mp4", media_sha256: mediaHash
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
  content_sha256: mediaHash, reviewer: "editorial-reviewer", reviewed_at: "2026-11-21T05:10:00.000Z",
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
  decision: "approved", reviewer: "owner", content_sha256: "f".repeat(64)
});
assert.equal(hashMismatch.status, 400);

const approved = await call("/api/content/crocodile-reel-001/approval", "POST", {
  decision: "approved", reviewer: "owner", content_sha256: mediaHash
});
assert.equal(approved.status, 200);
assert.equal((await approved.json()).status, "approved");

const disabledReservation = await call("/api/publication-reservations", "POST", {
  content_id: "crocodile-reel-001", platform: "facebook", account_id: "1431329126735709",
  idempotency_key: "reservation-disabled-001", media_sha256: mediaHash
});
assert.equal(disabledReservation.status, 423);

env.PUBLISH_ENABLED = "true";
env.PUBLISH_DRY_RUN = "false";
env.PUBLISH_EMERGENCY_STOP = "false";

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

const confirmationReplay = await call("/api/publication-attempts/" + reservationJson.reservation_id + "/reconcile", "POST", {
  outcome: "confirmed", platform_post_id: "meta-media-123"
});
assert.equal(confirmationReplay.status, 200);
const conflictingConfirmation = await call("/api/publication-attempts/" + reservationJson.reservation_id + "/reconcile", "POST", {
  outcome: "confirmed", platform_post_id: "different-remote-id"
});
assert.equal(conflictingConfirmation.status, 409);

const expiredContent = await call("/api/content", "POST", {
  id: "expired-rights-001", content_type: "feed_post", caption: "Expired licence test.",
  media_url: "https://cdn.example.org/expired.jpg", media_sha256: "b".repeat(64)
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
