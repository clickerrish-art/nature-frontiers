const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const sha=async value=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,"0")).join("");
const CONTROL_SQL="SELECT key,enabled FROM system_controls WHERE key IN ('emergency_stop','publishing_enabled','dry_run')";
export function runnerPolicy(controls){
 const values=Object.fromEntries((controls||[]).map(x=>[x.key,Number(x.enabled)===1]));
 return {emergencyStop:values.emergency_stop===true,publishingEnabled:values.publishing_enabled===true,dryRun:values.dry_run===true,
  mayRunDryRun:values.emergency_stop===true&&values.publishing_enabled===false&&values.dry_run===true,
  mayPublish:false};
}
export function classifyInterruptedAttempt(attempt){
 if(!attempt)return "safe_to_hold";
 if(attempt.state==="reserved"||attempt.state==="ambiguous"||attempt.state==="confirmed")return "ambiguous_no_retry";
 return "safe_to_hold";
}
async function body(request){const raw=await request.text();if(raw.length>4096)throw fail("Request body too large",413);try{return JSON.parse(raw)}catch{throw fail("Invalid JSON body")}}
async function audit(db,actor,event,details,contentId=null){
 await db.prepare("INSERT INTO audit_events(id,event_type,content_id,actor,details_json,created_at) VALUES(?,?,?,?,?,?)")
  .bind(crypto.randomUUID(),event,contentId,actor,JSON.stringify(details),new Date().toISOString()).run();
}
async function readControls(db){const q=await db.prepare(CONTROL_SQL).all();return runnerPolicy(q.results||[])}
async function sign(secret,value){
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const bytes=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));
 return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
export async function verifySignedApprovalReceipt(raw,secret,expected){
 try{
  const parsed=JSON.parse(raw),signature=parsed.signature;delete parsed.signature;
  const actual=await sign(secret,JSON.stringify(parsed));
  const same=typeof signature==="string"&&signature.length===actual.length&&[...signature].every((ch,i)=>ch.charCodeAt(0)===actual.charCodeAt(i));
  return same&&Object.entries(expected).every(([key,value])=>parsed[key]===value)&&parsed.decision==="approved"&&parsed.policyVersion==="nf-media-release-v1";
 }catch{return false}
}

