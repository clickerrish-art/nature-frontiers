import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validatePrepublishCampaign } from "./prepublish-gate.mjs";

const now = new Date("2026-11-13T08:00:00.000Z");
const policy = { banned_phrases: ["guaranteed income"], allowed_link_hosts: ["selar.com"], link_max_age_hours: 24, approval_max_age_days: 30 };
const media = { sha256: "a".repeat(64), rights: { status: "cleared", written_permission_ref: "permission:123", commercial_worldwide: true, editing_allowed: true, social_platforms: ["facebook"] }, originality: { status: "verified", source_ref: "source:123" }, watermark_scan: { status: "clean" }, audio: { present: false }, ai_generated: false };
function validCampaign() {
  const campaign = { id: "c1", educational_story: structuredClone(educationalStory), status: "approved", destination: "facebook:nature-frontiers", caption: "Nature is extraordinary. https://selar.com/example", link_check: { status: 200, checked_at: "2026-11-13T07:00:00.000Z", final_url: "https://selar.com/example" }, media_assets: [structuredClone(media)], disclosure: { paid_promotion: true } };
  campaign.human_approval = { reviewer: "human-reviewer", approved_at: "2026-11-13T07:30:00.000Z", destination: campaign.destination, caption_sha256: createHash("sha256").update(campaign.caption.trim()).digest("hex"), media_sha256: [media.sha256] };
  return campaign;
}
const tests = [\n  ["educational story required", () => { const c=validCampaign(); delete c.educational_story; assert.ok(validatePrepublishCampaign(c,[],policy,now).issues.some(x=>x.code==="EDUCATIONAL_STORY_GATE")); }],\n  ["unsourced educational claim blocked", () => { const c=validCampaign(); c.educational_story.claims[0].sources=[]; assert.ok(validatePrepublishCampaign(c,[],policy,now).issues.some(x=>x.code==="EDUCATIONAL_STORY_GATE")); }],\n  ["image must teach a specific point", () => { const c=validCampaign(); c.educational_story.image_teaching_point=""; assert.ok(validatePrepublishCampaign(c,[],policy,now).issues.some(x=>x.code==="EDUCATIONAL_STORY_GATE")); }],\n  ["non-lion logo blocked", () => { const c=validCampaign(); c.educational_story.brand_logo="elephant"; assert.ok(validatePrepublishCampaign(c,[],policy,now).issues.some(x=>x.code==="EDUCATIONAL_STORY_GATE")); }],
  ["complete evidence passes", () => { assert.equal(validatePrepublishCampaign(validCampaign(), [], policy, now).ok, true); }],
  ["duplicate caption blocked", () => { const c=validCampaign(); assert.ok(validatePrepublishCampaign(c,[{id:"old",caption:c.caption}],policy,now).issues.some(x=>x.code==="DUPLICATE_CAPTION")); }],
  ["banned claims blocked", () => { const c=validCampaign(); c.caption += " guaranteed income"; c.human_approval.caption_sha256=createHash("sha256").update(c.caption.trim()).digest("hex"); assert.ok(validatePrepublishCampaign(c,[],policy,now).issues.some(x=>x.code==="BANNED_CLAIM")); }],
  ["missing link check blocked", () => { const c=validCampaign(); delete c.link_check; assert.ok(validatePrepublishCampaign(c,[],policy,now).issues.some(x=>x.code==="LINK_CHECK_STALE_OR_MISSING")); }],
  ["stale link check blocked", () => { const c=validCampaign(); c.link_check.checked_at="2026-11-10T00:00:00.000Z"; assert.ok(validatePrepublishCampaign(c,[],policy,now).issues.some(x=>x.code==="LINK_CHECK_STALE_OR_MISSING")); }],
  ["unlicensed audio blocked", () => { const c=validCampaign(); c.media_assets[0].audio={present:true,license_status:"unknown"}; assert.ok(validatePrepublishCampaign(c,[],policy,now).issues.some(x=>x.code==="AUDIO_NOT_CLEARED")); }],
  ["missing written rights blocked", () => { const c=validCampaign(); c.media_assets[0].rights.status="pending"; assert.ok(validatePrepublishCampaign(c,[],policy,now).issues.some(x=>x.code==="RIGHTS_NOT_CLEARED")); }],
  ["watermark not clean blocked", () => { const c=validCampaign(); c.media_assets[0].watermark_scan.status="detected"; assert.ok(validatePrepublishCampaign(c,[],policy,now).issues.some(x=>x.code==="WATERMARK_NOT_CLEARED")); }],
  ["AI-generated media is prohibited even with native disclosure", () => { const c=validCampaign(); c.media_assets[0].ai_generated=true; c.media_assets[0].ai_disclosure={required:true,native_control_verified:true}; assert.ok(validatePrepublishCampaign(c,[],policy,now).issues.some(x=>x.code==="AI_GENERATED_MEDIA_PROHIBITED")); }],
  ["AI-generated media without disclosure is also blocked", () => { const c=validCampaign(); c.media_assets[0].ai_generated=true; assert.ok(validatePrepublishCampaign(c,[],policy,now).issues.some(x=>x.code==="AI_GENERATED_MEDIA_PROHIBITED")); }],
  ["undeclared media origin is blocked", () => { const c=validCampaign(); delete c.media_assets[0].ai_generated; assert.ok(validatePrepublishCampaign(c,[],policy,now).issues.some(x=>x.code==="MEDIA_ORIGIN_UNDECLARED")); }],
  ["approval hash mismatch blocked", () => { const c=validCampaign(); c.human_approval.caption_sha256="0".repeat(64); assert.ok(validatePrepublishCampaign(c,[],policy,now).issues.some(x=>x.code==="HUMAN_APPROVAL_NOT_BOUND")); }]
];
let failures=0;
for (const [name,fn] of tests) { try { fn(); console.log("PASS:",name); } catch(e) { failures++; console.error("FAIL:",name,e); } }
if (failures) process.exit(1);
console.log("Pre-publish gate tests: " + (tests.length-failures) + "/" + tests.length + " passed.");
