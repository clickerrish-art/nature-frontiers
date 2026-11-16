import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validateInstagramCampaign } from "./instagram-campaign-gate.mjs";
import { createPublicMediaHost } from "./instagram-media-host.mjs";
import { createMemoryInstagramStateStore, createGitHubInstagramStateStore } from "./instagram-state-store.mjs";
import { runInstagramCampaign } from "./instagram-publisher.mjs";

const now = new Date("2026-11-16T12:00:00.000Z");
const sha = "a".repeat(64);
const caption = "Wildlife stories matter.";
const hash = (s) => createHash("sha256").update(s).digest("hex");
function validCampaign() {
  const campaign = {
    id: "ig-campaign-1", network: "instagram", destination: "instagram:nature-frontiers",
    status: "approved", caption, commercial: false, disclosureRequired: false,
    media_assets: [{
      kind: "image", media_path: "nature-frontiers/ig/post-1.jpg", sha256: sha,
      rights: { status: "cleared", written_permission_ref: "rights:123", worldwide: true, commercial_worldwide: true, editing_allowed: true, social_platforms: ["instagram"] },
      originality: { status: "verified", source_ref: "source:123" },
      watermark_scan: { status: "clean" }, audio: { present: false }, ai_generated: false
    }]
  };
  campaign.human_approval = {
    reviewer: "owner-reviewer", approved_at: "2026-11-16T11:00:00.000Z",
    destination: campaign.destination, caption_sha256: hash(caption), media_sha256: [sha]
  };
  return campaign;
}
const policy = { banned_phrases: ["guaranteed income"], approval_max_age_days: 30, link_max_age_hours: 24, allowed_link_hosts: ["selar.com"] };
const liveEnv = { PUBLISH_EMERGENCY_STOP: "false", PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false", INSTAGRAM_PUBLISH_ENABLED: "YES", INSTAGRAM_USER_ID: "17841413164146618", INSTAGRAM_ACCESS_TOKEN: "test-token", META_GRAPH_API_VERSION: "v27.0" };
function makeApi(overrides = {}) {
  const calls = [];
  const api = {
    async getPublishingLimit() { calls.push("quota"); return { quotaUsage: 2, quotaTotal: 50 }; },
    async createContainer() { calls.push("create"); return { containerId: "container-1" }; },
    async getContainerStatus() { calls.push("status"); return { statusCode: "FINISHED" }; },
    async publishContainer() { calls.push("publish"); return { mediaId: "media-1" }; },
    async verifyMedia(id, kind) { calls.push("verify"); return { id, permalink: "https://www.instagram.com/p/test/", mediaType: kind === "reel" ? "VIDEO" : "IMAGE" }; },
    async listRecentMedia() { calls.push("reconcile"); return []; },
    ...overrides
  };
  return { api, calls };
}
const mediaHost = { async resolveAndVerify() { return { url: "https://media.example.test/nature-frontiers/ig/post-1.jpg", contentType: "image/jpeg", contentLength: 100, sha256: sha }; } };
const tests = [
  ["complete Instagram approval and rights evidence passes", () => assert.equal(validateInstagramCampaign(validCampaign(), [], policy, now).ok, true)],
  ["draft campaign is blocked", () => { const c=validCampaign(); c.status="draft"; assert.ok(validateInstagramCampaign(c,[],policy,now).issues.some(x=>x.code==="CAMPAIGN_NOT_APPROVED")); }],
  ["wrong destination is blocked", () => { const c=validCampaign(); c.destination="facebook:nature-frontiers"; assert.ok(validateInstagramCampaign(c,[],policy,now).issues.some(x=>x.code==="DESTINATION_MISMATCH")); }],
  ["Instagram rights missing is blocked", () => { const c=validCampaign(); c.media_assets[0].rights.social_platforms=["facebook"]; assert.ok(validateInstagramCampaign(c,[],policy,now).issues.some(x=>x.code==="RIGHTS_NOT_CLEARED")); }],
  ["approval hash mismatch is blocked", () => { const c=validCampaign(); c.human_approval.caption_sha256="0".repeat(64); assert.ok(validateInstagramCampaign(c,[],policy,now).issues.some(x=>x.code==="HUMAN_APPROVAL_NOT_BOUND")); }],
  ["unverified AI disclosure is blocked", () => { const c=validCampaign(); c.media_assets[0].ai_generated=true; assert.ok(validateInstagramCampaign(c,[],policy,now).issues.some(x=>x.code==="AI_DISCLOSURE_MISSING")); }],
  ["commercial post without disclosure requirement is blocked", () => { const c=validCampaign(); c.commercial=true; assert.ok(validateInstagramCampaign(c,[],policy,now).issues.some(x=>x.code==="COMMERCIAL_DISCLOSURE_POLICY")); }],
  ["duplicate caption is blocked", () => { const c=validCampaign(); assert.ok(validateInstagramCampaign(c,[{id:"old",caption}],policy,now).issues.some(x=>x.code==="DUPLICATE_CAPTION")); }],
  ["emergency stop blocks all API calls", async () => { const {api,calls}=makeApi(); const r=await runInstagramCampaign({campaign:validCampaign(),policy,env:{...liveEnv,PUBLISH_EMERGENCY_STOP:"true"},stateStore:createMemoryInstagramStateStore(),mediaHost,api}); assert.equal(r.code,"EMERGENCY_STOP"); assert.deepEqual(calls,[]); }],
  ["dry run blocks all API calls", async () => { const {api,calls}=makeApi(); const r=await runInstagramCampaign({campaign:validCampaign(),policy,env:{...liveEnv,PUBLISH_DRY_RUN:"true"},stateStore:createMemoryInstagramStateStore(),mediaHost,api}); assert.equal(r.code,"DRY_RUN"); assert.deepEqual(calls,[]); }],
  ["missing campaign approval blocks all API calls", async () => { const {api,calls}=makeApi(); const c=validCampaign(); c.status="draft"; const r=await runInstagramCampaign({campaign:c,policy,env:liveEnv,stateStore:createMemoryInstagramStateStore(),mediaHost,api}); assert.equal(r.code,"CAMPAIGN_GATE_FAILED"); assert.deepEqual(calls,[]); }],
  ["unapproved linked product blocks publishing", async () => { const {api,calls}=makeApi(); const c=validCampaign(); c.product_id="p1"; const r=await runInstagramCampaign({campaign:c,products:[{id:"p1",status:"draft"}],policy,env:liveEnv,stateStore:createMemoryInstagramStateStore(),mediaHost,api}); assert.equal(r.code,"PRODUCT_NOT_APPROVED"); assert.deepEqual(calls,[]); }],
  ["approved campaign reserves, creates, publishes and verifies once", async () => { const {api,calls}=makeApi(); const store=createMemoryInstagramStateStore(); const r=await runInstagramCampaign({campaign:validCampaign(),policy,env:liveEnv,stateStore:store,mediaHost,api,now}); assert.equal(r.status,"published"); assert.deepEqual(calls,["quota","create","status","publish","verify"]); assert.equal((await store.read()).reservations["ig-campaign-1"].status,"published"); }],
  ["published reservation prevents duplicate post", async () => { const {api,calls}=makeApi(); const store=createMemoryInstagramStateStore(); await runInstagramCampaign({campaign:validCampaign(),policy,env:liveEnv,stateStore:store,mediaHost,api,now}); calls.length=0; const r=await runInstagramCampaign({campaign:validCampaign(),policy,env:liveEnv,stateStore:store,mediaHost,api,now}); assert.equal(r.status,"already_published"); assert.deepEqual(calls,[]); }],
  ["ambiguous publish is durably marked and never retried", async () => { const {api,calls}=makeApi({async publishContainer(){calls.push("publish");throw new TypeError("socket reset");}}); const store=createMemoryInstagramStateStore(); const first=await runInstagramCampaign({campaign:validCampaign(),policy,env:liveEnv,stateStore:store,mediaHost,api,now}); assert.equal(first.code,"PUBLISH_OUTCOME_AMBIGUOUS"); assert.equal((await store.read()).reservations["ig-campaign-1"].status,"unknown"); const second=await runInstagramCampaign({campaign:validCampaign(),policy,env:liveEnv,stateStore:store,mediaHost,api,now}); assert.equal(second.code,"AMBIGUOUS_PUBLISH_REQUIRES_REVIEW"); assert.equal(calls.filter(x=>x==="publish").length,1); }],
  ["exactly one remote matching post reconciles ambiguous outcome", async () => { const {api,calls}=makeApi({async publishContainer(){calls.push("publish");throw new TypeError("socket reset");},async listRecentMedia(){return [{id:"remote-1",caption,timestamp:"2026-11-16T12:00:00.000Z",media_type:"IMAGE",permalink:"https://www.instagram.com/p/remote/"}];}}); const store=createMemoryInstagramStateStore(); await runInstagramCampaign({campaign:validCampaign(),policy,env:liveEnv,stateStore:store,mediaHost,api,now}); const r=await runInstagramCampaign({campaign:validCampaign(),policy,env:liveEnv,stateStore:store,mediaHost,api,now}); assert.equal(r.status,"reconciled_published"); assert.equal(calls.filter(x=>x==="publish").length,1); }],
  ["reservation fingerprint change is blocked", async () => { const {api}=makeApi(); const store=createMemoryInstagramStateStore({version:1,reservations:{"ig-campaign-1":{fingerprint:"old",status:"reserved"}}}); const r=await runInstagramCampaign({campaign:validCampaign(),policy,env:liveEnv,stateStore:store,mediaHost,api}); assert.equal(r.code,"RESERVATION_FINGERPRINT_MISMATCH"); }],
  ["hosted media hash is verified", async () => { const bytes=Buffer.from("approved media"); const digest=hash(bytes); const body=(async function*(){yield bytes;})(); const host=createPublicMediaHost({baseUrl:"https://cdn.example.test/assets/",fetchImpl:async()=>({ok:true,status:200,headers:new Headers({"content-type":"image/jpeg","content-length":String(bytes.length)}),body})}); const result=await host.resolveAndVerify({kind:"image",media_path:"wildlife/post.jpg",sha256:digest}); assert.equal(result.sha256,digest); }],
  ["media host rejects non-HTTPS base", () => assert.throws(()=>createPublicMediaHost({baseUrl:"http://cdn.example.test"}),/HTTPS/)],
  ["media host rejects traversal path", async () => { const host=createPublicMediaHost({baseUrl:"https://cdn.example.test/assets/",fetchImpl:async()=>{throw new Error("should not run");}}); await assert.rejects(()=>host.resolveAndVerify({kind:"image",media_path:"../escape.jpg",sha256:sha}),/safe relative path/); }],
  ["media host rejects hash mismatch", async () => { const bytes=Buffer.from("wrong media"); const body=(async function*(){yield bytes;})(); const host=createPublicMediaHost({baseUrl:"https://cdn.example.test/assets/",fetchImpl:async()=>({ok:true,status:200,headers:new Headers({"content-type":"image/jpeg","content-length":String(bytes.length)}),body})}); await assert.rejects(()=>host.resolveAndVerify({kind:"image",media_path:"x.jpg",sha256:sha}),/SHA-256/); }]

  ["Meta-reported quota blocks at its actual quota_total", async () => { const {api,calls}=makeApi({async getPublishingLimit(){calls.push("quota");return {quotaUsage:50,quotaTotal:50};}}); const r=await runInstagramCampaign({campaign:validCampaign(),policy,env:liveEnv,stateStore:createMemoryInstagramStateStore(),mediaHost,api,now}); assert.equal(r.code,"PUBLISHING_QUOTA_REACHED"); assert.deepEqual(calls,["quota"]); }],
  ["non-FINISHED container cannot reach publish", async () => { const {api,calls}=makeApi({async getContainerStatus(){calls.push("status");return {statusCode:"IN_PROGRESS"};}}); const store=createMemoryInstagramStateStore(); const r=await runInstagramCampaign({campaign:validCampaign(),policy,env:liveEnv,stateStore:store,mediaHost,api,now}); assert.equal(r.code,"CONTAINER_NOT_READY"); assert.ok(!calls.includes("publish")); assert.equal((await store.read()).reservations["ig-campaign-1"].status,"container_created"); }],
  ["failed read-back preserves published_unverified state without reposting", async () => { const {api,calls}=makeApi({async verifyMedia(){calls.push("verify");throw new Error("read unavailable");}}); const store=createMemoryInstagramStateStore(); await assert.rejects(()=>runInstagramCampaign({campaign:validCampaign(),policy,env:liveEnv,stateStore:store,mediaHost,api,now})); assert.equal((await store.read()).reservations["ig-campaign-1"].status,"published_unverified"); }],
  ["paid campaign requires verified disclosure text and exact approval", () => { const c=validCampaign(); c.commercial=true; c.disclosureRequired=true; c.disclosure={verified:true,text:"Paid partnership"}; c.caption += " Paid partnership"; c.human_approval.caption_sha256=hash(c.caption); assert.equal(validateInstagramCampaign(c,[],policy,now).ok,true); }],
  ["stale approval is blocked", () => { const c=validCampaign(); c.human_approval.approved_at="2026-01-01T00:00:00.000Z"; assert.ok(validateInstagramCampaign(c,[],policy,now).issues.some(x=>x.code==="HUMAN_APPROVAL_NOT_BOUND")); }],
  ["GitHub durable state store persists state with compare-and-swap", async () => {
    let shaValue = "sha-1";
    let persisted = { version: 1, reservations: {} };
    const fetchImpl = async (url, options = {}) => {
      if (options.method === "PUT") {
        const body = JSON.parse(options.body);
        assert.equal(body.sha, shaValue);
        persisted = JSON.parse(Buffer.from(body.content, "base64").toString("utf8"));
        shaValue = "sha-2";
        return { ok: true, json: async () => ({ content: { sha: shaValue } }) };
      }
      return { ok: true, json: async () => ({ sha: shaValue, content: Buffer.from(JSON.stringify(persisted)).toString("base64") }) };
    };
    const store = createGitHubInstagramStateStore({ token: "test", repository: "owner/repo", branch: "codex/test", fetchImpl });
    const state = await store.read();
    await store.write({ ...state, reservations: { c1: { status: "reserved" } } });
    assert.equal((await store.read()).reservations.c1.status, "reserved");
  }],
  ["GitHub durable state refuses a stale concurrent writer", async () => {
    let shaValue = "sha-1";
    let persisted = { version: 1, reservations: {} };
    let puts = 0;
    const fetchImpl = async (url, options = {}) => {
      if (options.method === "PUT") { puts++; return { ok: true, json: async () => ({ content: { sha: "sha-3" } }) }; }
      return { ok: true, json: async () => ({ sha: shaValue, content: Buffer.from(JSON.stringify(persisted)).toString("base64") }) };
    };
    const store = createGitHubInstagramStateStore({ token: "test", repository: "owner/repo", branch: "codex/test", fetchImpl });
    const state = await store.read();
    shaValue = "sha-2";
    await assert.rejects(() => store.write({ ...state, reservations: { c1: { status: "reserved" } } }), /changed concurrently/);
    assert.equal(puts, 0);
  }],
  ["default branch is rejected for Instagram durable publishing state", () => {
    assert.throws(() => createGitHubInstagramStateStore({ token: "x", repository: "owner/repo", branch: "main" }), /non-default feature branch/);
  }]

  ["required disclosure without exact text is blocked", () => { const campaign=validCampaign(); campaign.commercial=true; campaign.disclosureRequired=true; campaign.disclosure={verified:true}; assert.ok(validateInstagramCampaign(campaign,[],policy,now).issues.some(x=>x.code==="DISCLOSURE_TEXT_MISSING")); }],
  ["link check must match the caption URL", () => { const campaign=validCampaign(); campaign.caption += " https://selar.com/offer"; campaign.link_check={url:"https://selar.com/other",status:200,checked_at:"2026-11-16T11:00:00.000Z",final_url:"https://selar.com/offer"}; campaign.human_approval.caption_sha256=hash(campaign.caption); assert.ok(validateInstagramCampaign(campaign,[],policy,now).issues.some(x=>x.code==="LINK_CHECK_MISMATCH")); }]
];
let failed=0;
for (const [name,fn] of tests) { try { await fn(); console.log("PASS:",name); } catch(e) { failed++; console.error("FAIL:",name,e); } }
if (failed) process.exit(1);
console.log(`Instagram campaign and safety tests: ${tests.length-failed}/${tests.length} passed. All platform API calls were mocked.`);