export async function handleRunner(request,env,session){
 const path=new URL(request.url).pathname,method=request.method,db=env.DB,actor=session.user.id;
 if(path==="/api/runner/status"&&method==="GET"){
  const [controls,queue,runs,attempts]=await Promise.all([
   db.prepare(CONTROL_SQL).all(),
   db.prepare("SELECT state,COUNT(*) AS count FROM schedule_slots GROUP BY state").all(),
   db.prepare("SELECT state,COUNT(*) AS count FROM worker_runs GROUP BY state").all(),
   db.prepare("SELECT state,COUNT(*) AS count FROM publication_attempts GROUP BY state").all()
  ]);
  const safety=runnerPolicy(controls.results||[]);
  return json({runner:"durable-v1",safety,queue:queue.results||[],runs:runs.results||[],publicationAttempts:attempts.results||[],providerDispatch:"HARD_BLOCKED",publishingEnabled:false});
 }
 if(path==="/api/runner/preview"&&method==="POST"){
  const safety=await readControls(db);
  const due=await db.prepare("SELECT s.id,s.content_id,s.platform,s.scheduled_at,s.state,s.attempt_count,s.max_attempts,ci.status AS content_status,ci.media_sha256 FROM schedule_slots s JOIN content_items ci ON ci.id=s.content_id WHERE s.scheduled_at<=? AND s.state IN ('held','ready','failed','dead_letter') ORDER BY s.scheduled_at LIMIT 100")
   .bind(new Date().toISOString()).all();
  return json({previewOnly:true,dispatchExecuted:false,safety,due:due.results||[],blockers:["Provider dispatch is disabled in this build","No job is eligible for execution unless explicitly placed in ready state by the approved release workflow","Every live release requires verified Meta identity, rights evidence and a current signed approval receipt"]});
 }

 if(path==="/api/runner/enqueue"&&method==="POST"){
  const input=await body(request);
  if(typeof input.scheduleId!=="string"||!/^[0-9a-f-]{36}$/i.test(input.scheduleId))throw fail("A valid scheduleId is required");
  const slot=await db.prepare("SELECT id,content_id,platform,state FROM schedule_slots WHERE id=?").bind(input.scheduleId).first();
  if(!slot)return json({error:"Schedule slot not found"},404);
  if(slot.state!=="held")return json({error:"Only held schedule slots can enter the dry-run queue",state:slot.state},409);
  const [content,asset,rights,receipt]=await Promise.all([
   db.prepare("SELECT ci.id,ci.media_sha256,cr.revision,cr.payload_sha256 FROM content_items ci JOIN content_revisions cr ON cr.content_id=ci.id AND cr.revision=(SELECT MAX(revision) FROM content_revisions WHERE content_id=ci.id) WHERE ci.id=?").bind(slot.content_id).first(),
   db.prepare("SELECT validation_status FROM media_assets WHERE media_sha256=(SELECT media_sha256 FROM content_items WHERE id=?)").bind(slot.content_id).first(),
   db.prepare("SELECT id,rights_status,evidence_sha256,permitted_platforms_json,permitted_uses_json,expires_at,revoked_at FROM media_rights_evidence WHERE media_sha256=(SELECT media_sha256 FROM content_items WHERE id=?) ORDER BY created_at DESC LIMIT 20").bind(slot.content_id).all(),
   db.prepare("SELECT id,reviewer_id,payload_sha256,rights_evidence_sha256,signed_receipt,approved_at,expires_at,revoked_at FROM approval_receipts WHERE content_id=? AND platform=? AND decision='approved' ORDER BY created_at DESC LIMIT 20").bind(slot.content_id,slot.platform).all()
  ]);
  if(!content||asset?.validation_status!=="passed")return json({error:"Current media bytes have not passed validation"},409);
  const now=new Date().toISOString();
  const matchingRights=(rights.results||[]).find(x=>x.evidence_sha256&&(x.rights_status==="owned"||x.rights_status==="licensed"||x.rights_status==="public_domain")&&!x.revoked_at&&(!x.expires_at||x.expires_at>now)&&JSON.parse(x.permitted_platforms_json||"[]").includes(slot.platform)&&JSON.parse(x.permitted_uses_json||"[]").includes("social_media"));
  if(!matchingRights)return json({error:"No current rights evidence permits this destination and social-media use"},409);
  const matchingReceipt=(receipt.results||[]).find(x=>x.rights_evidence_sha256===matchingRights.evidence_sha256&&!x.revoked_at&&x.expires_at>now&&x.payload_sha256===content.payload_sha256);
  if(!matchingReceipt)return json({error:"No current approval receipt is bound to the latest content revision and rights evidence"},409);
  const valid=await verifySignedApprovalReceipt(matchingReceipt.signed_receipt,env.NF_SESSION_SECRET,{
   id:matchingReceipt.id,contentId:slot.content_id,platform:slot.platform,decision:"approved",reviewerId:matchingReceipt.reviewer_id,
   revision:Number(content.revision),payloadSha256:content.payload_sha256,mediaSha256:content.media_sha256,
   rightsEvidenceSha256:matchingRights.evidence_sha256,approvedAt:matchingReceipt.approved_at,expiresAt:matchingReceipt.expires_at,policyVersion:"nf-media-release-v1"
  });
  if(!valid)return json({error:"Approval signature or exact content/media binding is invalid"},409);
  const safety=await readControls(db);
  if(!safety.mayRunDryRun)return json({error:"Fail-closed dry-run controls are not active",safety},409);
  const result=await db.prepare("UPDATE schedule_slots SET state='ready',updated_at=? WHERE id=? AND state='held'").bind(now,slot.id).run();
  if(Number(result?.meta?.changes||0)!==1)return json({error:"Schedule changed concurrently; reload"},409);
  await audit(db,actor,"runner.dry_run.enqueued",{scheduleId:slot.id,platform:slot.platform,approvalId:matchingReceipt.id,rightsEvidenceSha256:matchingRights.evidence_sha256,providerDispatch:false},slot.content_id);
  return json({scheduleId:slot.id,state:"ready",mode:"dry_run_only",providerDispatch:false});
 }
 if(path==="/api/runner/claim"&&method==="POST"){
  const input=await body(request);
  if(typeof input.scheduleId!=="string"||!/^[0-9a-f-]{36}$/i.test(input.scheduleId))throw fail("A valid scheduleId is required");
  const safety=await readControls(db);
  if(!safety.mayRunDryRun)return json({error:"Dry-run runner safety controls are not in the required fail-closed state",safety},409);
  const slot=await db.prepare("SELECT id,content_id,platform,scheduled_at,state,attempt_count,max_attempts FROM schedule_slots WHERE id=?").bind(input.scheduleId).first();
  if(!slot)return json({error:"Schedule slot not found"},404);
  if(slot.state!=="ready"||Date.parse(slot.scheduled_at)>Date.now())return json({error:"Only due ready slots can be claimed",state:slot.state},409);
  if(Number(slot.attempt_count)>=Number(slot.max_attempts))return json({error:"Attempt limit reached; manual review required"},409);
  const leaseToken=[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,"0")).join("");
  const leaseHash=await sha(leaseToken),runId=crypto.randomUUID(),workerId="nf-runner:"+runId,now=new Date().toISOString(),expires=new Date(Date.now()+60000).toISOString();
  const results=await db.batch([
   db.prepare("UPDATE schedule_slots SET state='leased',lease_token_hash=?,lease_expires_at=?,attempt_count=attempt_count+1,updated_at=? WHERE id=? AND state='ready' AND scheduled_at<=? AND (lease_expires_at IS NULL OR lease_expires_at<=?)").bind(leaseHash,expires,now,slot.id,now,now),
   db.prepare("INSERT INTO worker_runs(id,schedule_slot_id,worker_id,state,started_at,heartbeat_at) SELECT ?,?,?,'started',?,? WHERE EXISTS(SELECT 1 FROM schedule_slots WHERE id=? AND state='leased' AND lease_token_hash=?)").bind(runId,slot.id,workerId,now,now,slot.id,leaseHash)
  ]);
  if(Number(results?.[0]?.meta?.changes||0)!==1||Number(results?.[1]?.meta?.changes||0)!==1)return json({error:"Atomic lease acquisition lost a race; no work was started"},409);
  await audit(db,actor,"runner.dry_run.lease_acquired",{runId,scheduleId:slot.id,leaseExpiresAt:expires},slot.content_id);
  return json({runId,scheduleId:slot.id,leaseToken,leaseExpiresAt:expires,mode:"dry_run_only",providerDispatch:false},201);
 }
 if(path==="/api/runner/complete"&&method==="POST"){
  const input=await body(request);
  if(typeof input.runId!=="string"||typeof input.scheduleId!=="string"||typeof input.leaseToken!=="string"||input.leaseToken.length!==64)throw fail("runId, scheduleId and leaseToken are required");
  const leaseHash=await sha(input.leaseToken),now=new Date().toISOString();
  const slot=await db.prepare("SELECT id,content_id,state,lease_token_hash,lease_expires_at FROM schedule_slots WHERE id=?").bind(input.scheduleId).first();
  const run=await db.prepare("SELECT id,state FROM worker_runs WHERE id=? AND schedule_slot_id=?").bind(input.runId,input.scheduleId).first();
  if(!slot||!run||run.state!=="started"||slot.state!=="leased"||slot.lease_token_hash!==leaseHash)return json({error:"Lease ownership could not be verified"},409);
  if(Date.parse(slot.lease_expires_at||"")<=Date.now())return json({error:"Lease expired; reconcile before completion"},409);
  const results=await db.batch([
   db.prepare("UPDATE schedule_slots SET state='held',lease_token_hash=NULL,lease_expires_at=NULL,last_error_code='dry_run_completed',updated_at=? WHERE id=? AND state='leased' AND lease_token_hash=? AND lease_expires_at>?").bind(now,slot.id,leaseHash,now),
   db.prepare("UPDATE worker_runs SET state='completed',finished_at=?,heartbeat_at=? WHERE id=? AND state='started'").bind(now,now,run.id)
  ]);
  if(Number(results?.[0]?.meta?.changes||0)!==1||Number(results?.[1]?.meta?.changes||0)!==1)return json({error:"Lease completion lost a concurrent state change"},409);
  await audit(db,actor,"runner.dry_run.completed",{runId:run.id,scheduleId:slot.id,providerDispatch:false},slot.content_id);
  return json({runId:run.id,scheduleId:slot.id,state:"completed",scheduleState:"held",providerDispatch:false});
 }
 if(path==="/api/runner/reconcile"&&method==="POST"){
  const stale=await db.prepare("SELECT id,content_id,state,lease_token_hash FROM schedule_slots WHERE state IN ('leased','publishing') AND lease_expires_at IS NOT NULL AND lease_expires_at<=? ORDER BY lease_expires_at LIMIT 100").bind(new Date().toISOString()).all();
  const outcomes=[];
  for(const slot of stale.results||[]){
   const attempt=await db.prepare("SELECT id,state FROM publication_attempts WHERE idempotency_key=(SELECT idempotency_key FROM schedule_slots WHERE id=?) ORDER BY started_at DESC LIMIT 1").bind(slot.id).first();
   const classification=classifyInterruptedAttempt(attempt),now=new Date().toISOString();
   if(classification==="ambiguous_no_retry"){
    if(attempt?.id)await db.prepare("UPDATE publication_attempts SET state='ambiguous',finished_at=?,error_code='interrupted_unknown_provider_state' WHERE id=? AND state IN ('reserved','confirmed','ambiguous')").bind(now,attempt.id).run();
    await db.prepare("UPDATE schedule_slots SET state='dead_letter',lease_token_hash=NULL,lease_expires_at=NULL,last_error_code='ambiguous_provider_state',updated_at=? WHERE id=? AND state IN ('leased','publishing') AND lease_expires_at<=?").bind(now,slot.id,now).run();
   }else{
    await db.prepare("UPDATE schedule_slots SET state='held',lease_token_hash=NULL,lease_expires_at=NULL,last_error_code='interrupted_before_provider_attempt',updated_at=? WHERE id=? AND state='leased' AND lease_expires_at<=?").bind(now,slot.id,now).run();
   }
   await db.prepare("UPDATE worker_runs SET state='abandoned',finished_at=?,error_code='lease_expired' WHERE schedule_slot_id=? AND state IN ('started','heartbeat')").bind(now,slot.id).run();
   await audit(db,actor,"runner.lease.reconciled",{scheduleId:slot.id,classification,attemptState:attempt?.state||null},slot.content_id);
   outcomes.push({scheduleId:slot.id,classification,automaticRetry:false});
  }
  return json({reconciled:outcomes.length,outcomes,automaticRetry:false,providerDispatch:false});
 }
 return null;
}
