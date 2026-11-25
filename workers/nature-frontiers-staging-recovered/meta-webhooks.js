const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
const digest=async value=>hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
function equal(a,b){if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
async function verifySignature(secret,raw,header){
 if(!/^sha256=[a-f0-9]{64}$/i.test(header||""))return false;
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
 const signature=Uint8Array.from((header.slice(7).match(/.{2}/g)||[]).map(x=>parseInt(x,16)));
 return crypto.subtle.verify("HMAC",key,signature,new TextEncoder().encode(raw));
}
export async function handleMetaWebhooks(request,env){
 const url=new URL(request.url),path=url.pathname,method=request.method;
 if(path!=="/webhooks/meta")return null;
 if(method==="GET"){
  if(!env.NF_META_WEBHOOK_VERIFY_TOKEN)return json({error:"Meta webhook verification token is not configured"},503);
  const mode=url.searchParams.get("hub.mode")||"",token=url.searchParams.get("hub.verify_token")||"",challenge=url.searchParams.get("hub.challenge")||"";
  if(mode!=="subscribe"||!equal(token,env.NF_META_WEBHOOK_VERIFY_TOKEN)||!challenge||challenge.length>256)return json({error:"Webhook verification rejected"},403);
  return new Response(challenge,{status:200,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
 }
 if(method!=="POST")return json({error:"Method not allowed"},405);
 if(!env.NF_META_APP_SECRET)return json({error:"Meta webhook signature secret is not configured"},503);
 const raw=await request.text();
 if(raw.length>1024*1024)return json({error:"Webhook payload too large"},413);
 const signature=request.headers.get("X-Hub-Signature-256")||"";
 if(!await verifySignature(env.NF_META_APP_SECRET,raw,signature))return json({error:"Webhook signature verification failed"},401);
 let payload;try{payload=JSON.parse(raw)}catch{return json({error:"Invalid webhook JSON"},400)}
 if(!["page","instagram"].includes(payload.object)||!Array.isArray(payload.entry)||payload.entry.length>100)return json({error:"Unsupported Meta webhook payload shape"},400);
 const receivedAt=new Date().toISOString(),payloadSha256=await digest(raw),envelopeId=payloadSha256;
 await env.DB.prepare("INSERT OR IGNORE INTO meta_webhook_events(event_id,received_at,object_type,entry_count) VALUES(?,?,?,?)").bind(envelopeId,receivedAt,payload.object,payload.entry.length).run();
 let processed=0,ignored=0,duplicates=0;
 for(const entry of payload.entry){
  const changes=Array.isArray(entry.changes)?entry.changes:[],messaging=Array.isArray(entry.messaging)?entry.messaging:[];
  const recognized=changes.length>0||messaging.length>0;
  const eventMaterial=JSON.stringify({object:payload.object,id:String(entry.id||""),time:entry.time??null,changes,messaging});
  const eventId=await digest(eventMaterial),state=recognized?"processed":"ignored",now=new Date().toISOString();
  const result=await env.DB.prepare("INSERT OR IGNORE INTO webhook_delivery_events(provider_event_id,provider,signature_verified,received_at,payload_sha256,processing_state,processed_at,error_code) VALUES(?,'meta',1,?,?,?, ?,NULL)").bind(eventId,receivedAt,await digest(eventMaterial),state,now).run();
  if(Number(result?.meta?.changes||0)===0){duplicates++;continue;}
  if(recognized)processed++;else ignored++;
 }
 await env.DB.prepare("INSERT INTO audit_events(id,event_type,content_id,actor,details_json,created_at) VALUES(?,'meta.webhook.received',NULL,'meta',?,?)").bind(crypto.randomUUID(),JSON.stringify({object:payload.object,payloadSha256,entryCount:payload.entry.length,processed,ignored,duplicates}),receivedAt).run();
 return json({received:true,signatureVerified:true,processed,ignored,duplicates,providerMutations:false,publishingEnabled:false});
}
