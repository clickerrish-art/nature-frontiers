import { createHash } from "node:crypto";
import { validateInstagramCampaign } from "./instagram-campaign-gate.mjs";

const fingerprint = (campaign, gate) => createHash("sha256")
  .update(JSON.stringify({ destination: campaign.destination, caption_sha256: gate.caption_sha256, media_sha256: gate.media_sha256 }))
  .digest("hex");

function fail(code, message) { return { ok: false, code, message }; }

export async function runInstagramCampaign({
  campaign, history = [], products = [], policy = {}, env = {}, stateStore, mediaHost, api,
  now = new Date(), logger = console
}) {
  if (env.PUBLISH_EMERGENCY_STOP !== "false") return fail("EMERGENCY_STOP", "Emergency stop is active.");
  if (env.PUBLISH_ENABLED !== "true") return fail("GLOBAL_PUBLISH_DISABLED", "Global publishing is not explicitly enabled.");
  if (env.PUBLISH_DRY_RUN !== "false") return fail("DRY_RUN", "Dry-run is active; no platform request will be sent.");
  if (env.INSTAGRAM_PUBLISH_ENABLED !== "YES") return fail("INSTAGRAM_PUBLISH_DISABLED", "Instagram publishing is not explicitly enabled.");
  if (!/^[0-9]+$/.test(env.INSTAGRAM_USER_ID ?? "") || !env.INSTAGRAM_ACCESS_TOKEN || !/^v[0-9]+\.[0-9]+$/.test(env.META_GRAPH_API_VERSION ?? "")) {
    return fail("INSTAGRAM_CONFIG_MISSING", "Instagram user ID, SUAT and supported Graph API version are required.");
  }
  if (!stateStore || !mediaHost || !api) return fail("DEPENDENCY_MISSING", "Durable state, public media host and API client are mandatory.");
  if (campaign.product_id) {
    const product = products.find((item) => item.id === campaign.product_id);
    if (!product || product.status !== "approved") return fail("PRODUCT_NOT_APPROVED", "Linked product is missing or not approved.");
    if (campaign.commercial !== true || campaign.disclosureRequired !== true) return fail("PRODUCT_DISCLOSURE_REQUIRED", "Product promotion must be explicitly marked commercial and require verified disclosure.");
    if (typeof product.url !== "string" || !campaign.caption.includes(product.url) || campaign.link_check?.url !== product.url || campaign.link_check?.final_url !== product.url) return fail("PRODUCT_LINK_NOT_BOUND", "Approved caption and recent link check must bind to the exact catalogue product URL.");
  }
  const gate = validateInstagramCampaign(campaign, history, policy, now);
  if (!gate.ok) return { ...fail("CAMPAIGN_GATE_FAILED", "Campaign approval, rights or content checks failed."), issues: gate.issues };
  if (campaign.media_assets[0].kind !== "image" && campaign.media_assets[0].kind !== "reel") return fail("MEDIA_KIND_INVALID", "Only image and Reel publishing are supported.");
  const id = campaign.id;
  if (typeof id !== "string" || !id.trim()) return fail("CAMPAIGN_ID_MISSING", "Stable campaign ID is required.");
  const fp = fingerprint(campaign, gate);
  let state = await stateStore.read();
  const reservations = state.reservations ?? {};
  let reservation = reservations[id];
  if (reservation && reservation.fingerprint !== fp) return fail("RESERVATION_FINGERPRINT_MISMATCH", "Campaign content changed after reservation; manual review is required.");
  if (reservation?.status === "published") return { ok: true, status: "already_published", mediaId: reservation.media_id, permalink: reservation.permalink };
  if (reservation?.status === "publishing" || reservation?.status === "unknown") {
    const recent = await api.listRecentMedia(100);
    const matches = recent.filter((item) => item.caption === campaign.caption.trim() &&
      Date.parse(item.timestamp ?? "") >= Date.parse(reservation.started_at) - 120000 &&
      item.media_type === (campaign.media_assets[0].kind === "reel" ? "VIDEO" : "IMAGE"));
    if (matches.length === 1 && matches[0].permalink) {
      const remoteCheck = await api.verifyMedia(matches[0].id, campaign.media_assets[0].kind);
      if (remoteCheck?.id === matches[0].id && remoteCheck.permalink === matches[0].permalink &&
          remoteCheck.mediaType === (campaign.media_assets[0].kind === "reel" ? "VIDEO" : "IMAGE")) {
        reservation = { ...reservation, status: "published", media_id: matches[0].id, permalink: remoteCheck.permalink, reconciled_at: now.toISOString() };
        await stateStore.write({ ...state, reservations: { ...reservations, [id]: reservation } });
        return { ok: true, status: "reconciled_published", mediaId: reservation.media_id, permalink: reservation.permalink };
      }
      return fail("AMBIGUOUS_PUBLISH_REQUIRES_REVIEW", "A possible matching post was found but its media read-back did not confirm it; no retry is allowed.");
    }
    return fail("AMBIGUOUS_PUBLISH_REQUIRES_REVIEW", matches.length ? "Multiple matching remote posts found; no retry is allowed." : "Prior publish outcome is ambiguous; no retry is allowed. Inspect Instagram manually.");
  }
  if (reservation?.status === "published_unverified") {
    const verified = await api.verifyMedia(reservation.media_id, campaign.media_assets[0].kind);
    const expectedMediaType = campaign.media_assets[0].kind === "reel" ? "VIDEO" : "IMAGE";
    if (!verified?.permalink || verified.id !== reservation.media_id || verified.mediaType !== expectedMediaType) return fail("REMOTE_VERIFICATION_FAILED", "Known media ID and expected media type are not yet verifiable; no new publish will be attempted.");
    reservation = { ...reservation, status: "published", permalink: verified.permalink, verified_at: now.toISOString() };
    await stateStore.write({ ...state, reservations: { ...reservations, [id]: reservation } });
    return { ok: true, status: "verified_published", mediaId: reservation.media_id, permalink: verified.permalink };
  }

  if (!reservation) {
    const quota = await api.getPublishingLimit();
    if (quota.quotaUsage >= quota.quotaTotal) return fail("PUBLISHING_QUOTA_REACHED", "Meta reported publishing quota reached.");
    const hosted = await mediaHost.resolveAndVerify(campaign.media_assets[0]);
    if (hosted.contentLength !== campaign.media_assets[0].technical_check.file_size) return fail("MEDIA_SIZE_MISMATCH", "Hosted media byte count differs from the technical preflight manifest.");
    reservation = {
      campaign_id: id, fingerprint: fp, status: "reserved", started_at: now.toISOString(),
      media_path: campaign.media_assets[0].media_path, media_url: hosted.url, media_file_size: hosted.contentLength,
      media_sha256: campaign.media_assets[0].sha256, caption_sha256: gate.caption_sha256,
      destination: campaign.destination, container_id: null, media_id: null, permalink: null
    };
    await stateStore.write({ ...state, reservations: { ...reservations, [id]: reservation } });
    state = await stateStore.read();
  }

  if (!reservation.container_id) {
    const hostedAgain = await mediaHost.resolveAndVerify(campaign.media_assets[0]);
    if (hostedAgain.url !== reservation.media_url || hostedAgain.sha256 !== campaign.media_assets[0].sha256.toLowerCase() || hostedAgain.contentLength !== reservation.media_file_size) {
      return fail("HOSTED_MEDIA_CHANGED", "Public media bytes or URL changed after reservation; no container or post was created.");
    }
    let created;
    try {
      created = await api.createContainer({
        kind: campaign.media_assets[0].kind, url: reservation.media_url, caption: campaign.caption.trim(), shareToFeed: campaign.media_assets[0].share_to_feed, aiGenerated: campaign.media_assets[0].ai_generated === true
      });
    } catch (error) {
      reservation = { ...reservation, status: "unknown", container_create_failure: error?.name ?? "Error" };
      await stateStore.write({ ...state, reservations: { ...state.reservations, [id]: reservation } });
      return fail("CONTAINER_CREATE_AMBIGUOUS", "Container creation failed or was ambiguous; inspect before retrying.");
    }
    if (!created?.containerId) {
      reservation = { ...reservation, status: "unknown" };
      await stateStore.write({ ...state, reservations: { ...state.reservations, [id]: reservation } });
      return fail("CONTAINER_CREATE_AMBIGUOUS", "Container creation outcome is ambiguous; no automatic retry is allowed.");
    }
    reservation = { ...reservation, status: "container_created", container_id: created.containerId };
    await stateStore.write({ ...state, reservations: { ...state.reservations, [id]: reservation } });
    state = await stateStore.read();
  }

  const container = await api.getContainerStatus(reservation.container_id);
  if (container.statusCode !== "FINISHED") return fail("CONTAINER_NOT_READY", `Meta container status is ${container.statusCode}; publication is blocked.`);
  const finalQuota = await api.getPublishingLimit();
  if (finalQuota.quotaUsage >= finalQuota.quotaTotal) return fail("PUBLISHING_QUOTA_REACHED", "Meta reported publishing quota reached immediately before publication.");
  reservation = { ...reservation, status: "publishing", publish_attempted_at: now.toISOString() };
  await stateStore.write({ ...state, reservations: { ...state.reservations, [id]: reservation } });
  state = await stateStore.read();
  let published;
  try {
    published = await api.publishContainer(reservation.container_id);
  } catch (error) {
    reservation = { ...reservation, status: "unknown", failure_type: error?.name ?? "Error" };
    await stateStore.write({ ...state, reservations: { ...state.reservations, [id]: reservation } });
    return fail("PUBLISH_OUTCOME_AMBIGUOUS", "Publish request failed or was ambiguous; durable state blocks retries. Inspect the account.");
  }
  if (!published?.mediaId) {
    reservation = { ...reservation, status: "unknown" };
    await stateStore.write({ ...state, reservations: { ...state.reservations, [id]: reservation } });
    return fail("PUBLISH_OUTCOME_AMBIGUOUS", "Meta returned no media ID; no retry is allowed.");
  }
  reservation = { ...reservation, status: "published_unverified", media_id: published.mediaId };
  await stateStore.write({ ...state, reservations: { ...state.reservations, [id]: reservation } });
  const verified = await api.verifyMedia(published.mediaId, campaign.media_assets[0].kind);
  const expectedMediaType = campaign.media_assets[0].kind === "reel" ? "VIDEO" : "IMAGE";
  if (!verified?.permalink || verified.id !== published.mediaId || verified.mediaType !== expectedMediaType) {
    return fail("REMOTE_VERIFICATION_FAILED", "Meta returned a media ID but read-back verification did not confirm its permalink.");
  }
  reservation = { ...reservation, status: "published", permalink: verified.permalink, verified_at: now.toISOString() };
  await stateStore.write({ ...state, reservations: { ...state.reservations, [id]: reservation } });
  logger.log?.(`Instagram campaign ${id} verified: ${verified.permalink}`);
  return { ok: true, status: "published", mediaId: published.mediaId, permalink: verified.permalink };
}
