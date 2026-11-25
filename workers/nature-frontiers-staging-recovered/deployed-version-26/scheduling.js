const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const zoned=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/;
async function readBody(request){const raw=await request.text();if(raw.length>8192)throw fail("Request body too large",413);try{return JSON.parse(raw)}catch{throw fail("Invalid JSON body")}}
const sha=async value=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,"0")).join("");
export async function handleScheduling(request,env,session){
 const path=new URL(request.url).pathname,method=request.method;
 if(path==="/api/schedules"&&method==="GET"){
  const rows=await env.DB.prepare("SELECT s.id,s.content_id,s.platform,s.scheduled_at,s.timezone,s.state,s.attempt_count,s.max_attempts,s.next_attempt_at,s.last_error_code,s.created_at,s.updated_at,ci.content_type,ci.caption,ci.status AS content_status FROM schedule_slots s JOIN content_items ci ON ci.id=s.content_id ORDER BY s.scheduled_at ASC LIMIT 200").all();
  return json({items:rows.results||[],timezone:"Africa/Johannesburg",dispatchEnabled:false});
 }
 if(path==="/api/schedules"&&method==="POST"){
  const body=await readBody(request);
  if(!uuid.test(body.contentId||""))throw fail("A valid contentId is required");
  if(!["facebook","instagram"].includes(body.platform))throw fail("Platform must be facebook or instagram");
  if(typeof body.scheduledAt!=="string"||!zoned.test(body.scheduledAt)||!Number.isFinite(Date.parse(body.scheduledAt)))throw fail("scheduledAt must be a valid ISO-8601 timestamp with an explicit timezone");
  const at=new Date(body.scheduledAt),now=new Date();
  if(at<=now)throw fail("Schedule time must be in the future");
  if(at.getTime()-now.getTime()>180*86400000)throw fail("Schedule time cannot be more than 180 days ahead");
  const content=await env.DB.prepare("SELECT id,status FROM content_items WHERE id=?").bind(body.contentId).first();
  if(!content)return json({error:"Content not found"},404);
  if(content.status!=="draft"&&content.status!=="needs_review"&&content.status!=="approved")throw fail("Only draft, review or approved content can be placed on the held schedule",409);
  const id=crypto.randomUUID(),createdAt=now.toISOString(),scheduledAt=at.toISOString(),key=await sha(["nf-held-schedule-v1",body.contentId,body.platform,scheduledAt].join(":"));
  try{
   await env.DB.prepare("INSERT INTO schedule_slots(id,content_id,platform,scheduled_at,timezone,state,idempotency_key,attempt_count,max_attempts,created_at,updated_at) VALUES(?,?,?,?,?,'held',?,0,3,?,?)").bind(id,body.contentId,body.platform,scheduledAt,"Africa/Johannesburg",key,createdAt,createdAt).run();
  }catch(error){if(/UNIQUE|constraint/i.test(String(error)))return json({error:"A schedule slot already exists for this content and platform"},409);throw error}
  await env.DB.prepare("INSERT INTO audit_events(id,event_type,content_id,actor,details_json,created_at) VALUES(?,'schedule.held.created',?,?,?,?)").bind(crypto.randomUUID(),body.contentId,session.user.id,JSON.stringify({scheduleId:id,platform:body.platform,scheduledAt,timezone:"Africa/Johannesburg",dispatchEnabled:false}),createdAt).run();
  return json({id,contentId:body.contentId,platform:body.platform,scheduledAt,timezone:"Africa/Johannesburg",state:"held",dispatchEnabled:false,reason:"Publishing remains disabled; no provider request will be made"},201);
 }
 const cancel=path.match(/^\/api\/schedules\/([0-9a-f-]{36})\/cancel$/i);
 if(cancel&&method==="POST"){
  const row=await env.DB.prepare("SELECT id,state FROM schedule_slots WHERE id=?").bind(cancel[1]).first();
  if(!row)return json({error:"Schedule slot not found"},404);
  if(!["held","ready","failed","dead_letter"].includes(row.state))return json({error:"Only unleased held or terminal slots can be cancelled"},409);
  const now=new Date().toISOString();
  const result=await env.DB.prepare("UPDATE schedule_slots SET state='cancelled',updated_at=? WHERE id=? AND state=?").bind(now,row.id,row.state).run();
  if(Number(result?.meta?.changes||0)!==1)return json({error:"Schedule changed concurrently; reload"},409);
  await env.DB.prepare("INSERT INTO audit_events(id,event_type,content_id,actor,details_json,created_at) SELECT ?, 'schedule.cancelled',content_id,?,?,? FROM schedule_slots WHERE id=?").bind(crypto.randomUUID(),session.user.id,JSON.stringify({scheduleId:row.id}),now,row.id).run();
  return json({id:row.id,state:"cancelled",dispatchEnabled:false});
 }
 const preview=path==="/api/schedules/dispatch-preview"&&method==="POST";
 if(preview){
  const rows=await env.DB.prepare("SELECT id,content_id,platform,scheduled_at,state FROM schedule_slots WHERE state IN ('held','ready','failed') AND scheduled_at<=? ORDER BY scheduled_at LIMIT 100").bind(new Date().toISOString()).all();
  const controls=await env.DB.prepare("SELECT key,enabled FROM system_controls WHERE key IN ('emergency_stop','publishing_enabled','dry_run')").all();
  const c=Object.fromEntries((controls.results||[]).map(x=>[x.key,Boolean(x.enabled)]));
  return json({previewOnly:true,dispatchExecuted:false,dispatchEnabled:false,safety:{emergencyStop:c.emergency_stop===true,publishingEnabled:c.publishing_enabled===true,dryRun:c.dry_run===true},due:rows.results||[],blocked:true,blockers:["Provider dispatch is not implemented or authorized","Publishing remains disabled","Emergency stop remains active","Every slot remains held pending exact media, rights, human approval and verified Meta identity"]},409);
 }
 return null;
}
