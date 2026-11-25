import { MigrationRunLifecycle } from "../../scripts/migrations/migration-runner.mjs";
import { rehearsalLockTarget, sha256Hex } from "../../scripts/migrations/d1-lock-adapter.mjs";
import { dispatchOperatorAction, isOperatorAuthorized, operatorHtml, operatorLimits } from "./operator-interface.mjs";

const securityHeaders={
 "cache-control":"no-store, max-age=0",
 "x-content-type-options":"nosniff",
 "referrer-policy":"no-referrer",
 "x-frame-options":"DENY"
};
const json=(value,status=200)=>new Response(JSON.stringify(value),{
 status,headers:{...securityHeaders,"content-type":"application/json; charset=utf-8"}
});
const services=env=>new MigrationRunLifecycle({db:env.DB,target:rehearsalLockTarget});
const now=()=>new Date().toISOString();

export default {
 async fetch(request,env){
  if(!env.DB)return json({error:"HARNESS_NOT_CONFIGURED"},503);
  const url=new URL(request.url);
  if(request.method==="GET"&&url.pathname==="/health"){
   try{
    const runner=services(env);
    const row=await env.DB.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name LIKE 'nf_migration_%'").first();
    return json({ok:true,target:rehearsalLockTarget,controlTables:row?.count??0,capabilities:runner.capabilities});
   }catch(error){return json({error:error.code||"HEALTH_ERROR",message:error.message},500);}
  }
  if(request.method==="GET"&&url.pathname==="/operator"){
   const nonce=crypto.randomUUID().replaceAll("-","");
   const headers={...securityHeaders,"content-type":"text/html; charset=utf-8",
    "content-security-policy":"default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'nonce-"+nonce+"'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"};
   return new Response(operatorHtml(nonce),{headers});
  }
  if(url.pathname!=="/api/operator")return json({error:"NOT_FOUND"},404);
  if(request.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);
  if(!isOperatorAuthorized(request,env.AUTH_TOKEN))return json({error:"UNAUTHORIZED"},401);
  const contentType=request.headers.get("content-type")||"";
  if(!contentType.toLowerCase().startsWith("application/json"))return json({error:"JSON_REQUIRED"},415);
  const declared=Number(request.headers.get("content-length")||0);
  if(declared>operatorLimits.bodyBytes)return json({error:"REQUEST_TOO_LARGE"},413);
  let raw;
  try{raw=await request.text();}catch{return json({error:"INVALID_BODY"},400);}
  if(new TextEncoder().encode(raw).byteLength>operatorLimits.bodyBytes)return json({error:"REQUEST_TOO_LARGE"},413);
  let input;try{input=JSON.parse(raw);}catch{return json({error:"INVALID_JSON"},400);}
  try{return json(await dispatchOperatorAction(services(env),input,{hashOwnerToken:sha256Hex}));}
  catch(error){return json({error:error.code||"OPERATOR_ERROR",message:error.message},400);}
 }
};
