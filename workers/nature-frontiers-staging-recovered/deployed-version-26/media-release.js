const encoder = new TextEncoder();
const MEDIA_MAX_BYTES = 50 * 1024 * 1024;
const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
const MEDIA_TYPES = new Set(["image/jpeg","image/png","image/webp","video/mp4","video/quicktime","video/webm"]);
const EVIDENCE_TYPES = new Set(["application/pdf","image/jpeg","image/png"]);
const PLATFORMS = new Set(["facebook","instagram"]);
const RIGHTS = new Set(["owned","licensed","public_domain","rejected","unverified"]);
const POSITIVE_RIGHTS = new Set(["owned","licensed","public_domain"]);
function hasFileSignature(type, bytes) {
  const starts = (...values) => values.every((value,index)=>bytes[index]===value);
  if (type==="image/jpeg") return starts(0xff,0xd8,0xff) && bytes.length>=4 && bytes[bytes.length-2]===0xff && bytes[bytes.length-1]===0xd9;
  if (type==="image/png") return starts(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a);
  if (type==="image/webp") return starts(0x52,0x49,0x46,0x46) && String.fromCharCode(...bytes.slice(8,12))==="WEBP";
  if (type==="application/pdf") return String.fromCharCode(...bytes.slice(0,5))==="%PDF-";
  if (type==="video/webm") return starts(0x1a,0x45,0xdf,0xa3);
  if (type==="video/mp4" || type==="video/quicktime") return bytes.length>=12 && String.fromCharCode(...bytes.slice(4,8))==="ftyp";
  return false;
}

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
});
const fail = (message, status = 400) => Object.assign(new Error(message), {status});
const sha256 = async bytes => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
  .map(x => x.toString(16).padStart(2,"0")).join("");

function allowedUrl(raw, binding) {
  let url;
  try { url = new URL(raw); } catch { throw fail("A valid HTTPS URL is required"); }
  const hosts = String(binding || "").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
      url.hostname.endsWith(".") || !hosts.includes(url.hostname.toLowerCase())) {
    throw fail("URL host is not on the configured HTTPS allowlist", 403);
  }
  return url;
}

async function fetchVerified(raw, allowlist, maxBytes, allowedTypes) {
  const url = allowedUrl(raw, allowlist);
  const response = await fetch(url, {method:"GET", redirect:"manual", headers:{Accept:[...allowedTypes].join(", ")}});
  if (response.status >= 300 && response.status < 400) throw fail("Redirects are not accepted for evidence or media verification", 422);
  if (!response.ok) throw fail("Source fetch failed with HTTP " + response.status, 422);
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!allowedTypes.has(type)) throw fail("Unsupported source MIME type: " + (type || "missing"), 422);
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw fail("Source exceeds the permitted byte limit", 413);
  if (!response.body) throw fail("Source returned no readable bytes", 422);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw fail("Source exceeds the permitted byte limit", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!total) throw fail("Source is empty", 422);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  if (!hasFileSignature(type,bytes)) throw fail("Downloaded bytes do not match the declared file format",422);
  return {url:url.href, type, bytes, byteLength:total, sha256:await sha256(bytes)};
}

async function parseBody(request, max = 16384) {
  const text = await request.text();
  if (text.length > max) throw fail("Request body too large", 413);
  try { return JSON.parse(text); } catch { throw fail("Invalid JSON body"); }
}
const validHash = value => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const validExpiry = value => !value || (typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value && Date.parse(value) > Date.now());
const httpsReference = value => { try { const u=new URL(value); return u.protocol==="https:" && !u.username && !u.password; } catch { return false; } };
const sign = async (secret, value) => {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
};

