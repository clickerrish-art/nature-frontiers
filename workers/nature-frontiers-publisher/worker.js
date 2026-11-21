import { validateStory } from "../../shared/nature-frontiers-story.mjs";
const MEDIA_PATH = /^\/media\/instagram\/media-([a-f0-9]{64})\.(jpg|jpeg|mp4)$/i;
const ALLOWED_TYPES = new Set(["image/jpeg", "video/mp4"]);
const MAX_WEBHOOK_BYTES = 1024 * 1024;
const MAX_MEDIA_ASSET_BYTES = 25 * 1024 * 1024;

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function toHex(bytes) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(bytes) {
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

async function verifyMetaSignature(rawBody, signature, appSecret) {
  if (typeof signature !== "string" || !/^sha256=[a-f0-9]{64}$/i.test(signature) || typeof appSecret !== "string" || !appSecret) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, rawBody);
  return constantTimeEqual(signature.toLowerCase(), `sha256=${toHex(digest)}`);
}

async function readBoundedBody(request, limit) {
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error("Webhook body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

async function handleMetaWebhook(request, env) {
  const url = new URL(request.url);
  if (request.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode !== "subscribe" || !constantTimeEqual(token, env.META_WEBHOOK_VERIFY_TOKEN) || !challenge || challenge.length > 2048) {
      return new Response("Webhook verification rejected", { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST", "Cache-Control": "no-store" } });
  if (!env.META_APP_SECRET || !env.META_WEBHOOK_VERIFY_TOKEN || !env.DB) return json({ ok: false, error: "webhook_configuration_unavailable" }, 503);

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_WEBHOOK_BYTES) return new Response("Webhook body too large", { status: 413, headers: { "Cache-Control": "no-store" } });
  let rawBody;
  try { rawBody = await readBoundedBody(request, MAX_WEBHOOK_BYTES); }
  catch { return new Response("Webhook body too large", { status: 413, headers: { "Cache-Control": "no-store" } }); }
  const signature = request.headers.get("x-hub-signature-256");
  if (!(await verifyMetaSignature(rawBody, signature, env.META_APP_SECRET))) {
    return new Response("Webhook signature invalid", { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  let event;
  try { event = JSON.parse(new TextDecoder().decode(rawBody)); }
  catch { return new Response("Webhook JSON invalid", { status: 400, headers: { "Cache-Control": "no-store" } }); }
  if (!event || typeof event !== "object" || Array.isArray(event) || typeof event.object !== "string" || !Array.isArray(event.entry)) {
    return new Response("Webhook event schema invalid", { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const eventId = await sha256Hex(rawBody);
    const result = await env.DB.prepare(
      "INSERT OR IGNORE INTO meta_webhook_events (event_id, received_at, object_type, entry_count) VALUES (?, ?, ?, ?)"
    ).bind(eventId, new Date().toISOString(), event.object, event.entry.length).run();
    if (result?.success !== true) throw new Error("D1 persistence failed");
  } catch {
    return new Response("Webhook persistence unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return new Response("EVENT_RECEIVED", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}


const API_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,127}$/;
const API_HASH = /^[a-f0-9]{64}$/i;
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
}

async function educationalStoryHash(story) {
  const bytes = new TextEncoder().encode(canonicalJson(story));
  return sha256Hex(bytes.buffer);
}



function safePublicHttps(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
    const host = url.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
    if (host === "0.0.0.0" || host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return false;
    return true;
  } catch { return false; }
}

function apiStatement(env, sql, params = []) {
  const statement = env.DB.prepare(sql);
  return params.length ? statement.bind(...params) : statement;
}

async function apiFirst(env, sql, params = []) {
  return apiStatement(env, sql, params).first();
}

async function apiAll(env, sql, params = []) {
  const result = await apiStatement(env, sql, params).all();
  return result?.results || [];
}

async function apiBatch(env, statements) {
  const results = await env.DB.batch(statements);
  if (!Array.isArray(results) || results.some((result) => result?.success !== true)) throw new Error("D1 batch persistence failed");
  return results;
}

function auditStatement(env, eventType, contentId, actor, details, timestamp) {
  return apiStatement(env,
    "INSERT INTO audit_events (id, event_type, content_id, actor, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [crypto.randomUUID(), eventType, contentId || null, actor, JSON.stringify(details), timestamp]);
}

function validRightsRecord(record, now = Date.now()) {
  if (!record || !["licensed", "owned", "public_domain"].includes(record.rights_status)) return false;
  if (!record.verified_by || !record.verified_at || !Number.isFinite(Date.parse(record.verified_at))) return false;
  if (record.expires_at && (!Number.isFinite(Date.parse(record.expires_at)) || Date.parse(record.expires_at) <= now)) return false;
  if (record.rights_status === "licensed" && (!record.rights_holder || !record.source_url || !safePublicHttps(record.source_url) || !record.license_reference)) return false;
  if (record.rights_status === "owned" && (!record.rights_holder || !record.source_url || !safePublicHttps(record.source_url) || !record.license_reference)) return false;
  if (record.rights_status === "public_domain" && (!record.source_url || !safePublicHttps(record.source_url) || !record.license_reference)) return false;
  return true;
}

function validMediaEvidence(record, caption, mediaHash) {
  if (!record || record.media_sha256 !== mediaHash || record.synthetic_visuals !== 0 || record.ai_generated_video !== 0 ||
      record.provenance_review_passed !== 1 || !record.provenance_reviewer ||
      !record.provenance_reviewed_at || !Number.isFinite(Date.parse(record.provenance_reviewed_at))) return false;
  if (record.media_origin !== "original_camera_recording") return false;
  return record.stock_footage_used === 0 && !!record.source_recording_id &&
    record.original_camera_file_sha256 === mediaHash && record.original_recording_retained === 1;
}

function validReviewEvidence(record, contentId, mediaHash) {
  if (!record || record.content_id !== contentId || record.content_sha256 !== mediaHash ||
      !record.reviewer || !record.reviewed_at || !Number.isFinite(Date.parse(record.reviewed_at))) return false;
  return ["human_review_confirmed", "content_accuracy_confirmed", "wildlife_welfare_confirmed",
    "non_graphic_review_passed", "media_integrity_review_passed", "media_technical_review_passed",
    "watermark_scan_passed", "media_accessibility_confirmed", "script_originality_confirmed",
    "voiceover_originality_confirmed"].every((field) => record[field] === 1);
}

async function apiBody(request) {
  let bytes;
  try { bytes = await readBoundedBody(request, 64 * 1024); }
  catch { return { error: "body_too_large", status: 413 }; }
  if (!bytes.byteLength) return { error: "json_body_required", status: 400 };
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "json_object_required", status: 400 };
    return { value };
  } catch { return { error: "invalid_json", status: 400 }; }
}

const PUBLISHER_ROLE_CONFIG = Object.freeze({
  editor: ["PUBLISHER_EDITOR_TOKEN", "PUBLISHER_EDITOR_ACTOR"],
  rights_reviewer: ["PUBLISHER_RIGHTS_REVIEWER_TOKEN", "PUBLISHER_RIGHTS_REVIEWER_ACTOR"],
  provenance_reviewer: ["PUBLISHER_PROVENANCE_REVIEWER_TOKEN", "PUBLISHER_PROVENANCE_REVIEWER_ACTOR"],
  editorial_reviewer: ["PUBLISHER_EDITORIAL_REVIEWER_TOKEN", "PUBLISHER_EDITORIAL_REVIEWER_ACTOR"],
  owner_approver: ["PUBLISHER_OWNER_APPROVER_TOKEN", "PUBLISHER_OWNER_APPROVER_ACTOR"],
  publishing_operator: ["PUBLISHER_PUBLISHING_OPERATOR_TOKEN", "PUBLISHER_PUBLISHING_OPERATOR_ACTOR"]
});
function publisherRouteRole(parts, method) {
  if (parts.length === 2 && parts[1] === "content" && method === "GET") return "read";
  if (parts.length === 3 && parts[1] === "content" && method === "GET") return "read";
  if (parts.length === 2 && parts[1] === "content" && method === "POST") return "editor";
  if (parts.length === 4 && parts[1] === "content" && parts[3] === "educational-story" && method === "PUT") return "editor";
  if (parts.length === 4 && parts[1] === "content" && parts[3] === "rights" && method === "PUT") return "rights_reviewer";
  if (parts.length === 4 && parts[1] === "content" && parts[3] === "media-evidence" && method === "PUT") return "provenance_reviewer";
  if (parts.length === 4 && parts[1] === "content" && parts[3] === "review-evidence" && method === "PUT") return "editorial_reviewer";
  if (parts.length === 4 && parts[1] === "content" && parts[3] === "submit-review" && method === "POST") return "editor";
  if (parts.length === 4 && parts[1] === "content" && parts[3] === "approval" && method === "POST") return "owner_approver";
  if (parts.length === 2 && parts[1] === "publication-reservations" && method === "POST") return "publishing_operator";
  if (parts.length === 4 && parts[1] === "publication-attempts" && parts[3] === "reconcile" && method === "POST") return "publishing_operator";
  return null;
}
function authenticatePublisherRole(request, env, requiredRole) {
  const configured = Object.entries(PUBLISHER_ROLE_CONFIG).map(([role, [tokenKey, actorKey]]) => ({ role, token: env[tokenKey], actor: env[actorKey] }));
  if (configured.some((entry) => typeof entry.token !== "string" || entry.token.length < 32 || typeof entry.actor !== "string" || !entry.actor.trim()) ||
      new Set(configured.map((entry) => entry.token)).size !== configured.length ||
      new Set(configured.map((entry) => entry.actor.trim().toLowerCase())).size !== configured.length) return { error: "publisher_role_auth_not_configured", status: 503 };
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const matches = configured.filter((entry) => constantTimeEqual(supplied, entry.token));
  if (matches.length !== 1) return { error: "unauthorized", status: 401 };
  const identity = matches[0];
  if (requiredRole !== "read" && identity.role !== requiredRole) return { error: "forbidden", status: 403 };
  return { identity: { role: identity.role, actor: identity.actor.trim() } };
}
async function handlePublisherApi(request, env) {
  if (!env.DB) return json({ ok: false, error: "database_unavailable" }, 503);
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const method = request.method;
  const requiredRole = publisherRouteRole(parts, method);
  if (!requiredRole) return json({ ok: false, error: "route_not_authorized" }, 403);
  const authentication = authenticatePublisherRole(request, env, requiredRole);
  if (authentication.error) return json({ ok: false, error: authentication.error }, authentication.status);
  const identity = authentication.identity;
  const timestamp = new Date().toISOString();
  const bodyResult = ["POST", "PUT"].includes(method) ? await apiBody(request) : null;
  if (bodyResult?.error) return json({ ok: false, error: bodyResult.error }, bodyResult.status);
  const body = bodyResult?.value || {};

  try {
    if (parts.length === 2 && parts[1] === "content" && method === "GET") {
      const items = await apiAll(env, "SELECT id, content_type, caption, media_url, media_sha256, educational_story_json, educational_story_sha256, status, scheduled_at, created_at, updated_at FROM content_items ORDER BY created_at DESC LIMIT 100");
      return json({ ok: true, items });
    }

    if (parts.length === 2 && parts[1] === "content" && method === "POST") {
      const id = typeof body.id === "string" ? body.id : crypto.randomUUID();
      const mediaHash = typeof body.media_sha256 === "string" ? body.media_sha256.toLowerCase() : "";
      const storyErrors = validateStory(body.educational_story);
      if (!API_ID.test(id) || !["feed_post", "reel"].includes(body.content_type) ||
          typeof body.caption !== "string" || !body.caption.trim() || body.caption.length > 10000 ||
          !safePublicHttps(body.media_url) || !API_HASH.test(mediaHash) || storyErrors.length) {
        return json({ ok: false, error: "invalid_content_record", story_errors: storyErrors }, 400);
      }
      const storyJson = canonicalJson(body.educational_story);
      const storyHash = await educationalStoryHash(body.educational_story);
      const results = await apiBatch(env, [
        apiStatement(env, "INSERT INTO content_items (id, content_type, caption, media_url, media_sha256, educational_story_json, educational_story_sha256, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)",
          [id, body.content_type, body.caption, body.media_url, mediaHash, storyJson, storyHash, timestamp, timestamp]),
        auditStatement(env, "content.draft_created", id, identity.actor, { content_type: body.content_type, media_sha256: mediaHash }, timestamp)
      ]);
      if (results[0]?.meta?.changes !== 1) return json({ ok: false, error: "content_not_created" }, 409);
      return json({ ok: true, content_id: id, status: "draft", educational_story_sha256: storyHash }, 201);
    }

    if (parts.length === 3 && parts[1] === "content" && method === "GET") {
      const item = await apiFirst(env, "SELECT * FROM content_items WHERE id = ?", [parts[2]]);
      if (!item) return json({ ok: false, error: "content_not_found" }, 404);
      const [rights, evidence, reviewEvidence, approvals, targets, attempts] = await Promise.all([
        apiFirst(env, "SELECT * FROM media_rights WHERE media_sha256 = ?", [item.media_sha256]),
        apiFirst(env, "SELECT * FROM media_evidence WHERE media_sha256 = ?", [item.media_sha256]),
        apiFirst(env, "SELECT * FROM review_evidence WHERE content_id = ? AND content_sha256 = ?", [item.id, item.media_sha256]),
        apiAll(env, "SELECT id, reviewer, decision, content_sha256, educational_story_sha256, created_at FROM approvals WHERE content_id = ? ORDER BY created_at DESC", [item.id]),
        apiAll(env, "SELECT platform, account_id, platform_media_id, published_at, status FROM content_targets WHERE content_id = ?", [item.id]),
        apiAll(env, "SELECT id, platform, idempotency_key, state, platform_post_id, started_at, finished_at, error_code FROM publication_attempts WHERE content_id = ? ORDER BY started_at DESC", [item.id])
      ]);
      return json({ ok: true, item, rights, evidence, review_evidence: reviewEvidence, approvals, targets, attempts });
    }

    if (parts.length === 4 && parts[1] === "content" && parts[3] === "educational-story" && method === "PUT") {
      const item = await apiFirst(env, "SELECT id, educational_story_sha256, status FROM content_items WHERE id = ?", [parts[2]]);
      if (!item) return json({ ok: false, error: "content_not_found" }, 404);
      if (["publishing", "published"].includes(item.status)) return json({ ok: false, error: "educational_story_locked_after_publication_starts" }, 409);
      const storyErrors = validateStory(body.educational_story);
      if (storyErrors.length) return json({ ok: false, error: "invalid_educational_story", story_errors: storyErrors }, 400);
      if (!API_HASH.test(body.expected_educational_story_sha256 || "") ||
          body.expected_educational_story_sha256 !== item.educational_story_sha256) {
        return json({ ok: false, error: "educational_story_version_conflict", current_educational_story_sha256: item.educational_story_sha256 || null }, 409);
      }
      const storyJson = canonicalJson(body.educational_story);
      const storyHash = await educationalStoryHash(body.educational_story);
      const revisionGuard = "EXISTS (SELECT 1 FROM content_items WHERE id = ? AND educational_story_sha256 = ? AND status = 'held')";
      const results = await apiBatch(env, [
        apiStatement(env, "UPDATE content_items SET educational_story_json = ?, educational_story_sha256 = ?, status = 'held', updated_at = ? WHERE id = ? AND status NOT IN ('publishing','published') AND educational_story_sha256 = ?",
          [storyJson, storyHash, timestamp, item.id, body.expected_educational_story_sha256]),
        apiStatement(env, `DELETE FROM review_evidence WHERE content_id = ? AND ${revisionGuard}`, [item.id, item.id, storyHash]),
        apiStatement(env, `DELETE FROM approvals WHERE content_id = ? AND ${revisionGuard}`, [item.id, item.id, storyHash]),
        apiStatement(env, `INSERT INTO audit_events (id, event_type, content_id, actor, details_json, created_at)
          SELECT ?, ?, ?, ?, ?, ? WHERE ${revisionGuard}`,
          [crypto.randomUUID(), "content.educational_story_revised", item.id, identity.actor,
            JSON.stringify({ previous_story_sha256: item.educational_story_sha256 || null, educational_story_sha256: storyHash,
              previous_review_and_approval_invalidated: true }), timestamp, item.id, storyHash])
      ]);
      if (results[0]?.meta?.changes !== 1) return json({ ok: false, error: "educational_story_revision_conflict" }, 409);
      return json({ ok: true, content_id: item.id, status: "held", educational_story_sha256: storyHash, review_and_approval_invalidated: true });
    }

    if (parts.length === 4 && parts[1] === "content" && parts[3] === "rights" && method === "PUT") {
      const item = await apiFirst(env, "SELECT id, media_sha256, educational_story_sha256, status FROM content_items WHERE id = ?", [parts[2]]);
      if (!item) return json({ ok: false, error: "content_not_found" }, 404);
      if (item.status === "publishing") return json({ ok: false, error: "media_rights_locked_during_publication" }, 409);
      const mediaHash = typeof body.media_sha256 === "string" ? body.media_sha256.toLowerCase() : "";
      const status = body.rights_status;
      if (mediaHash !== item.media_sha256 || !["unverified", "licensed", "owned", "public_domain", "rejected"].includes(status)) {
        return json({ ok: false, error: "invalid_rights_record_or_media_hash_mismatch" }, 400);
      }
      const record = {
        rights_status: status, rights_holder: body.rights_holder || null, source_url: body.source_url || null,
        license_reference: body.license_reference || null, verified_by: identity.actor,
        verified_at: timestamp, expires_at: body.expires_at || null
      };
      if (["licensed", "owned", "public_domain"].includes(status) && !validRightsRecord(record)) {
        return json({ ok: false, error: "rights_evidence_incomplete_or_expired" }, 400);
      }
      if (record.source_url && !safePublicHttps(record.source_url)) return json({ ok: false, error: "rights_source_must_be_public_https" }, 400);
      const results = await apiBatch(env, [
        apiStatement(env, "INSERT INTO media_rights (media_sha256, rights_status, rights_holder, source_url, license_reference, verified_by, verified_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(media_sha256) DO UPDATE SET rights_status=excluded.rights_status, rights_holder=excluded.rights_holder, source_url=excluded.source_url, license_reference=excluded.license_reference, verified_by=excluded.verified_by, verified_at=excluded.verified_at, expires_at=excluded.expires_at",
          [mediaHash, record.rights_status, record.rights_holder, record.source_url, record.license_reference, record.verified_by, record.verified_at, record.expires_at]),
        apiStatement(env, "UPDATE content_items SET status = 'held', updated_at = ? WHERE id = ? AND status IN ('needs_review','approved','scheduled')", [timestamp, item.id]),
        apiStatement(env, "DELETE FROM media_evidence WHERE media_sha256 = ?", [mediaHash]),
        apiStatement(env, "DELETE FROM review_evidence WHERE content_id = ?", [item.id]),
        auditStatement(env, "media.rights_updated", item.id, identity.actor, { media_sha256: mediaHash, rights_status: status, verified_by: record.verified_by }, timestamp)
      ]);
      if (results.some((result) => result?.success !== true)) return json({ ok: false, error: "rights_persistence_failed" }, 503);
      return json({ ok: true, content_id: item.id, rights_status: status });
    }

    if (parts.length === 4 && parts[1] === "content" && parts[3] === "media-evidence" && method === "PUT") {
      const item = await apiFirst(env, "SELECT id, caption, media_sha256, status FROM content_items WHERE id = ?", [parts[2]]);
      if (!item) return json({ ok: false, error: "content_not_found" }, 404);
      if (["publishing", "published"].includes(item.status)) return json({ ok: false, error: "media_evidence_locked_after_publication_starts" }, 409);
      const mediaHash = typeof body.media_sha256 === "string" ? body.media_sha256.toLowerCase() : "";
      const origin = body.media_origin;
      const rights = await apiFirst(env, "SELECT * FROM media_rights WHERE media_sha256 = ?", [item.media_sha256]);
      if (mediaHash !== item.media_sha256 || body.synthetic_visuals !== false || body.ai_generated_video !== false ||
          body.provenance_review_passed !== true ||
          !validRightsRecord(rights)) {
        return json({ ok: false, error: "media_provenance_or_rights_evidence_invalid" }, 400);
      }
      const original = origin === "original_camera_recording";
      if (!original) return json({ ok: false, error: "original_camera_recording_required" }, 400);
      if (body.stock_footage_used !== false || !["owned", "licensed"].includes(rights.rights_status) ||
          typeof body.source_recording_id !== "string" || !body.source_recording_id.trim() ||
          body.original_camera_file_sha256 !== mediaHash || body.original_recording_retained !== true) {
        return json({ ok: false, error: "original_camera_provenance_incomplete" }, 400);
      }
      const results = await apiBatch(env, [
        apiStatement(env, "INSERT INTO media_evidence (media_sha256, media_origin, stock_footage_used, synthetic_visuals, ai_generated_video, source_creator, license_name, license_evidence_url, source_recording_id, original_camera_file_sha256, original_recording_retained, provenance_review_passed, provenance_reviewer, provenance_reviewed_at, on_screen_disclosure_text, on_screen_disclosure_media_sha256, caption_attribution, created_at) VALUES (?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?) ON CONFLICT(media_sha256) DO UPDATE SET media_origin=excluded.media_origin, stock_footage_used=excluded.stock_footage_used, synthetic_visuals=0, ai_generated_video=0, source_creator=excluded.source_creator, license_name=excluded.license_name, license_evidence_url=excluded.license_evidence_url, source_recording_id=excluded.source_recording_id, original_camera_file_sha256=excluded.original_camera_file_sha256, original_recording_retained=excluded.original_recording_retained, provenance_review_passed=1, provenance_reviewer=excluded.provenance_reviewer, provenance_reviewed_at=excluded.provenance_reviewed_at, on_screen_disclosure_text=excluded.on_screen_disclosure_text, on_screen_disclosure_media_sha256=excluded.on_screen_disclosure_media_sha256, caption_attribution=excluded.caption_attribution, created_at=excluded.created_at",
          [mediaHash, origin, 0, null, null, null,
            body.source_recording_id || null, body.original_camera_file_sha256 || null, original ? 1 : null, identity.actor,
            timestamp, body.on_screen_disclosure_text || null, body.on_screen_disclosure_media_sha256 || null,
            body.caption_attribution || null, timestamp]),
        apiStatement(env, "UPDATE content_items SET status = 'held', updated_at = ? WHERE id = ? AND status IN ('needs_review','approved','scheduled')", [timestamp, item.id]),
        apiStatement(env, "DELETE FROM review_evidence WHERE content_id = ?", [item.id]),
        auditStatement(env, "media.provenance_reviewed", item.id, identity.actor, { media_sha256: mediaHash, media_origin: origin }, timestamp)
      ]);
      if (results[0]?.meta?.changes !== 1) return json({ ok: false, error: "media_evidence_persistence_failed" }, 503);
      return json({ ok: true, content_id: item.id, media_origin: origin, media_sha256: mediaHash });
    }

    if (parts.length === 4 && parts[1] === "content" && parts[3] === "review-evidence" && method === "PUT") {
      const item = await apiFirst(env, "SELECT id, media_sha256, educational_story_sha256, status FROM content_items WHERE id = ?", [parts[2]]);
      if (!item) return json({ ok: false, error: "content_not_found" }, 404);
      if (["publishing", "published"].includes(item.status)) return json({ ok: false, error: "review_evidence_locked_after_publication_starts" }, 409);
      const mediaHash = typeof body.content_sha256 === "string" ? body.content_sha256.toLowerCase() : "";
      if (!item.educational_story_sha256 || body.educational_story_sha256 !== item.educational_story_sha256) return json({ ok: false, error: "educational_story_hash_mismatch" }, 409);
      const fields = ["human_review_confirmed", "content_accuracy_confirmed", "wildlife_welfare_confirmed",
        "non_graphic_review_passed", "media_integrity_review_passed", "media_technical_review_passed",
        "watermark_scan_passed", "media_accessibility_confirmed", "script_originality_confirmed",
        "voiceover_originality_confirmed"];
      const reviewer = identity.actor;
      if (mediaHash !== item.media_sha256 || !reviewer || reviewer.length > 200 ||
          fields.some((field) => body[field] !== true)) {
        return json({ ok: false, error: "exact_hash_human_editorial_and_safety_review_required" }, 400);
      }
      const values = fields.map(() => 1);
      const results = await apiBatch(env, [
        apiStatement(env, "INSERT INTO review_evidence (content_id, content_sha256, educational_story_sha256, human_review_confirmed, content_accuracy_confirmed, wildlife_welfare_confirmed, non_graphic_review_passed, media_integrity_review_passed, media_technical_review_passed, watermark_scan_passed, media_accessibility_confirmed, script_originality_confirmed, voiceover_originality_confirmed, reviewer, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(content_id, content_sha256) DO UPDATE SET educational_story_sha256=excluded.educational_story_sha256, human_review_confirmed=excluded.human_review_confirmed, content_accuracy_confirmed=excluded.content_accuracy_confirmed, wildlife_welfare_confirmed=excluded.wildlife_welfare_confirmed, non_graphic_review_passed=excluded.non_graphic_review_passed, media_integrity_review_passed=excluded.media_integrity_review_passed, media_technical_review_passed=excluded.media_technical_review_passed, watermark_scan_passed=excluded.watermark_scan_passed, media_accessibility_confirmed=excluded.media_accessibility_confirmed, script_originality_confirmed=excluded.script_originality_confirmed, voiceover_originality_confirmed=excluded.voiceover_originality_confirmed, reviewer=excluded.reviewer, reviewed_at=excluded.reviewed_at",
          [item.id, mediaHash, item.educational_story_sha256, ...values, reviewer, timestamp]),
        apiStatement(env, "UPDATE content_items SET status = 'held', updated_at = ? WHERE id = ? AND status IN ('needs_review','approved','scheduled')", [timestamp, item.id]),
        auditStatement(env, "content.review_evidence_recorded", item.id, reviewer, { content_sha256: mediaHash, review_checks: fields.length }, timestamp)
      ]);
      if (results[0]?.meta?.changes !== 1) return json({ ok: false, error: "review_evidence_persistence_failed" }, 503);
      return json({ ok: true, content_id: item.id, content_sha256: mediaHash, review_checks: fields.length });
    }

    if (parts.length === 4 && parts[1] === "content" && parts[3] === "submit-review" && method === "POST") {
      const item = await apiFirst(env, "SELECT * FROM content_items WHERE id = ?", [parts[2]]);
      if (!item) return json({ ok: false, error: "content_not_found" }, 404);
      const rights = await apiFirst(env, "SELECT * FROM media_rights WHERE media_sha256 = ?", [item.media_sha256]);
      const evidence = await apiFirst(env, "SELECT * FROM media_evidence WHERE media_sha256 = ?", [item.media_sha256]);
      const reviewEvidence = await apiFirst(env, "SELECT * FROM review_evidence WHERE content_id = ? AND content_sha256 = ?", [item.id, item.media_sha256]);
      let educationalStory;
      try { educationalStory = JSON.parse(item.educational_story_json || "null"); } catch { educationalStory = null; }
      const currentStoryHash = educationalStory ? await educationalStoryHash(educationalStory) : "";
      if (!item.educational_story_sha256 || currentStoryHash !== item.educational_story_sha256 ||
          validateStory(educationalStory).length || reviewEvidence?.educational_story_sha256 !== item.educational_story_sha256 ||
          !validRightsRecord(rights) || !validMediaEvidence(evidence, item.caption, item.media_sha256) ||
          !validReviewEvidence(reviewEvidence, item.id, item.media_sha256)) {
        return json({ ok: false, error: "verified_rights_media_evidence_and_human_review_required" }, 409);
      }
      const results = await apiBatch(env, [
        apiStatement(env, "UPDATE content_items SET status = 'needs_review', updated_at = ? WHERE id = ? AND status IN ('draft','held','failed')", [timestamp, item.id]),
        apiStatement(env, "INSERT INTO audit_events (id, event_type, content_id, actor, details_json, created_at) SELECT ?, 'content.submitted_for_review', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM content_items WHERE id = ? AND status = 'needs_review')",
          [crypto.randomUUID(), item.id, identity.actor, JSON.stringify({ media_sha256: item.media_sha256 }), timestamp, item.id])
      ]);
      if (results[0]?.meta?.changes !== 1) return json({ ok: false, error: "content_not_in_submittable_state" }, 409);
      return json({ ok: true, content_id: item.id, status: "needs_review" });
    }

    if (parts.length === 4 && parts[1] === "content" && parts[3] === "approval" && method === "POST") {
      const item = await apiFirst(env, "SELECT * FROM content_items WHERE id = ?", [parts[2]]);
      if (!item) return json({ ok: false, error: "content_not_found" }, 404);
      const decision = body.decision;
      const reviewer = identity.actor;
      const mediaHash = typeof body.content_sha256 === "string" ? body.content_sha256.toLowerCase() : "";
      if (!["approved", "rejected"].includes(decision) || !reviewer || reviewer.length > 200 || mediaHash !== item.media_sha256 ||
          !item.educational_story_sha256 || body.educational_story_sha256 !== item.educational_story_sha256) {
        return json({ ok: false, error: "approval_fields_or_media_or_story_hash_invalid" }, 400);
      }
      if (decision === "approved") {
        const rights = await apiFirst(env, "SELECT * FROM media_rights WHERE media_sha256 = ?", [item.media_sha256]);
        const evidence = await apiFirst(env, "SELECT * FROM media_evidence WHERE media_sha256 = ?", [item.media_sha256]);
        const reviewEvidence = await apiFirst(env, "SELECT * FROM review_evidence WHERE content_id = ? AND content_sha256 = ?", [item.id, item.media_sha256]);
        let educationalStory;
        try { educationalStory = JSON.parse(item.educational_story_json || "null"); } catch { educationalStory = null; }
        if (!educationalStory || await educationalStoryHash(educationalStory) !== item.educational_story_sha256 ||
            validateStory(educationalStory).length || reviewEvidence?.educational_story_sha256 !== item.educational_story_sha256 ||
            !validRightsRecord(rights) || !validMediaEvidence(evidence, item.caption, item.media_sha256) ||
            !validReviewEvidence(reviewEvidence, item.id, item.media_sha256)) {
          return json({ ok: false, error: "verified_rights_media_evidence_and_human_review_required" }, 409);
        }
      }
      const approvalId = crypto.randomUUID();
      const results = await apiBatch(env, [
        apiStatement(env, "INSERT INTO approvals (id, content_id, reviewer, decision, content_sha256, educational_story_sha256, created_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM content_items WHERE id = ? AND status = 'needs_review' AND media_sha256 = ? AND educational_story_sha256 = ?)",
          [approvalId, item.id, reviewer, decision, mediaHash, item.educational_story_sha256, timestamp, item.id, mediaHash, item.educational_story_sha256]),
        apiStatement(env, "UPDATE content_items SET status = ?, updated_at = ? WHERE id = ? AND status = 'needs_review' AND EXISTS (SELECT 1 FROM approvals WHERE id = ?)",
          [decision === "approved" ? "approved" : "held", timestamp, item.id, approvalId]),
        apiStatement(env, "INSERT INTO audit_events (id, event_type, content_id, actor, details_json, created_at) SELECT ?, 'content.approval_recorded', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM approvals WHERE id = ?)",
          [crypto.randomUUID(), item.id, reviewer, JSON.stringify({ decision, media_sha256: mediaHash, educational_story_sha256: item.educational_story_sha256, approval_id: approvalId }), timestamp, approvalId])
      ]);
      if (results[0]?.meta?.changes !== 1 || results[1]?.meta?.changes !== 1) return json({ ok: false, error: "approval_state_or_hash_conflict" }, 409);
      return json({ ok: true, content_id: item.id, decision, status: decision === "approved" ? "approved" : "held", approval_id: approvalId });
    }

    if (parts.length === 2 && parts[1] === "publication-reservations" && method === "POST") {
      const emergencyStopActive = env.PUBLISH_EMERGENCY_STOP !== "false";
      if (env.PUBLISH_ENABLED !== "true" || env.PUBLISH_DRY_RUN !== "false" || emergencyStopActive) {
        return json({ ok: false, error: "publication_reservations_disabled_by_safety_policy" }, 423);
      }
      const platform = body.platform;
      const contentId = body.content_id;
      const accountId = body.account_id;
      const idempotencyKey = body.idempotency_key;
      if (!["facebook", "instagram"].includes(platform) || typeof contentId !== "string" || !API_ID.test(contentId) ||
          typeof accountId !== "string" || !accountId.trim() || typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 128 ||
          typeof body.media_sha256 !== "string" || !API_HASH.test(body.media_sha256)) {
        return json({ ok: false, error: "invalid_reservation_request" }, 400);
      }
      const configuredAccount = platform === "facebook" ? env.META_PAGE_ID : env.META_INSTAGRAM_USER_ID;
      const expectedAccount = platform === "facebook" ? env.META_EXPECTED_PAGE_ID : env.META_EXPECTED_INSTAGRAM_USER_ID;
      if (!configuredAccount || !expectedAccount || configuredAccount !== expectedAccount || accountId !== configuredAccount) {
        return json({ ok: false, error: "target_account_identity_not_verified" }, 409);
      }
      const existingKey = await apiFirst(env, "SELECT * FROM publication_attempts WHERE idempotency_key = ?", [idempotencyKey]);
      if (existingKey) {
        if (existingKey.content_id === contentId && existingKey.platform === platform) {
          return json({ ok: true, reservation_id: existingKey.id, state: existingKey.state, idempotent_replay: true });
        }
        return json({ ok: false, error: "idempotency_key_conflict" }, 409);
      }
      const item = await apiFirst(env, "SELECT * FROM content_items WHERE id = ?", [contentId]);
      if (!item || item.status !== "approved" || item.media_sha256 !== body.media_sha256.toLowerCase()) {
        return json({ ok: false, error: "approved_content_or_exact_media_hash_required" }, 409);
      }
      const rights = await apiFirst(env, "SELECT * FROM media_rights WHERE media_sha256 = ?", [item.media_sha256]);
      const evidence = await apiFirst(env, "SELECT * FROM media_evidence WHERE media_sha256 = ?", [item.media_sha256]);
      const reviewEvidence = await apiFirst(env, "SELECT * FROM review_evidence WHERE content_id = ? AND content_sha256 = ?", [item.id, item.media_sha256]);
      const approval = await apiFirst(env, "SELECT id, decision, educational_story_sha256 FROM approvals WHERE content_id = ? AND content_sha256 = ? ORDER BY created_at DESC, rowid DESC LIMIT 1", [contentId, item.media_sha256]);
      let educationalStory;
      try { educationalStory = JSON.parse(item.educational_story_json || "null"); } catch { educationalStory = null; }
      const recomputedStoryHash = educationalStory ? await educationalStoryHash(educationalStory) : "";
      if (!educationalStory || recomputedStoryHash !== item.educational_story_sha256 ||
          validateStory(educationalStory).length ||
          !validRightsRecord(rights) || !validMediaEvidence(evidence, item.caption, item.media_sha256) ||
          !validReviewEvidence(reviewEvidence, item.id, item.media_sha256) || approval?.decision !== "approved" ||
          !item.educational_story_sha256 || approval?.educational_story_sha256 !== item.educational_story_sha256 ||
          reviewEvidence?.educational_story_sha256 !== item.educational_story_sha256) {
        return json({ ok: false, error: "current_approval_verified_rights_and_media_evidence_required" }, 409);
      }
      const activeAttempt = await apiFirst(env, "SELECT id FROM publication_attempts WHERE content_id = ? AND platform = ? AND state IN ('reserved','confirmed','ambiguous') LIMIT 1", [contentId, platform]);
      if (activeAttempt) return json({ ok: false, error: "publication_already_reserved_or_unresolved" }, 409);

      const reservationId = crypto.randomUUID();
      const results = await apiBatch(env, [
        apiStatement(env, "INSERT INTO publication_attempts (id, content_id, platform, idempotency_key, state, started_at) SELECT ?, ?, ?, ?, 'reserved', ? WHERE EXISTS (SELECT 1 FROM content_items c WHERE c.id = ? AND c.status = 'approved' AND c.media_sha256 = ? AND EXISTS (SELECT 1 FROM approvals a WHERE a.content_id = c.id AND a.decision = 'approved' AND a.content_sha256 = c.media_sha256 AND a.educational_story_sha256 = c.educational_story_sha256 AND a.rowid = (SELECT a2.rowid FROM approvals a2 WHERE a2.content_id = c.id ORDER BY a2.created_at DESC, a2.rowid DESC LIMIT 1)) AND EXISTS (SELECT 1 FROM media_evidence e WHERE e.media_sha256 = c.media_sha256 AND e.media_origin = 'original_camera_recording' AND e.stock_footage_used = 0 AND e.synthetic_visuals = 0 AND e.ai_generated_video = 0 AND e.source_recording_id IS NOT NULL AND e.original_camera_file_sha256 = c.media_sha256 AND e.original_recording_retained = 1 AND e.provenance_review_passed = 1) AND EXISTS (SELECT 1 FROM review_evidence re WHERE re.content_id = c.id AND re.content_sha256 = c.media_sha256 AND re.educational_story_sha256 = c.educational_story_sha256 AND re.human_review_confirmed = 1 AND re.content_accuracy_confirmed = 1 AND re.wildlife_welfare_confirmed = 1 AND re.non_graphic_review_passed = 1 AND re.media_integrity_review_passed = 1 AND re.media_technical_review_passed = 1 AND re.watermark_scan_passed = 1 AND re.media_accessibility_confirmed = 1 AND re.script_originality_confirmed = 1 AND re.voiceover_originality_confirmed = 1) AND EXISTS (SELECT 1 FROM media_rights r WHERE r.media_sha256 = c.media_sha256 AND r.rights_status IN ('licensed','owned') AND r.rights_holder IS NOT NULL AND r.source_url IS NOT NULL AND r.license_reference IS NOT NULL AND r.verified_by IS NOT NULL AND r.verified_at IS NOT NULL AND (r.expires_at IS NULL OR r.expires_at > ?))) AND NOT EXISTS (SELECT 1 FROM publication_attempts p WHERE p.content_id = ? AND p.platform = ? AND p.state IN ('reserved','confirmed','ambiguous'))",
          [reservationId, contentId, platform, idempotencyKey, timestamp, contentId, body.media_sha256.toLowerCase(), timestamp, contentId, platform]),
        apiStatement(env, "INSERT INTO content_targets (content_id, platform, account_id, status) SELECT ?, ?, ?, 'publishing' WHERE EXISTS (SELECT 1 FROM publication_attempts WHERE id = ? AND state = 'reserved') ON CONFLICT(content_id, platform) DO UPDATE SET account_id = excluded.account_id, status = 'publishing'",
          [contentId, platform, accountId, reservationId]),
        apiStatement(env, "UPDATE content_items SET status = 'publishing', updated_at = ? WHERE id = ? AND status = 'approved' AND EXISTS (SELECT 1 FROM publication_attempts WHERE id = ? AND state = 'reserved')",
          [timestamp, contentId, reservationId]),
        apiStatement(env, "INSERT INTO audit_events (id, event_type, content_id, actor, details_json, created_at) SELECT ?, 'publication.reserved', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM publication_attempts WHERE id = ? AND state = 'reserved')",
          [crypto.randomUUID(), contentId, identity.actor, JSON.stringify({ platform, account_id: accountId, media_sha256: item.media_sha256, educational_story_sha256: item.educational_story_sha256, reservation_id: reservationId }), timestamp, reservationId])
      ]);
      if (results[0]?.meta?.changes !== 1 || results[1]?.meta?.changes !== 1 || results[2]?.meta?.changes !== 1) {
        return json({ ok: false, error: "reservation_state_or_concurrency_conflict" }, 409);
      }
      return json({ ok: true, reservation_id: reservationId, state: "reserved", platform, content_id: contentId }, 201);
    }

    if (parts.length === 4 && parts[1] === "publication-attempts" && parts[3] === "reconcile" && method === "POST") {
      const attemptId = parts[2];
      if (!API_ID.test(attemptId) || !["confirmed", "ambiguous", "failed"].includes(body.outcome)) {
        return json({ ok: false, error: "invalid_reconciliation_request" }, 400);
      }
      const attempt = await apiFirst(env, "SELECT * FROM publication_attempts WHERE id = ?", [attemptId]);
      if (!attempt) return json({ ok: false, error: "publication_attempt_not_found" }, 404);
      if (attempt.state === "confirmed") {
        if (body.outcome === "confirmed" && body.platform_post_id === attempt.platform_post_id) {
          return json({ ok: true, reservation_id: attempt.id, state: "confirmed", idempotent_replay: true });
        }
        return json({ ok: false, error: "confirmed_publication_is_immutable" }, 409);
      }
      if (!["reserved", "ambiguous"].includes(attempt.state)) return json({ ok: false, error: "publication_attempt_not_reconcilable" }, 409);
      const remoteId = body.platform_post_id || null;
      if (body.outcome === "confirmed" && (typeof remoteId !== "string" || !remoteId.trim() || remoteId.length > 256)) {
        return json({ ok: false, error: "remote_platform_post_id_required" }, 400);
      }
      const targetStatus = body.outcome === "confirmed" ? "published" : body.outcome === "failed" ? "failed" : "held";
      const contentStatus = body.outcome === "confirmed" ? "published" : body.outcome === "failed" ? "failed" : "held";
      const finishedAt = body.outcome === "ambiguous" ? null : timestamp;
      const results = await apiBatch(env, [
        apiStatement(env, "UPDATE publication_attempts SET state = ?, platform_post_id = ?, finished_at = ?, error_code = ? WHERE id = ? AND state IN ('reserved','ambiguous')",
          [body.outcome, remoteId, finishedAt, typeof body.error_code === "string" ? body.error_code.slice(0, 128) : null, attemptId]),
        apiStatement(env, "UPDATE content_targets SET status = ?, platform_media_id = ?, published_at = ? WHERE content_id = ? AND platform = ? AND EXISTS (SELECT 1 FROM publication_attempts WHERE id = ? AND state = ?)",
          [targetStatus, remoteId, body.outcome === "confirmed" ? timestamp : null, attempt.content_id, attempt.platform, attemptId, body.outcome]),
        apiStatement(env, "UPDATE content_items SET status = ?, updated_at = ? WHERE id = ? AND status IN ('publishing','held') AND EXISTS (SELECT 1 FROM publication_attempts WHERE id = ? AND state = ?)",
          [contentStatus, timestamp, attempt.content_id, attemptId, body.outcome]),
        apiStatement(env, "INSERT INTO audit_events (id, event_type, content_id, actor, details_json, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM publication_attempts WHERE id = ? AND state = ?)",
          [crypto.randomUUID(), "publication." + body.outcome, attempt.content_id, identity.actor, JSON.stringify({ reservation_id: attemptId, platform: attempt.platform, platform_post_id: remoteId, error_code: body.error_code || null }), timestamp, attemptId, body.outcome])
      ]);
      if (results[0]?.meta?.changes !== 1 || results[1]?.meta?.changes !== 1 || results[2]?.meta?.changes !== 1) {
        return json({ ok: false, error: "reconciliation_state_conflict" }, 409);
      }
      return json({ ok: true, reservation_id: attemptId, state: body.outcome, content_status: contentStatus });
    }

    return json({ ok: false, error: "not_found" }, 404);
  } catch {
    return json({ ok: false, error: "publisher_state_persistence_failed" }, 503);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
      try {
        const requiredTables = ["content_items", "approvals", "audit_events", "content_targets", "media_rights", "media_evidence", "review_evidence", "publication_attempts", "meta_webhook_events"];
        const tableRows = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('content_items','approvals','audit_events','content_targets','media_rights','media_evidence','review_evidence','publication_attempts','meta_webhook_events')").all();
        const foundTables = new Set((tableRows?.results || []).map((row) => row.name));
        const schemaReady = requiredTables.every((name) => foundTables.has(name));
        return Response.json({
          service: "nature-frontiers-publisher",
          status: schemaReady ? "online" : "degraded",
          database: schemaReady ? "connected" : "schema_incomplete",
          publishingEnabled: false,
          dryRun: true,
          emergencyStop: true,
          timestamp: new Date().toISOString()
        }, { status: schemaReady ? 200 : 503, headers: { "Cache-Control": "no-store" } });
      } catch {
        return json({ service: "nature-frontiers-publisher", status: "degraded", database: "unavailable", publishingEnabled: false, dryRun: true, emergencyStop: true }, 503);
      }
    }

    if (url.pathname === "/webhooks/meta") return handleMetaWebhook(request, env);
    if (url.pathname.startsWith("/api/")) return handlePublisherApi(request, env);

    const mediaMatch = MEDIA_PATH.exec(url.pathname);
    if (mediaMatch) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
      }
      if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
        return json({ ok: false, error: "media_assets_binding_unavailable" }, 503);
      }
      // Fetch the complete object even for HEAD so the hash in the public URL is verified.
      const response = await env.ASSETS.fetch(new Request(request.url, { method: "GET" }));
      if (!response.ok) return new Response("Media not found", { status: response.status === 404 ? 404 : 502, headers: { "Cache-Control": "no-store" } });
      const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!ALLOWED_TYPES.has(contentType)) return new Response("Unsupported media type", { status: 415, headers: { "Cache-Control": "no-store" } });
      const expectedExtension = contentType === "image/jpeg" ? /\.(jpg|jpeg)$/i : /\.mp4$/i;
      if (!expectedExtension.test(url.pathname)) return new Response("Media extension and content type mismatch", { status: 415, headers: { "Cache-Control": "no-store" } });
      const declaredLength = Number(response.headers.get("content-length") || 0);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_MEDIA_ASSET_BYTES) {
        return new Response("Media asset exceeds the 25 MiB static-asset limit", { status: 413, headers: { "Cache-Control": "no-store" } });
      }
      let bytes;
      try { bytes = await response.arrayBuffer(); }
      catch { return new Response("Media asset could not be read", { status: 502, headers: { "Cache-Control": "no-store" } }); }
      if (bytes.byteLength > MAX_MEDIA_ASSET_BYTES) {
        return new Response("Media asset exceeds the 25 MiB static-asset limit", { status: 413, headers: { "Cache-Control": "no-store" } });
      }
      const actualHash = await sha256Hex(bytes);
      if (actualHash !== mediaMatch[1].toLowerCase()) {
        return new Response("Media asset SHA-256 does not match its URL", { status: 502, headers: { "Cache-Control": "no-store" } });
      }
      const headers = new Headers(response.headers);
      headers.set("Content-Type", contentType);
      headers.set("Content-Length", String(bytes.byteLength));
      headers.set("X-Content-SHA256", actualHash);
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.delete("Set-Cookie");
      return new Response(request.method === "HEAD" ? null : bytes, { status: 200, headers });
    }

    return json({ ok: false, error: "not_found" }, 404);
  }
};
