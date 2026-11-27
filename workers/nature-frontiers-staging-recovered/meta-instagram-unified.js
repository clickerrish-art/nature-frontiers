const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const REQUIRED=["instagram_basic","instagram_content_publish"];
const EXPECTED_USERNAME="naturefrontieers2026";
const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
const digest=async value=>hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
function config(env){
 if(!env.NF_META_APP_ID||!env.NF_META_APP_SECRET||!env.NF_META_UNIFIED_LOGIN_CONFIG_ID||!(env.NF_META_UNIFIED_LOGIN_REDIRECT_URI||env.NF_META_REDIRECT_URI)||!env.NF_META_TOKEN_ENCRYPTION_KEY||String(env.NF_META_TOKEN_ENCRYPTION_KEY).length<32)throw fail("Instagram Unified Login is not configured: app ID, app secret, configuration ID, exact HTTPS callback and token-encryption secret are required",503);
 const origin=new URL(env.NF_ALLOWED_ORIGIN),redirect=new URL(env.NF_META_UNIFIED_LOGIN_REDIRECT_URI||env.NF_META_REDIRECT_URI);
 if(redirect.protocol!=="https:"||redirect.origin!==origin.origin||redirect.pathname!=="/api/meta/oauth/callback"||redirect.search||redirect.hash)throw fail("Unified Login callback must be the exact HTTPS staging callback on the configured operator origin",503);
 if(!/^[0-9]{5,30}$/.test(String(env.NF_META_UNIFIED_LOGIN_CONFIG_ID)))throw fail("Unified Login configuration ID is invalid",503);
 return {appId:env.NF_META_APP_ID,appSecret:env.NF_META_APP_SECRET,configId:String(env.NF_META_UNIFIED_LOGIN_CONFIG_ID),redirect:redirect.href,version:env.NF_META_GRAPH_API_VERSION||"v27.0",keySecret:env.NF_META_TOKEN_ENCRYPTION_KEY};
}
async function encryptionKey(secret){const material=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret));return crypto.subtle.importKey("raw",material,{name:"AES-GCM"},false,["encrypt","decrypt"])}
async function encryptToken(token,secret,aad){const nonce=crypto.getRandomValues(new Uint8Array(12)),key=await encryptionKey(secret),ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce,additionalData:new TextEncoder().encode(aad)},key,new TextEncoder().encode(token));return {ciphertext:b64(ciphertext),nonce:b64(nonce)}}
async function decryptToken(ciphertext,nonce,secret,aad){if(!ciphertext||!nonce)throw fail("Encrypted Instagram access token is unavailable; reconnect Instagram",503);try{const key=await encryptionKey(secret),plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(nonce),additionalData:new TextEncoder().encode(aad)},key,unb64(ciphertext));return new TextDecoder().decode(plain)}catch{throw fail("Instagram token decryption failed; reconnect the account after reviewing the encryption key",503)}}
async function metaFetch(url,stage){try{return await fetch(url,{method:"GET",redirect:"manual",signal:AbortSignal.timeout(12000),headers:{Accept:"application/json"}})}catch(error){const reference=crypto.randomUUID();console.error("META_IG_UNIFIED_FAILURE",{reference,stage,category:error?.name==="AbortError"?"timeout":error?.name==="TypeError"?"network_error":"request_error",errorName:String(error?.name||"Error").slice(0,40),causeCode:/^[A-Z0-9_-]{1,40}$/i.test(error?.cause?.code||"")?error.cause.code:null});throw fail("Instagram Unified Login failed during "+stage+"; diagnostic reference "+reference,502)}}
async function metaGet(path,token,version,stage){const url=new URL("https://graph.facebook.com/"+version+"/"+path.replace(/^\/+/, ""));const response=await fetch(url,{method:"GET",redirect:"manual",signal:AbortSignal.timeout(12000),headers:{Authorization:"Bearer "+token,Accept:"application/json"}}).catch(error=>{const reference=crypto.randomUUID();console.error("META_IG_UNIFIED_FAILURE",{reference,stage,category:error?.name==="AbortError"?"timeout":error?.name==="TypeError"?"network_error":"request_error",errorName:String(error?.name||"Error").slice(0,40),causeCode:/^[A-Z0-9_-]{1,40}$/i.test(error?.cause?.code||"")?error.cause.code:null});throw fail("Instagram Unified Login failed during "+stage+"; diagnostic reference "+reference,502)});const data=await response.json().catch(()=>({}));if(!response.ok||data.error)throw fail("Meta rejected the Instagram "+stage+" request (HTTP "+response.status+")",502);return data}
async function parseBody(request){const raw=await request.text();if(raw.length>8192)throw fail("Request body too large",413);try{return JSON.parse(raw)}catch{throw fail("Invalid JSON body")}}
async function audit(db,actor,eventType,details){await db.prepare("INSERT INTO audit_events(id,event_type,content_id,actor,details_json,created_at) VALUES(?,?,NULL,?,?,?)").bind(crypto.randomUUID(),eventType,actor,JSON.stringify(details),new Date().toISOString()).run()}
export async function handleMetaInstagramUnified(request,env,session){
 const path=new URL(request.url).pathname,method=request.method;
 if(path==="/api/meta/instagram/unified/start"&&method==="POST"){
  const cfg=config(env),body=await parseBody(request);if(body.confirmation!=="START INSTAGRAM UNIFIED LOGIN")throw fail("Explicit operator confirmation is required",403);
  const state=hex(crypto.getRandomValues(new Uint8Array(32))),now=new Date(),expires=new Date(now.getTime()+30*60*1000).toISOString();
  await env.DB.prepare("INSERT INTO meta_instagram_unified_states(state_hash,created_at,expires_at,consumed_at,redirect_uri,initiating_subject,config_id) VALUES(?,?,?,NULL,?,?,?)").bind(await digest(state),now.toISOString(),expires,cfg.redirect,session.user.id,cfg.configId).run();
  const url=new URL("https://www.facebook.com/dialog/oauth");url.searchParams.set("client_id",cfg.appId);url.searchParams.set("config_id",cfg.configId);url.searchParams.set("redirect_uri",cfg.redirect);url.searchParams.set("response_type","code");url.searchParams.set("state",state);url.searchParams.set("display","popup");url.searchParams.set("prompt","login");
  return json({authorizationUrl:url.href,stateExpiresAt:expires,configId:cfg.configId,providerMutations:false,publishingEnabled:false,dryRun:true,emergencyStop:true});
 }
 if(path==="/api/meta/oauth/callback"&&method==="GET"){
  const u=new URL(request.url),state=u.searchParams.get("state")||"",code=u.searchParams.get("code")||"";
  if(!/^[a-f0-9]{64}$/i.test(state))return null;
  const stateHash=await digest(state),row=await env.DB.prepare("SELECT state_hash,expires_at,consumed_at,redirect_uri,initiating_subject,config_id FROM meta_instagram_unified_states WHERE state_hash=?").bind(stateHash).first();
  if(!row)return null;
  const cfg=config(env);
  if(!/^[a-f0-9]{64}$/i.test(state)||(!u.searchParams.has("error")&&(!code||code.length>4096)))throw fail("Invalid or missing Unified Login callback state/code",400);
  const now=new Date().toISOString();
  if(!row||row.consumed_at||row.expires_at<=now||row.redirect_uri!==cfg.redirect||row.initiating_subject!==session.user.id||row.config_id!==cfg.configId)throw fail("Unified Login state is invalid, expired, already used, or belongs to another operator/configuration",403);
  const consumed=await env.DB.prepare("UPDATE meta_instagram_unified_states SET consumed_at=? WHERE state_hash=? AND consumed_at IS NULL AND expires_at>?").bind(now,stateHash,now).run();if(Number(consumed?.meta?.changes||0)!==1)throw fail("Unified Login state was already consumed",409);
  if(u.searchParams.has("error"))return Response.redirect(new URL("/?instagram=denied",cfg.redirect).href,303);
  const exchange=new URL("https://graph.facebook.com/"+cfg.version+"/oauth/access_token");exchange.searchParams.set("client_id",cfg.appId);exchange.searchParams.set("client_secret",cfg.appSecret);exchange.searchParams.set("redirect_uri",cfg.redirect);exchange.searchParams.set("code",code);
  const response=await metaFetch(exchange,"authorization_code_exchange");const tokenData=await response.json().catch(()=>({}));if(!response.ok||!tokenData.access_token)throw fail("Meta authorization-code exchange failed (HTTP "+response.status+")",502);
  const token=tokenData.access_token;
  const me=await metaGet("me?fields=client_business_id",token,cfg.version,"client_business_id");
  if(!me.client_business_id)throw fail("Meta did not return the client business portfolio ID",502);
  const assigned=await metaGet("me/assigned_instagram_accounts?fields=id,username",token,cfg.version,"assigned_instagram_accounts");
  const accounts=Array.isArray(assigned.data)?assigned.data:[];
  if(!accounts.length)throw fail("Meta did not return any Instagram professional accounts shared with this configuration",409);
  const expires=Number(tokenData.expires_in)>0?new Date(Date.now()+Number(tokenData.expires_in)*1000).toISOString():null,saved=[];
  for(const account of accounts){
   if(!/^\d{5,30}$/.test(String(account.id||""))||typeof account.username!=="string"||!account.username.trim())continue;
   const accountId=String(account.id),username=account.username.replace(/^@/,"").trim().toLowerCase();
   if(username!==EXPECTED_USERNAME)continue;
   const aad=accountId+":"+String(me.client_business_id)+":"+cfg.configId,sealed=await encryptToken(token,cfg.keySecret,aad);
   await env.DB.prepare("INSERT INTO meta_instagram_unified_connections(id,client_business_id,instagram_account_id,username,config_id,granted_permissions_json,access_token_ciphertext,access_token_nonce,token_expires_at,identity_verified_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,NULL,?,?) ON CONFLICT(instagram_account_id) DO UPDATE SET client_business_id=excluded.client_business_id,username=excluded.username,config_id=excluded.config_id,granted_permissions_json=excluded.granted_permissions_json,access_token_ciphertext=excluded.access_token_ciphertext,access_token_nonce=excluded.access_token_nonce,token_expires_at=excluded.token_expires_at,identity_verified_at=NULL,updated_at=excluded.updated_at").bind(crypto.randomUUID(),String(me.client_business_id),accountId,username,cfg.configId,JSON.stringify(REQUIRED),sealed.ciphertext,sealed.nonce,expires,now,now).run();
   saved.push({instagramAccountId:accountId,username});
  }
  if(!saved.length)throw fail("Meta returned Instagram assets without a valid account ID and username",502);
  await audit(env.DB,session.user.id,"meta.instagram.unified.connected",{clientBusinessId:String(me.client_business_id),configId:cfg.configId,accounts:saved});
  return Response.redirect(new URL("/?instagram=connected",cfg.redirect).href,303);
 }
 if(path==="/api/meta/instagram/unified/connections"&&method==="GET"){
  const rows=await env.DB.prepare("SELECT instagram_account_id,username,config_id,granted_permissions_json,token_expires_at,identity_verified_at,created_at,updated_at FROM meta_instagram_unified_connections ORDER BY updated_at DESC").all();
  return json({items:(rows.results||[]).map(row=>({instagramAccountId:row.instagram_account_id,username:row.username,configId:row.config_id,grantedPermissions:JSON.parse(row.granted_permissions_json||"[]"),identityVerified:Boolean(row.identity_verified_at),tokenExpiresAt:row.token_expires_at,createdAt:row.created_at,updatedAt:row.updated_at})),publishingEnabled:false,dryRun:true,emergencyStop:true});
 }
 if(path.match(/^\/api\/meta\/instagram\/unified\/connections\/(\d{5,30})\/health$/)&&method==="GET"){
  const cfg=config(env),accountId=path.match(/^\/api\/meta\/instagram\/unified\/connections\/(\d{5,30})\/health$/)[1];
  const row=await env.DB.prepare("SELECT * FROM meta_instagram_unified_connections WHERE instagram_account_id=?").bind(accountId).first();
  if(!row)return json({error:"Instagram account connection not found"},404);
  if(row.config_id!==cfg.configId||String(row.username||"").toLowerCase()!==EXPECTED_USERNAME)throw fail("Instagram connection does not match the configured Nature Frontiers account",409);
  const aad=accountId+":"+String(row.client_business_id)+":"+cfg.configId;
  const token=await decryptToken(row.access_token_ciphertext,row.access_token_nonce,cfg.keySecret,aad);
  const appToken=cfg.appId+"|"+cfg.appSecret;
  const debug=await metaGet("debug_token?input_token="+encodeURIComponent(token),appToken,cfg.version,"instagram_token_debug");
  const tokenInfo=debug.data||{},scopes=Array.isArray(tokenInfo.scopes)?tokenInfo.scopes:[];
  const tokenValid=tokenInfo.is_valid===true&&String(tokenInfo.app_id||"")===cfg.appId;
  const profile=await metaGet(accountId+"?fields=id,username",token,cfg.version,"instagram_readonly_profile");
  const profileMatches=String(profile.id)===accountId&&String(profile.username||"").replace(/^@/,"").toLowerCase()===EXPECTED_USERNAME;
  const media=await metaGet(accountId+"/media?fields=id,media_type,timestamp&limit=1",token,cfg.version,"instagram_readonly_media");
  const mediaItems=Array.isArray(media.data)?media.data:[];
  return json({readOnly:true,providerMutations:false,databaseMutations:false,
   instagram:{instagramAccountId:accountId,username:EXPECTED_USERNAME,identityVerified:Boolean(row.identity_verified_at)},
   token:{valid:tokenValid,appIdMatches:String(tokenInfo.app_id||"")===cfg.appId,expiresAt:Number(tokenInfo.expires_at)>0?new Date(Number(tokenInfo.expires_at)*1000).toISOString():null,dataAccessExpiresAt:Number(tokenInfo.data_access_expires_at)>0?new Date(Number(tokenInfo.data_access_expires_at)*1000).toISOString():null},
   permissions:{granted:scopes,required:REQUIRED,allRequiredGranted:REQUIRED.every(scope=>scopes.includes(scope))},
   profile:{accessible:true,matchesExpectedAccount:profileMatches},
   media:{accessible:true,sampleCount:mediaItems.length,latestSample:mediaItems[0]?{id:mediaItems[0].id,mediaType:mediaItems[0].media_type,timestamp:mediaItems[0].timestamp}:null},
   safety:{publishingEnabled:false,dryRun:true,emergencyStop:true}},tokenValid&&profileMatches&&REQUIRED.every(scope=>scopes.includes(scope))?200:409);
 }
 const match=path.match(/^\/api\/meta\/instagram\/unified\/connections\/(\d{5,30})\/verify$/);
 if(match&&method==="POST"){
  const cfg=config(env),body=await parseBody(request),accountId=match[1],expectedUsername=String(body.expectedUsername||"").replace(/^@/,"").trim().toLowerCase();
  if(body.confirmation!=="VERIFY NATURE FRONTIERS INSTAGRAM"||expectedUsername!==EXPECTED_USERNAME)throw fail("Only the explicitly configured Nature Frontiers Instagram username can be verified",403);
  const row=await env.DB.prepare("SELECT * FROM meta_instagram_unified_connections WHERE instagram_account_id=?").bind(accountId).first();if(!row)return json({error:"Instagram account connection not found"},404);
  if(row.config_id!==cfg.configId)throw fail("Instagram connection belongs to a different Unified Login configuration",409);
  const aad=accountId+":"+String(row.client_business_id)+":"+cfg.configId,token=await decryptToken(row.access_token_ciphertext,row.access_token_nonce,cfg.keySecret,aad);
  const profile=await metaGet(accountId+"?fields=id,username",token,cfg.version,"instagram_identity_verification");
  if(String(profile.id)!==accountId||String(profile.username||"").replace(/^@/,"").toLowerCase()!==expectedUsername||expectedUsername!==String(row.username).toLowerCase())throw fail("Instagram account ID or username did not match the explicitly confirmed account",409);
  const verifiedAt=new Date().toISOString();await env.DB.prepare("UPDATE meta_instagram_unified_connections SET username=?,identity_verified_at=?,updated_at=? WHERE instagram_account_id=?").bind(expectedUsername,verifiedAt,verifiedAt,accountId).run();
  await audit(env.DB,session.user.id,"meta.instagram.unified.verified",{instagramAccountId:accountId,username:expectedUsername,configId:cfg.configId});
  return json({instagram:{verified:true,instagramAccountId:accountId,username:expectedUsername},publishingEnabled:false,dryRun:true,emergencyStop:true});
 }
 return null;
}
