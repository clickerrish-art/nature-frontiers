const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const PAGE_REQUIRED=["pages_show_list","pages_read_engagement","pages_manage_posts"];
const INSTAGRAM_REQUIRED=["instagram_basic","instagram_content_publish"];
const GRAPH_VERSION="v27.0";
const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
const digest=async value=>hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
function config(env){
 if(!env.NF_META_APP_ID||!env.NF_META_APP_SECRET||!env.NF_META_REDIRECT_URI||!env.NF_META_TOKEN_ENCRYPTION_KEY||String(env.NF_META_TOKEN_ENCRYPTION_KEY).length<32)throw fail("Meta OAuth is not configured: app ID, app secret, exact HTTPS redirect URI and 32+ character token-encryption secret are required",503);
 const origin=new URL(env.NF_ALLOWED_ORIGIN),redirect=new URL(env.NF_META_REDIRECT_URI);
 if(redirect.protocol!=="https:"||redirect.origin!==origin.origin||redirect.pathname!=="/api/meta/oauth/callback"||redirect.search||redirect.hash)throw fail("Meta OAuth redirect URI must be the exact HTTPS staging callback on the configured operator origin",503);
 return {appId:env.NF_META_APP_ID,appSecret:env.NF_META_APP_SECRET,redirect:redirect.href,version:env.NF_META_GRAPH_API_VERSION||GRAPH_VERSION,keySecret:env.NF_META_TOKEN_ENCRYPTION_KEY};
}
async function encryptionKey(secret){
 const material=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret));
 return crypto.subtle.importKey("raw",material,{name:"AES-GCM"},false,["encrypt","decrypt"]);
}
async function encryptToken(token,secret,aad){
 const nonce=crypto.getRandomValues(new Uint8Array(12)),key=await encryptionKey(secret);
 const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce,additionalData:new TextEncoder().encode(aad)},key,new TextEncoder().encode(token));
 return {ciphertext:b64(ciphertext),nonce:b64(nonce)};
}
export async function decryptMetaPageToken(ciphertext,nonce,secret,aad){
 if(!ciphertext||!nonce)throw fail("Encrypted Meta token is unavailable; reconnect the Page",503);
 try{const key=await encryptionKey(secret),plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(nonce),additionalData:new TextEncoder().encode(aad)},key,unb64(ciphertext));return new TextDecoder().decode(plain)}catch{throw fail("Meta token decryption failed; rotate the encryption key only after reconnecting affected Pages",503)}
}
export async function metaGraphRead(path,token,version,params={}){
 const url=new URL("https://graph.facebook.com/"+version+"/"+path.replace(/^\/+/, ""));
 for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null)url.searchParams.set(k,String(v));
 const response=await metaFetch(url,{method:"GET",redirect:"manual",headers:{Authorization:"Bearer "+token,Accept:"application/json"}},"graph_api_read");
 const data=await response.json().catch(()=>({}));
 if(!response.ok||data.error)throw safeMetaFailure("graph_api_read",new Error("Meta Graph API read failed"),{status:response.status,error:data.error});
 return data;
}
function safeMetaFailure(stage,error,response=null){
 const provider=response?.error||{};
 const cause=error?.cause||{};
 const reference=crypto.randomUUID();
 const causeCode=typeof cause.code==="string"&&/^[A-Z0-9_-]{1,40}$/i.test(cause.code)?cause.code:null;
 console.error("META_OAUTH_STAGE_FAILURE",{reference,stage,category:error?.name==="AbortError"?"timeout":error?.name==="TypeError"?"network_error":"request_error",errorName:String(error?.name||"Error").slice(0,40),causeCode,httpStatus:response?.status??null,providerErrorCode:Number.isFinite(Number(provider.code))?Number(provider.code):null,providerErrorType:typeof provider.type==="string"?provider.type.slice(0,80):null,providerErrorSubcode:Number.isFinite(Number(provider.error_subcode))?Number(provider.error_subcode):null});
 const failure=fail("Meta OAuth failed during "+stage+"; diagnostic reference "+reference,502);
 failure.safeCategory=error?.name==="AbortError"?"timeout":error?.name==="TypeError"?"network_error":"request_error";
 throw failure;
}
async function metaFetch(url,options,stage){
 try{return await fetch(url,{...options,signal:AbortSignal.timeout(12000)})}
 catch(error){throw safeMetaFailure(stage,error)}
}
async function metaJson(response,stage,requiredField=null){
 const data=await response.json().catch(()=>({}));
 if(!response.ok||(requiredField&&!data?.[requiredField]))throw safeMetaFailure(stage,new Error("Meta returned an unsuccessful response"),{status:response.status,error:data?.error});
 return data;
}
async function parseBody(request){const raw=await request.text();if(raw.length>8192)throw fail("Request body too large",413);try{return JSON.parse(raw)}catch{throw fail("Invalid JSON body")}}
async function audit(db,actor,eventType,details){
 const now=new Date().toISOString();
 await db.prepare("INSERT INTO audit_events(id,event_type,content_id,actor,details_json,created_at) VALUES(?,?,NULL,?,?,?)").bind(crypto.randomUUID(),eventType,actor,JSON.stringify(details),now).run();
}
function safeConnection(row){
 const granted=JSON.parse(row.granted_permissions_json||"[]");
 return {id:row.id,pageId:row.page_id,pageName:row.page_name,instagramAccountId:row.instagram_business_account_id,grantedPermissions:granted,pageTasks:JSON.parse(row.page_tasks_json||"[]"),status:row.status,facebookIdentityVerified:Boolean(row.identity_verified_at),permissionsVerified:Boolean(row.permissions_verified_at),instagramPermissionsVerified:INSTAGRAM_REQUIRED.every(x=>granted.includes(x)),instagramIdentityVerified:Boolean(row.instagram_identity_verified_at),tokenExpiresAt:row.token_expires_at,createdAt:row.created_at,updatedAt:row.updated_at};
}
export async function handleMetaOAuth(request,env,session){
 const path=new URL(request.url).pathname,method=request.method;
 if(path==="/api/meta/oauth/diagnostics"&&method==="GET"){
  const cfg=config(env),reference=crypto.randomUUID();
  const probe=async(label,hostname)=>{
   try{
    const response=await metaFetch(new URL("https://"+hostname+"/"),{method:"GET",redirect:"manual",headers:{Accept:"text/html,application/json"}},"connectivity_probe_"+label);
    let finalHostname=hostname;
    try{if(response.url)finalHostname=new URL(response.url).hostname;}catch{}
    let redirectHostname=null;
    const location=response.headers.get("Location");
    if(location){try{redirectHostname=new URL(location,"https://"+hostname).hostname;}catch{}}
    return {host:hostname,ok:true,httpStatus:response.status,finalHostname,redirectHostname};
   }catch(error){
    const match=String(error?.message||"").match(/diagnostic reference ([a-f0-9-]+)/i);
    return {host:hostname,ok:false,category:error?.safeCategory||"request_error",diagnosticReference:match?.[1]||null};
   }
  };
  const [graph,facebook]=await Promise.all([probe("graph","graph.facebook.com"),probe("www","www.facebook.com")]);
  const allOk=graph.ok&&facebook.ok;
  return json({ok:allOk,stage:allOk?"connectivity_probes_completed":"connectivity_probe_failed",probes:{graph,facebook},diagnosticReference:reference,publishingEnabled:false,dryRun:true,emergencyStop:true},allOk?200:503);
 }
 if(path==="/api/meta/oauth/start"&&method==="POST"){
  const cfg=config(env),body=await parseBody(request);
  if(body.confirmation!=="START META ACCOUNT CONNECTION")throw fail("Explicit operator confirmation is required",403);
  const state=hex(crypto.getRandomValues(new Uint8Array(32))),now=new Date(),expires=new Date(now.getTime()+10*60*1000).toISOString();
  await env.DB.prepare("INSERT INTO oauth_states(state_hash,provider,created_at,expires_at,consumed_at,redirect_uri,initiating_subject) VALUES(?,'meta',?,?,NULL,?,?)").bind(await digest(state),now.toISOString(),expires,cfg.redirect,session.user.id).run();
  const url=new URL("https://www.facebook.com/"+cfg.version+"/dialog/oauth");
  url.searchParams.set("client_id",cfg.appId);url.searchParams.set("redirect_uri",cfg.redirect);url.searchParams.set("state",state);
  const requestInstagram=env.NF_META_INSTAGRAM_API_ENABLED==="true";
  const requestedPermissions=[...PAGE_REQUIRED,...(requestInstagram?INSTAGRAM_REQUIRED:[])];
  url.searchParams.set("response_type","code");url.searchParams.set("scope",requestedPermissions.join(","));
  url.searchParams.set("auth_type","rerequest");
  return json({authorizationUrl:url.href,stateExpiresAt:expires,requestedPermissions,instagramPermissionRequestEnabled:requestInstagram,providerMutations:false,publishingEnabled:false});
 }
 if(path==="/api/meta/oauth/callback"&&method==="GET"){
  const cfg=config(env),u=new URL(request.url),state=u.searchParams.get("state")||"",code=u.searchParams.get("code")||"";
  if(u.searchParams.has("error"))return json({error:"Meta authorization was not completed",providerError:u.searchParams.get("error")},400);
  if(!/^[a-f0-9]{64}$/i.test(state)||!code||code.length>4096)throw fail("Invalid or missing OAuth callback state/code",400);
  const stateHash=await digest(state),row=await env.DB.prepare("SELECT state_hash,expires_at,consumed_at,redirect_uri,initiating_subject FROM oauth_states WHERE state_hash=? AND provider='meta'").bind(stateHash).first();
  const now=new Date().toISOString();
  if(!row||row.consumed_at||row.expires_at<=now||row.redirect_uri!==cfg.redirect||row.initiating_subject!==session.user.id)throw fail("OAuth state is invalid, expired, already used, or belongs to another operator",403);
  const consumed=await env.DB.prepare("UPDATE oauth_states SET consumed_at=? WHERE state_hash=? AND consumed_at IS NULL AND expires_at>?").bind(now,stateHash,now).run();
  if(Number(consumed?.meta?.changes||0)!==1)throw fail("OAuth state was already consumed",409);
  const exchange=new URL("https://graph.facebook.com/"+cfg.version+"/oauth/access_token");
  exchange.searchParams.set("client_id",cfg.appId);exchange.searchParams.set("client_secret",cfg.appSecret);exchange.searchParams.set("redirect_uri",cfg.redirect);exchange.searchParams.set("code",code);
  const shortResponse=await metaFetch(exchange,{method:"GET",redirect:"manual",headers:{Accept:"application/json"}},"authorization_code_exchange");
  const shortToken=await metaJson(shortResponse,"authorization_code_exchange","access_token");
  const longUrl=new URL("https://graph.facebook.com/"+cfg.version+"/oauth/access_token");
  longUrl.searchParams.set("grant_type","fb_exchange_token");longUrl.searchParams.set("client_id",cfg.appId);longUrl.searchParams.set("client_secret",cfg.appSecret);longUrl.searchParams.set("fb_exchange_token",shortToken.access_token);
  const longResponse=await metaFetch(longUrl,{method:"GET",redirect:"manual",headers:{Accept:"application/json"}},"long_lived_token_exchange");
  const longToken=await metaJson(longResponse,"long_lived_token_exchange","access_token");
  const permissions=await metaGraphRead("me/permissions",longToken.access_token,cfg.version);
  const granted=(permissions.data||[]).filter(x=>x.status==="granted").map(x=>x.permission).sort();
  const pageFields=env.NF_META_INSTAGRAM_API_ENABLED==="true"?"id,name,access_token,tasks,instagram_business_account{id,username,account_type}":"id,name,access_token,tasks";
  const pages=await metaGraphRead("me/accounts",longToken.access_token,cfg.version,{fields:pageFields,limit:100});
  const list=pages.data||[];
  if(!list.length)throw fail("Meta returned no Pages for this operator; verify Page access in Meta Business Suite",409);
  const expires=Number(longToken.expires_in)>0?new Date(Date.now()+Number(longToken.expires_in)*1000).toISOString():null;
  const saved=[];
  for(const page of list){
   if(!page.id||!page.access_token)continue;
   const existing=await env.DB.prepare("SELECT id FROM meta_connections WHERE provider='meta' AND page_id=?").bind(String(page.id)).first();
   const id=existing?.id||crypto.randomUUID(),sealed=await encryptToken(page.access_token,cfg.keySecret,id+":"+page.id);
   const tasks=Array.isArray(page.tasks)?page.tasks:[];
   await env.DB.prepare("INSERT INTO meta_connections(id,provider,page_id,page_name,instagram_business_account_id,granted_permissions_json,secret_binding_name,token_expires_at,identity_verified_at,permissions_verified_at,status,created_at,updated_at,access_token_ciphertext,access_token_nonce,token_key_version,instagram_identity_verified_at,page_tasks_json) VALUES(?,'meta',?,?,?,?,?,?,NULL,NULL,'unverified',?,?,?,?,1,NULL,?) ON CONFLICT(provider,page_id) DO UPDATE SET page_name=excluded.page_name,instagram_business_account_id=excluded.instagram_business_account_id,granted_permissions_json=excluded.granted_permissions_json,secret_binding_name=excluded.secret_binding_name,token_expires_at=excluded.token_expires_at,status='unverified',updated_at=excluded.updated_at,access_token_ciphertext=excluded.access_token_ciphertext,access_token_nonce=excluded.access_token_nonce,token_key_version=1,identity_verified_at=NULL,permissions_verified_at=NULL,instagram_identity_verified_at=NULL,page_tasks_json=excluded.page_tasks_json")
    .bind(id,String(page.id),String(page.name||""),page.instagram_business_account?.id?String(page.instagram_business_account.id):null,JSON.stringify(granted),"NF_META_TOKEN_ENCRYPTION_KEY",expires,now,now,sealed.ciphertext,sealed.nonce,JSON.stringify(tasks)).run();
   saved.push({id,pageId:String(page.id),pageName:String(page.name||""),instagramAccountId:page.instagram_business_account?.id?String(page.instagram_business_account.id):null,status:"unverified",pageTasks:tasks});
  }
  if(!saved.length)throw fail("Meta returned Pages without usable Page access tokens",409);
  await audit(env.DB,session.user.id,"meta.oauth.completed",{pages:saved.map(x=>({id:x.id,pageId:x.pageId,instagramAccountId:x.instagramAccountId})),grantedPermissions:granted,missingPermissions:PAGE_REQUIRED.filter(x=>!granted.includes(x)),missingInstagramPermissions:INSTAGRAM_REQUIRED.filter(x=>!granted.includes(x))});
  return Response.redirect(new URL("/?meta=connected",cfg.redirect).href,303);
 }
 if(path==="/api/meta/connections"&&method==="GET"){
  const rows=await env.DB.prepare("SELECT id,page_id,page_name,instagram_business_account_id,granted_permissions_json,page_tasks_json,status,identity_verified_at,permissions_verified_at,instagram_identity_verified_at,token_expires_at,created_at,updated_at FROM meta_connections WHERE provider='meta' ORDER BY updated_at DESC").all();
  return json({items:(rows.results||[]).map(safeConnection),publishingEnabled:false});
 }
 const match=path.match(/^\/api\/meta\/connections\/([a-f0-9-]{36})\/verify$/i);
 if(match&&method==="POST"){
  const cfg=config(env),body=await parseBody(request);
  const row=await env.DB.prepare("SELECT * FROM meta_connections WHERE id=? AND provider='meta'").bind(match[1]).first();
  if(!row)return json({error:"Meta connection not found"},404);
  if(body.confirmation!=="VERIFY NATURE FRONTIERS PAGE"||String(body.expectedPageId||"")!==String(row.page_id))throw fail("Confirm the exact Page ID displayed in the operator console before verification",403);
  const token=await decryptMetaPageToken(row.access_token_ciphertext,row.access_token_nonce,cfg.keySecret,row.id+":"+row.page_id);
  const page=await metaGraphRead(row.page_id,token,cfg.version,{fields:"id,name,instagram_business_account{id,username,account_type}"});
  if(String(page.id)!==String(row.page_id))throw fail("Meta Page identity did not match the stored Page ID",409);
  const tasks=JSON.parse(row.page_tasks_json||"[]");
  if(!tasks.includes("CREATE_CONTENT")&&!tasks.includes("MANAGE"))throw fail("The selected Page token lacks CREATE_CONTENT or MANAGE task access",403);
  const permissions=JSON.parse(row.granted_permissions_json||"[]"),missing=PAGE_REQUIRED.filter(x=>!permissions.includes(x));
  if(missing.length)throw fail("Required Facebook Page permissions are not granted: "+missing.join(", "),409);
  const missingInstagramPermissions=INSTAGRAM_REQUIRED.filter(x=>!permissions.includes(x));
  let instagramId=null,instagramVerifiedAt=null,instagramProfile=null;
  const ig=page.instagram_business_account;
  if(ig?.id&&missingInstagramPermissions.length===0){
   const profile=await metaGraphRead(String(ig.id),token,cfg.version,{fields:"id,username,account_type"});
   if(String(profile.id)!==String(ig.id)||!["BUSINESS","CREATOR"].includes(String(profile.account_type||"").toUpperCase()))throw fail("Linked Instagram identity is not a verified Business or Creator account",409);
   instagramId=String(profile.id);instagramVerifiedAt=new Date().toISOString();instagramProfile={id:instagramId,username:profile.username||null,accountType:profile.account_type};
  } else if(ig?.id) {
   instagramId=String(ig.id);
   instagramProfile={id:instagramId,username:ig.username||null,accountType:ig.account_type||null};
  }
  const verifiedAt=new Date().toISOString();
  await env.DB.prepare("UPDATE meta_connections SET page_name=?,instagram_business_account_id=?,status='verified',identity_verified_at=?,permissions_verified_at=?,instagram_identity_verified_at=?,updated_at=? WHERE id=? AND page_id=?").bind(String(page.name||row.page_name||""),instagramId,verifiedAt,verifiedAt,instagramVerifiedAt,verifiedAt,row.id,row.page_id).run();
  await audit(env.DB,session.user.id,"meta.identity.verified",{connectionId:row.id,pageId:row.page_id,pageName:page.name||null,instagram:instagramProfile,permissions,missingInstagramPermissions});
  return json({facebook:{verified:true,pageId:row.page_id,pageName:page.name||null},instagram:{verified:Boolean(instagramVerifiedAt),account:instagramProfile,missingPermissions:missingInstagramPermissions},permissionsVerified:true,instagramPermissionsVerified:missingInstagramPermissions.length===0&&Boolean(instagramVerifiedAt),publishingEnabled:false,dryRun:true,emergencyStop:true});
 }
 return null;
}
