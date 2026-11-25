import { decryptMetaPageToken, metaGraphRead } from "./meta-oauth.js";
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export async function handleAnalytics(request,env,session){
 const path=new URL(request.url).pathname,method=request.method;
 if(path==="/api/analytics"&&method==="GET"){
  const rows=await env.DB.prepare("SELECT a.id,a.content_id,a.platform,a.collected_at,a.source_api_version,a.metrics_json,ci.caption,ci.content_type FROM analytics_snapshots a JOIN content_items ci ON ci.id=a.content_id ORDER BY a.collected_at DESC LIMIT 300").all();
  return json({items:rows.results||[],readOnly:true});
 }
 if(path==="/api/analytics/collect"&&method==="POST"){
  if(!env.NF_META_TOKEN_ENCRYPTION_KEY)return json({error:"Meta token encryption is not configured"},503);
  const version=env.NF_META_GRAPH_API_VERSION||"v27.0",now=new Date().toISOString();
  const rows=await env.DB.prepare("SELECT ct.content_id,ct.platform,ct.account_id,ct.platform_media_id,ct.published_at,mc.id connection_id,mc.page_id,mc.access_token_ciphertext,mc.access_token_nonce,ci.caption FROM content_targets ct JOIN content_items ci ON ci.id=ct.content_id JOIN meta_connections mc ON mc.provider='meta' AND mc.status='verified' AND ((ct.platform='facebook' AND mc.page_id=ct.account_id AND mc.identity_verified_at IS NOT NULL AND mc.permissions_verified_at IS NOT NULL) OR (ct.platform='instagram' AND mc.instagram_business_account_id=ct.account_id AND mc.instagram_identity_verified_at IS NOT NULL)) WHERE ct.status='published' AND ct.platform_media_id IS NOT NULL ORDER BY ct.published_at DESC LIMIT 100").all();
  let collected=0;const errors=[];
  for(const row of rows.results||[]){
   try{
    const token=await decryptMetaPageToken(row.access_token_ciphertext,row.access_token_nonce,env.NF_META_TOKEN_ENCRYPTION_KEY,row.connection_id+":"+row.page_id);
    let metrics;
    if(row.platform==="facebook"){
     const data=await metaGraphRead(String(row.platform_media_id),token,version,{fields:"id,created_time,shares,comments.summary(true),reactions.summary(true)"});
     metrics={remoteId:String(data.id),createdAt:data.created_time||row.published_at||null,shares:Number(data.shares?.count||0),comments:Number(data.comments?.summary?.total_count||0),reactions:Number(data.reactions?.summary?.total_count||0)};
    }else if(row.platform==="instagram"){
     const data=await metaGraphRead(String(row.platform_media_id),token,version,{fields:"id,like_count,comments_count,media_type,timestamp,permalink"});
     metrics={remoteId:String(data.id),createdAt:data.timestamp||row.published_at||null,likes:Number(data.like_count||0),comments:Number(data.comments_count||0),mediaType:data.media_type||null,permalink:data.permalink||null};
    }else continue;
    const id=crypto.randomUUID(),collectedAt=new Date().toISOString();
    await env.DB.prepare("INSERT INTO analytics_snapshots(id,content_id,platform,collected_at,source_api_version,metrics_json) VALUES(?,?,?,?,?,?)").bind(id,row.content_id,row.platform,collectedAt,version,JSON.stringify(metrics)).run();
    collected++;
   }catch(error){errors.push({contentId:row.content_id,platform:row.platform,error:error?.message||"Analytics fetch failed"});}
  }
  await env.DB.prepare("INSERT INTO audit_events(id,event_type,content_id,actor,details_json,created_at) VALUES(?,'analytics.collection.completed',NULL,?,?,?)").bind(crypto.randomUUID(),session.user.id,JSON.stringify({collected,failed:errors.length,sourceApiVersion:version,providerMutations:false}),now).run();
  return json({collected,failed:errors.length,errors,readOnly:true,providerMutations:false,publishingEnabled:false});
 }
 return null;
}