async function audit(db, contentId, actor, eventType, details) {
  await db.prepare("INSERT INTO audit_events(id,event_type,content_id,actor,details_json,created_at) VALUES(?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), eventType, contentId, actor, JSON.stringify(details), new Date().toISOString()).run();
}

export async function handleMediaRelease(request, env, session) {
  const path = new URL(request.url).pathname;
  const mediaMatch = path.match(/^\/api\/content\/([a-f0-9-]{36})\/media\/verify$/i);
  const rightsMatch = path.match(/^\/api\/content\/([a-f0-9-]{36})\/rights$/i);
  const rightsRevokeMatch = path.match(/^\/api\/content\/([a-f0-9-]{36})\/rights\/([a-f0-9-]{36})\/revoke$/i);
  const approvalMatch = path.match(/^\/api\/content\/([a-f0-9-]{36})\/approval$/i);
  const receiptCheckMatch = path.match(/^\/api\/content\/([a-f0-9-]{36})\/approval-verification$/i);
  const targetMatch = path.match(/^\/api\/content\/([a-f0-9-]{36})\/targets$/i);
  if (!mediaMatch && !rightsMatch && !rightsRevokeMatch && !approvalMatch && !receiptCheckMatch && !targetMatch) return null;
  if (targetMatch && request.method === "GET") {
    if (!session || session.user?.role !== "owner") return json({error:"Owner session required"},403);
    const [targets,connections] = await Promise.all([
      env.DB.prepare("SELECT ct.platform,ct.account_id,ct.status,mc.page_name,mc.status AS connection_status,mc.identity_verified_at,mc.permissions_verified_at,mc.instagram_identity_verified_at,mc.token_expires_at FROM content_targets ct LEFT JOIN meta_connections mc ON mc.provider='meta' AND ((ct.platform='facebook' AND mc.page_id=ct.account_id) OR (ct.platform='instagram' AND mc.instagram_business_account_id=ct.account_id)) WHERE ct.content_id=? ORDER BY ct.platform").bind(targetMatch[1]).all(),
      env.DB.prepare("SELECT id,page_id,page_name,instagram_business_account_id,status,identity_verified_at,permissions_verified_at,instagram_identity_verified_at,token_expires_at FROM meta_connections WHERE provider='meta' ORDER BY updated_at DESC").all()
    ]);
    return json({targets:targets.results||[],connections:connections.results||[]});
  }
  if (receiptCheckMatch && request.method === "GET") {
    if (!session || session.user?.role !== "owner") return json({error:"Owner session required"},403);
    const rows = await env.DB.prepare("SELECT id,content_id,platform,decision,reviewer_id,payload_sha256,rights_evidence_sha256,signed_receipt,approved_at,expires_at,revoked_at FROM approval_receipts WHERE content_id=? ORDER BY created_at DESC LIMIT 50").bind(receiptCheckMatch[1]).all();
    const latest = await env.DB.prepare("SELECT cr.revision,cr.payload_sha256,ci.media_sha256 FROM content_items ci JOIN content_revisions cr ON cr.content_id=ci.id AND cr.revision=(SELECT MAX(revision) FROM content_revisions WHERE content_id=ci.id) WHERE ci.id=?").bind(receiptCheckMatch[1]).first();
    const receipts = [];
    for (const row of rows.results || []) {
      let signatureValid = false, bindingValid = false, currentPayload = false;
      try {
        const parsed = JSON.parse(row.signed_receipt);
        const signature = parsed.signature;
        delete parsed.signature;
        const expected = await sign(env.NF_SESSION_SECRET, JSON.stringify(parsed));
        signatureValid = typeof signature === "string" && signature.length === expected.length && [...signature].every((c,i)=>c.charCodeAt(0)===expected.charCodeAt(i));
        bindingValid = parsed.id === row.id && parsed.contentId === row.content_id &&
          parsed.platform === row.platform && parsed.decision === row.decision &&
          parsed.reviewerId === row.reviewer_id && parsed.payloadSha256 === row.payload_sha256 &&
          parsed.rightsEvidenceSha256 === row.rights_evidence_sha256 &&
          parsed.approvedAt === row.approved_at && parsed.expiresAt === row.expires_at &&
          parsed.mediaSha256 === latest?.media_sha256 && parsed.revision === latest?.revision &&
          parsed.policyVersion === "nf-media-release-v1";
        currentPayload = parsed.payloadSha256 === latest?.payload_sha256 &&
          parsed.mediaSha256 === latest?.media_sha256 && parsed.revision === latest?.revision;
      } catch {}
      receipts.push({id:row.id,platform:row.platform,decision:row.decision,signatureValid,bindingValid,currentPayload,revoked:Boolean(row.revoked_at),expired:Boolean(row.expires_at && row.expires_at<=new Date().toISOString())});
    }
    return json({receipts});
  }
  if (rightsRevokeMatch) {
    if (request.method !== "POST") return json({error:"Method not allowed"},405);
    if (!session || session.user?.role !== "owner") return json({error:"Owner session required"},403);
    const body = await parseBody(request);
    if (body.confirmation !== "REVOKE RIGHTS EVIDENCE") throw fail("Explicit rights-revocation confirmation is required",403);
    const content = await env.DB.prepare("SELECT media_sha256 FROM content_items WHERE id=?").bind(rightsRevokeMatch[1]).first();
    if (!content) return json({error:"Content not found"},404);
    const evidence = await env.DB.prepare("SELECT id,revoked_at,evidence_sha256 FROM media_rights_evidence WHERE id=? AND media_sha256=?").bind(rightsRevokeMatch[2],content.media_sha256).first();
    if (!evidence) return json({error:"Rights evidence not found for this content"},404);
    if (evidence.revoked_at) return json({error:"Rights evidence is already revoked"},409);
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE media_rights_evidence SET revoked_at=? WHERE id=? AND media_sha256=? AND revoked_at IS NULL").bind(now,evidence.id,content.media_sha256).run();
    await audit(env.DB,rightsRevokeMatch[1],session.user.id,"media.rights.revocation.authorized",{evidenceId:evidence.id,evidenceSha256:evidence.evidence_sha256,revokedAt:now});
    return json({revoked:true,evidenceId:evidence.id,evidenceSha256:evidence.evidence_sha256,revokedAt:now,revokedBy:session.user.id});
  }
  if (!mediaMatch && !rightsMatch && !approvalMatch && !targetMatch) return json({error:"Method not allowed"},405);
  if (request.method !== "POST") return json({error:"Method not allowed"},405);
  if (!session || session.user?.role !== "owner") return json({error:"Owner session required"},403);
  const contentId = (mediaMatch || rightsMatch || approvalMatch || targetMatch)[1];
  const content = await env.DB.prepare("SELECT ci.id,ci.content_type,ci.caption,ci.media_url,ci.media_sha256,ci.status,cr.revision,cr.payload_sha256 FROM content_items ci JOIN content_revisions cr ON cr.content_id=ci.id AND cr.revision=(SELECT MAX(revision) FROM content_revisions WHERE content_id=ci.id) WHERE ci.id=?")
    .bind(contentId).first();
  if (!content) return json({error:"Content not found"},404);
  if ((mediaMatch || rightsMatch) && content.status !== "draft" && content.status !== "needs_review") return json({error:"Only an editable draft can enter media and rights review"},409);
  if (approvalMatch && !["draft","needs_review","approved"].includes(content.status)) return json({error:"Only current reviewable content can receive platform approval"},409);
  if (targetMatch) {
    const body = await parseBody(request);
    const platform = body.platform;
    const accountId = String(body.accountId||"");
    if (!PLATFORMS.has(platform) || !/^[0-9]{5,30}$/.test(accountId) ||
        body.confirmation !== "BIND NATURE FRONTIERS " + platform.toUpperCase() + " DESTINATION") {
      throw fail("Platform, exact numeric destination ID and explicit destination-binding confirmation are required",403);
    }
    if (!["draft","needs_review","approved","scheduled"].includes(content.status)) return json({error:"Only editable or scheduled content can be bound to a destination"},409);
    const now = new Date().toISOString();
    const connection = platform === "facebook"
      ? await env.DB.prepare("SELECT id,page_id,token_expires_at FROM meta_connections WHERE provider='meta' AND page_id=? AND status='verified' AND identity_verified_at IS NOT NULL AND permissions_verified_at IS NOT NULL AND (token_expires_at IS NULL OR token_expires_at>?)").bind(accountId,now).first()
      : await env.DB.prepare("SELECT id,instagram_business_account_id,token_expires_at FROM meta_connections WHERE provider='meta' AND instagram_business_account_id=? AND status='verified' AND identity_verified_at IS NOT NULL AND permissions_verified_at IS NOT NULL AND instagram_identity_verified_at IS NOT NULL AND (token_expires_at IS NULL OR token_expires_at>?)").bind(accountId,now).first();
    if (!connection) return json({error:"The exact destination is not present on a current, verified Meta connection"},409);
    const existing = await env.DB.prepare("SELECT account_id,status FROM content_targets WHERE content_id=? AND platform=?").bind(contentId,platform).first();
    if (existing?.account_id===accountId && existing.status==="approved") return json({bound:true,unchanged:true,platform,accountId,status:"approved"});
    const targetChanged = existing?.account_id !== accountId;
    if (targetChanged) {
      await env.DB.prepare("UPDATE approval_receipts SET revoked_at=? WHERE content_id=? AND platform=? AND revoked_at IS NULL").bind(now,contentId,platform).run();
      await env.DB.prepare("UPDATE content_items SET status='needs_review',updated_at=? WHERE id=? AND status IN ('approved','scheduled')").bind(now,contentId).run();
    }
    await env.DB.prepare("INSERT INTO content_targets(content_id,platform,account_id,platform_media_id,published_at,status) VALUES(?,?,?,NULL,NULL,'held') ON CONFLICT(content_id,platform) DO UPDATE SET account_id=excluded.account_id,platform_media_id=NULL,published_at=NULL,status='held'").bind(contentId,platform,accountId).run();
    await audit(env.DB,contentId,session.user.id,"content.destination.bound",{platform,accountId,connectionId:connection.id,approvalReset:targetChanged});
    return json({bound:true,platform,accountId,status:"held",nextStep:"Re-approve this platform after binding the exact destination"});
  }

  if (mediaMatch) {
    const fetched = await fetchVerified(content.media_url, env.NF_MEDIA_ALLOWED_HOSTS, MEDIA_MAX_BYTES, MEDIA_TYPES);
    const expectedType = content.content_type === "reel" ? fetched.type.startsWith("video/") : fetched.type.startsWith("image/");
    if (!expectedType) throw fail("Media MIME type does not match the content format",422);
    if (!validHash(content.media_sha256) || fetched.sha256 !== content.media_sha256.toLowerCase()) {
      const old = await env.DB.prepare("SELECT validation_status FROM media_assets WHERE media_sha256=?").bind(content.media_sha256).first();
      if (old?.validation_status === "pending") await env.DB.prepare("UPDATE media_assets SET validation_status='failed' WHERE media_sha256=?").bind(content.media_sha256).run();
      throw fail("Downloaded media SHA-256 does not match the draft's declared hash; media was not approved",422);
    }
    const now = new Date().toISOString();
    const provenance = {verification:"worker-fetched-bytes",sourceHost:new URL(fetched.url).hostname,verifiedBy:session.user.id,verifiedAt:now,sha256:fetched.sha256,byteLength:fetched.byteLength,mimeType:fetched.type};
    const existing = await env.DB.prepare("SELECT validation_status FROM media_assets WHERE media_sha256=?").bind(fetched.sha256).first();
    if (existing && existing.validation_status !== "pending") {
      if (existing.validation_status !== "passed") throw fail("This media hash is already failed or held; use a new reviewed asset",409);
    } else if (!existing) {
      await env.DB.prepare("INSERT INTO media_assets(media_sha256,storage_provider,object_key,media_url,mime_type,byte_length,provenance_json,validation_status,created_at) VALUES(?,'external',NULL,?,?,?,?, 'pending',?)")
        .bind(fetched.sha256,fetched.url,fetched.type,fetched.byteLength,JSON.stringify(provenance),now).run();
      await env.DB.prepare("UPDATE media_assets SET validation_status='passed' WHERE media_sha256=? AND validation_status='pending'").bind(fetched.sha256).run();
    }
    await audit(env.DB,contentId,session.user.id,"media.bytes.verified",{sha256:fetched.sha256,byteLength:fetched.byteLength,mimeType:fetched.type,sourceHost:new URL(fetched.url).hostname});
    return json({verified:true,sha256:fetched.sha256,byteLength:fetched.byteLength,mimeType:fetched.type,validationStatus:"passed",note:"The Worker fetched and hashed the current media bytes. The source remains externally hosted; no copy was stored."});
  }

  if (rightsMatch) {
    const body = await parseBody(request);
    if (body.confirmation !== "I CONFIRM THESE RIGHTS DETAILS ARE ACCURATE") throw fail("Explicit rights attestation is required",403);
    if (!RIGHTS.has(body.rightsStatus) || typeof body.rightsHolder !== "string" || body.rightsHolder.trim().length < 2 ||
        !httpsReference(body.sourceUrl) || typeof body.licenseReference !== "string" || body.licenseReference.trim().length < 2 || !validExpiry(body.expiresAt) ||
        !validHash(body.evidenceSha256) || typeof body.evidenceUrl !== "string") throw fail("Rights holder, source, license reference and evidence hash/URL are required");
    const platforms = [...new Set(body.permittedPlatforms || [])];
    const uses = [...new Set(body.permittedUses || [])];
    if (!platforms.length || platforms.some(x=>!PLATFORMS.has(x)) || !uses.includes("social_media") ||
        uses.some(x=>!["social_media","editorial","commercial"].includes(x))) throw fail("Explicit permitted platforms and social_media use are required");
    const asset = await env.DB.prepare("SELECT validation_status FROM media_assets WHERE media_sha256=?").bind(content.media_sha256).first();
    if (asset?.validation_status !== "passed") throw fail("Verify the actual media bytes before recording rights",409);
    const evidence = await fetchVerified(body.evidenceUrl,env.NF_EVIDENCE_ALLOWED_HOSTS,EVIDENCE_MAX_BYTES,EVIDENCE_TYPES);
    if (evidence.sha256 !== body.evidenceSha256.toLowerCase()) throw fail("Rights evidence bytes do not match the submitted SHA-256",422);
    const id = crypto.randomUUID(), now = new Date().toISOString();
    const evidenceSha = evidence.sha256;
    await env.DB.prepare("INSERT INTO media_rights_evidence(id,media_sha256,rights_status,rights_holder,source_url,license_reference,permitted_platforms_json,permitted_uses_json,evidence_uri,evidence_sha256,verified_by,verified_at,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id,content.media_sha256,body.rightsStatus,body.rightsHolder.trim(),body.sourceUrl,body.licenseReference.trim(),JSON.stringify(platforms),JSON.stringify(uses),evidence.url,evidenceSha,session.user.id,now,body.expiresAt || null,now).run();
    await audit(env.DB,contentId,session.user.id,"media.rights.attested",{evidenceId:id,evidenceSha256:evidenceSha,rightsStatus:body.rightsStatus,permittedPlatforms:platforms,permittedUses:uses,attestation:"owner-explicit"});
    return json({recorded:true,evidenceId:id,evidenceSha256:evidenceSha,rightsStatus:body.rightsStatus,verifiedBy:session.user.id,verifiedAt:now,warning:"The Worker verified the evidence file bytes and recorded your attestation; it cannot independently establish legal ownership or license authenticity."},201);
  }

  const body = await parseBody(request);
  const platform = body.platform;
  if (!PLATFORMS.has(platform) || !validHash(body.rightsEvidenceSha256) ||
      body.confirmation !== "APPROVE CURRENT REVISION FOR " + platform.toUpperCase()) {
    throw fail("Platform, matching rights evidence hash and exact human approval confirmation are required",403);
  }
  const rights = await env.DB.prepare("SELECT id,rights_status,permitted_platforms_json,permitted_uses_json,revoked_at,expires_at FROM media_rights_evidence WHERE media_sha256=? AND evidence_sha256=? ORDER BY created_at DESC LIMIT 1")
    .bind(content.media_sha256,body.rightsEvidenceSha256.toLowerCase()).first();
  if (!rights || !POSITIVE_RIGHTS.has(rights.rights_status) || rights.revoked_at ||
      (rights.expires_at && rights.expires_at <= new Date().toISOString()) ||
      !JSON.parse(rights.permitted_platforms_json).includes(platform) ||
      !JSON.parse(rights.permitted_uses_json).includes("social_media")) throw fail("No current matching rights record permits this platform and use",409);
  const now = new Date().toISOString();
  const target = await env.DB.prepare("SELECT ct.account_id,ct.status FROM content_targets ct JOIN meta_connections mc ON mc.provider='meta' AND mc.status='verified' AND mc.identity_verified_at IS NOT NULL AND mc.permissions_verified_at IS NOT NULL AND ((ct.platform='facebook' AND mc.page_id=ct.account_id) OR (ct.platform='instagram' AND mc.instagram_business_account_id=ct.account_id AND mc.instagram_identity_verified_at IS NOT NULL)) WHERE ct.content_id=? AND ct.platform=? AND ct.status IN ('held','approved') AND (mc.token_expires_at IS NULL OR mc.token_expires_at>?)").bind(contentId,platform,now).first();
  if (!target) throw fail("Bind and verify the exact Meta destination before approving this platform",409);
  const asset = await env.DB.prepare("SELECT validation_status FROM media_assets WHERE media_sha256=?").bind(content.media_sha256).first();
  if (asset?.validation_status !== "passed") throw fail("Actual media bytes have not passed verification",409);
  if (!validExpiry(body.expiresAt)) throw fail("Approval expiry must be a future ISO-8601 timestamp");
  const id = crypto.randomUUID();
  const approvalExpiry = body.expiresAt || new Date(Date.now()+7*24*60*60*1000).toISOString();
  const receipt = {id,contentId,platform,decision:"approved",reviewerId:session.user.id,revision:content.revision,payloadSha256:content.payload_sha256,mediaSha256:content.media_sha256,rightsEvidenceSha256:body.rightsEvidenceSha256.toLowerCase(),approvedAt:now,expiresAt:approvalExpiry,policyVersion:"nf-media-release-v1"};
  const signed = JSON.stringify({...receipt,signature:await sign(env.NF_SESSION_SECRET,JSON.stringify(receipt))});
  await env.DB.prepare("INSERT INTO approval_receipts(id,content_id,platform,decision,reviewer_id,payload_sha256,rights_evidence_sha256,policy_version,signed_receipt,approved_at,expires_at,created_at) VALUES(?,?,?,'approved',?,?,?,?,?,?,?,?)")
    .bind(id,contentId,platform,session.user.id,content.payload_sha256,body.rightsEvidenceSha256.toLowerCase(),"nf-media-release-v1",signed,now,approvalExpiry,now).run();
  const targetUpdate = await env.DB.prepare("UPDATE content_targets SET status='approved' WHERE content_id=? AND platform=? AND account_id=? AND status IN ('held','approved')").bind(contentId,platform,target.account_id).run();
  if (Number(targetUpdate?.meta?.changes||0)!==1) {
    await env.DB.prepare("UPDATE approval_receipts SET revoked_at=? WHERE id=? AND revoked_at IS NULL").bind(now,id).run();
    throw fail("Destination changed during approval; the new receipt was revoked and approval must be repeated",409);
  }
  await env.DB.prepare("UPDATE content_items SET status='approved',updated_at=? WHERE id=? AND status IN ('draft','needs_review','approved')").bind(now,contentId).run();
  await audit(env.DB,contentId,session.user.id,"content.human.approved",{approvalId:id,platform,accountId:target.account_id,revision:content.revision,payloadSha256:content.payload_sha256,mediaSha256:content.media_sha256,rightsEvidenceSha256:body.rightsEvidenceSha256.toLowerCase(),signatureAlgorithm:"HMAC-SHA256"});
  return json({approved:true,approvalId:id,platform,revision:content.revision,payloadSha256:content.payload_sha256,rightsEvidenceSha256:body.rightsEvidenceSha256.toLowerCase(),approvedBy:session.user.id,approvedAt:now,expiresAt:approvalExpiry,signatureAlgorithm:"HMAC-SHA256"});
}
