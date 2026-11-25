const TABLES=["campaigns","media_assets","content_items","content_revisions","content_audit_events","media_rights","media_rights_evidence","approvals","approval_receipts","content_targets","meta_connections","schedule_slots","worker_runs","publication_attempts","analytics_snapshots","meta_webhook_events","webhook_delivery_events","audit_events","audit_chain","backup_records","nf_schema_migrations","system_controls"];
const ORDER=TABLES;
const SCHEMA_VERSION="nature-frontiers-staging-0009";
const CHUNK=48000,MAX_PLAINTEXT=8*1024*1024,MAX_ROWS=10000;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
const digest=async bytes=>hex(await crypto.subtle.digest("SHA-256",bytes));
const b64=bytes=>{const data=new Uint8Array(bytes);let binary="";for(let i=0;i<data.length;i+=0x8000)binary+=String.fromCharCode(...data.subarray(i,i+0x8000));return btoa(binary);};
const unb64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function keyFor(secret){const material=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret));return crypto.subtle.importKey("raw",material,{name:"AES-GCM"},false,["encrypt","decrypt"]);}
async function compress(bytes){return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());}
async function decompress(bytes){return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());}
async function readBody(request){const raw=await request.text();if(raw.length>8192)throw fail("Request body too large",413);try{return JSON.parse(raw)}catch{throw fail("Invalid JSON body")}}
function checkConfig(env){if(!env.BACKUP_DB||!env.NF_BACKUP_ENCRYPTION_KEY||String(env.NF_BACKUP_ENCRYPTION_KEY).length<32)throw fail("Encrypted backup storage or encryption key is not configured",503);}
async function createBackup(env,actor,reason="operator"){
 checkConfig(env);
 const tables={};
 for(const name of TABLES){
  const result=await env.DB.prepare("SELECT * FROM "+name+" LIMIT "+(MAX_ROWS+1)).all();
  const rows=result.results||[];
  if(rows.length>MAX_ROWS)throw fail("Backup safety limit exceeded for table "+name,413);
  tables[name]=rows;
 }
 const createdAt=new Date().toISOString(),backupId=crypto.randomUUID();
 const plain=new TextEncoder().encode(JSON.stringify({schemaVersion:SCHEMA_VERSION,createdAt,tables}));
 if(plain.byteLength>MAX_PLAINTEXT)throw fail("Backup exceeds the 8 MiB safety limit; enable external object storage before scaling this dataset",413);
 const sha=await digest(plain),compressed=await compress(plain),nonce=crypto.getRandomValues(new Uint8Array(12)),aad=new TextEncoder().encode(backupId+"|"+SCHEMA_VERSION+"|"+sha);
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce,additionalData:aad},await keyFor(env.NF_BACKUP_ENCRYPTION_KEY),compressed));
 const encoded=b64(cipher),chunks=[];for(let i=0;i<encoded.length;i+=CHUNK)chunks.push(encoded.slice(i,i+CHUNK));
 await env.BACKUP_DB.prepare("INSERT INTO backup_records(backup_id,created_at,created_by,schema_version,sha256,nonce,ciphertext_bytes,chunk_count,status,reason) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(backupId,createdAt,actor,SCHEMA_VERSION,sha,b64(nonce),cipher.byteLength,chunks.length,"writing",reason).run();
 for(let i=0;i<chunks.length;i++)await env.BACKUP_DB.prepare("INSERT INTO backup_chunks(backup_id,chunk_index,chunk_text) VALUES(?,?,?)").bind(backupId,i,chunks[i]).run();
 await env.BACKUP_DB.prepare("UPDATE backup_records SET status='stored' WHERE backup_id=?").bind(backupId).run();
 const record=await verifyBackup(env,backupId,sha);
 if(record.snapshot.schemaVersion!==SCHEMA_VERSION)throw fail("Backup schema version verification failed",409);
 const verifiedAt=new Date().toISOString();
 await env.BACKUP_DB.prepare("UPDATE backup_records SET status='verified' WHERE backup_id=?").bind(backupId).run();
 await env.DB.prepare("INSERT INTO backup_records(id,backup_uri,storage_provider,sha256,byte_length,encryption_key_reference,created_at,verified_at,restore_tested_at,restore_test_sha256) VALUES(?,?,?,?,?,?,?, ?,NULL,NULL)").bind(backupId,"d1://nature-frontiers-staging-backups/"+backupId,"d1-secondary",sha,plain.byteLength,"NF_BACKUP_ENCRYPTION_KEY",createdAt,verifiedAt).run();
 return {backupId,createdAt,sha256:sha,byteLength:plain.byteLength,compressedBytes:compressed.byteLength,chunkCount:chunks.length,status:"verified",reason};
}
async function verifyBackup(env,id,expectedSha){
 const record=await env.BACKUP_DB.prepare("SELECT backup_id,created_at,created_by,schema_version,sha256,nonce,ciphertext_bytes,chunk_count,status,reason FROM backup_records WHERE backup_id=?").bind(id).first();
 if(!record||!["stored","verified","restored"].includes(record.status))throw fail("Backup not found or not complete",404);
 if(expectedSha&&record.sha256!==expectedSha)throw fail("Backup SHA-256 does not match the supplied value",409);
 const q=await env.BACKUP_DB.prepare("SELECT chunk_index,chunk_text FROM backup_chunks WHERE backup_id=? ORDER BY chunk_index").bind(id).all();
 const chunks=q.results||[];if(chunks.length!==record.chunk_count||chunks.some((x,i)=>Number(x.chunk_index)!==i))throw fail("Backup chunk sequence is incomplete",409);
 const encoded=chunks.map(x=>x.chunk_text).join(""),cipher=unb64(encoded);
 if(cipher.byteLength!==Number(record.ciphertext_bytes))throw fail("Backup byte length does not match its manifest",409);
 let compressed;try{compressed=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(record.nonce),additionalData:new TextEncoder().encode(id+"|"+record.schema_version+"|"+record.sha256)},await keyFor(env.NF_BACKUP_ENCRYPTION_KEY),cipher));}catch{throw fail("Backup authentication failed; wrong key or corrupted data",409)}
 const plain=await decompress(compressed);
 if(await digest(plain)!==record.sha256)throw fail("Backup plaintext SHA-256 verification failed",409);
 const snapshot=JSON.parse(new TextDecoder().decode(plain));
 if(snapshot.schemaVersion!==SCHEMA_VERSION)throw fail("Backup schema version is not supported by this Worker",409);
 if(!snapshot.tables||TABLES.some(t=>!Array.isArray(snapshot.tables[t])))throw fail("Backup table manifest is incomplete",409);
 return {record,snapshot,plainBytes:plain.byteLength};
}
async function insertRows(db,table,rows,options={}){
 let inserted=0,skipped=0;const columns=(await db.prepare("PRAGMA table_info("+table+")").all()).results||[];
 const names=columns.map(x=>x.name);
 for(const source of rows){
  const row={...source};
  if(table==="media_assets")row.validation_status="pending";
  if(table==="media_rights_evidence")row.revoked_at=null;
  if(table==="approval_receipts")row.revoked_at=null;
  if(table==="schedule_slots"){row.state=row.state==="published"?"published":row.state==="cancelled"?"cancelled":row.state==="dead_letter"?"dead_letter":"held";row.lease_token_hash=null;row.lease_expires_at=null;row.next_attempt_at=null;row.updated_at=new Date().toISOString();}
  if(table==="meta_connections"){row.status="unverified";row.identity_verified_at=null;row.permissions_verified_at=null;row.instagram_identity_verified_at=null;row.updated_at=new Date().toISOString();}
  if(table==="worker_runs"){row.state="failed";row.finished_at=new Date().toISOString();row.heartbeat_at=new Date().toISOString();row.error_code="restore_recovery";}
  if(table==="system_controls"){row.updated_by=options.actor;row.updated_at=new Date().toISOString();row.version=Number(row.version||0)+1;if(row.key==="dry_run")row.enabled=1;if(row.key==="emergency_stop")row.enabled=1;if(row.key==="publishing_enabled")row.enabled=0;}
  const keys=names.filter(k=>Object.hasOwn(row,k));if(!keys.length){skipped++;continue;}
  const placeholders=keys.map(()=>"?").join(",");
  const sql="INSERT OR IGNORE INTO "+table+"("+keys.join(",")+") VALUES("+placeholders+")";
  let result;
  try{result=await db.prepare(sql).bind(...keys.map(k=>row[k]??null)).run();}
  catch(error){if(table==="media_rights_evidence"||table==="approval_receipts"){skipped++;continue;}throw error;}
  if(Number(result?.meta?.changes||0)===1)inserted++;else skipped++;
  if(table==="media_assets"&&Number(result?.meta?.changes||0)===1&&row.media_sha256)await db.prepare("UPDATE media_assets SET validation_status='passed' WHERE media_sha256=? AND validation_status='pending'").bind(row.media_sha256).run();
 }
 return {inserted,skipped};
}
async function restoreMerge(env,verified,actor){
 const tables=verified.snapshot.tables,counts={},now=new Date().toISOString();
 for(const table of ORDER){counts[table]=await insertRows(env.DB,table,tables[table],{actor});}
 // Recovery always re-enters a fail-closed state; it never revives leases, identity or release authority.
 await env.DB.prepare("UPDATE media_assets SET validation_status='held' WHERE validation_status IN ('pending','passed')").run();
 await env.DB.prepare("UPDATE media_rights_evidence SET revoked_at=? WHERE revoked_at IS NULL").bind(now).run();
 await env.DB.prepare("UPDATE approval_receipts SET revoked_at=? WHERE revoked_at IS NULL").bind(now).run();
 await env.DB.prepare("UPDATE publication_attempts SET state='ambiguous',finished_at=?,error_code='restore_interrupted_unknown_provider_state' WHERE state='reserved'").bind(now).run();
 await env.DB.prepare("UPDATE schedule_slots SET state='dead_letter',lease_token_hash=NULL,lease_expires_at=NULL,next_attempt_at=NULL,last_error_code='restore_provider_state_ambiguous',updated_at=? WHERE state IN ('held','ready','leased','publishing') AND EXISTS(SELECT 1 FROM publication_attempts pa WHERE pa.idempotency_key=schedule_slots.idempotency_key AND pa.state IN ('ambiguous','confirmed'))").bind(now).run();
 await env.DB.prepare("UPDATE schedule_slots SET state='held',lease_token_hash=NULL,lease_expires_at=NULL,next_attempt_at=NULL,last_error_code='restore_recovery',updated_at=? WHERE state IN ('ready','leased','publishing') AND NOT EXISTS(SELECT 1 FROM publication_attempts pa WHERE pa.idempotency_key=schedule_slots.idempotency_key AND pa.state IN ('ambiguous','confirmed'))").bind(now).run();
 await env.DB.prepare("UPDATE worker_runs SET state='abandoned',finished_at=?,heartbeat_at=?,error_code='restore_recovery' WHERE state IN ('started','heartbeat')").bind(now,now).run();
 await env.DB.prepare("UPDATE content_targets SET status='held',platform_media_id=NULL,published_at=NULL WHERE published_at IS NULL").run();
 await env.DB.prepare("UPDATE content_items SET status='needs_review',updated_at=? WHERE status IN ('approved','scheduled') AND NOT EXISTS(SELECT 1 FROM content_targets ct WHERE ct.content_id=content_items.id AND ct.published_at IS NOT NULL)").bind(now).run();
 await env.DB.prepare("UPDATE meta_connections SET status='unverified',identity_verified_at=NULL,permissions_verified_at=NULL,instagram_identity_verified_at=NULL,updated_at=?").bind(now).run();
 await env.DB.prepare("UPDATE system_controls SET enabled=CASE key WHEN 'dry_run' THEN 1 WHEN 'emergency_stop' THEN 1 WHEN 'publishing_enabled' THEN 0 ELSE enabled END,updated_by=?,updated_at=?,version=version+1").bind(actor,now).run();
 await env.DB.prepare("DELETE FROM operator_sessions").run();
 await env.DB.prepare("DELETE FROM login_rate_limits").run();
 await env.DB.prepare("DELETE FROM oauth_states").run();
 const safety=await env.DB.prepare("SELECT (SELECT enabled FROM system_controls WHERE key='dry_run') dry_run,(SELECT enabled FROM system_controls WHERE key='emergency_stop') emergency_stop,(SELECT enabled FROM system_controls WHERE key='publishing_enabled') publishing_enabled,(SELECT COUNT(*) FROM operator_sessions) active_sessions,(SELECT COUNT(*) FROM schedule_slots WHERE state IN ('ready','leased','publishing')) unsafe_schedules,(SELECT COUNT(*) FROM approval_receipts WHERE decision='approved' AND revoked_at IS NULL) active_approvals,(SELECT COUNT(*) FROM media_rights_evidence WHERE revoked_at IS NULL AND rights_status IN ('owned','licensed','public_domain')) active_rights,(SELECT COUNT(*) FROM meta_connections WHERE status='verified' AND identity_verified_at IS NOT NULL) verified_meta,(SELECT COUNT(*) FROM media_assets WHERE validation_status IN ('pending','passed')) unheld_media,(SELECT COUNT(*) FROM content_targets WHERE status='approved' AND published_at IS NULL) unheld_targets,(SELECT COUNT(*) FROM worker_runs WHERE state IN ('started','heartbeat')) active_runs,(SELECT COUNT(*) FROM publication_attempts WHERE state='reserved') reserved_attempts").first();
 if(Number(safety?.dry_run)!==1||Number(safety?.emergency_stop)!==1||Number(safety?.publishing_enabled)!==0||Number(safety?.active_sessions)!==0||Number(safety?.unsafe_schedules)!==0||Number(safety?.active_approvals)!==0||Number(safety?.active_rights)!==0||Number(safety?.verified_meta)!==0||Number(safety?.unheld_media)!==0||Number(safety?.unheld_targets)!==0||Number(safety?.active_runs)!==0||Number(safety?.reserved_attempts)!==0)throw fail("Restore safety verification failed; release gates remain blocked and the pre-restore backup is available",503);
 await env.DB.prepare("INSERT INTO audit_events(id,event_type,content_id,actor,details_json,created_at) VALUES(?,'backup.restore.completed',NULL,?,?,?)").bind(crypto.randomUUID(),actor,JSON.stringify({backupId:verified.record.backup_id,sha256:verified.record.sha256,mode:"merge_restore",failClosed:true}),now).run();
 return {mode:"merge_restore",counts,recoveryVerified:true,releaseGatesReset:true,sessionsRevoked:true,oauthStatesCleared:true};
}
export async function handleBackups(request,env,session){
 const path=new URL(request.url).pathname,method=request.method;
 if(path==="/api/backups"&&method==="GET"){
  checkConfig(env);const q=await env.BACKUP_DB.prepare("SELECT backup_id,created_at,created_by,schema_version,sha256,ciphertext_bytes,chunk_count,status,reason FROM backup_records ORDER BY created_at DESC LIMIT 50").all();
  return json({items:q.results||[],storage:"encrypted-secondary-d1",restoreMode:"merge_restore"});
 }
 if(path==="/api/backups"&&method==="POST"){
  const body=await readBody(request);if(body.confirmation!=="CREATE ENCRYPTED STAGING BACKUP")throw fail("Explicit operator confirmation is required",403);
  return json(await createBackup(env,session.user.id),201);
 }
 if(path==="/api/backups/verify"&&method==="POST"){
  const body=await readBody(request);if(typeof body.backupId!=="string"||typeof body.expectedSha256!=="string")throw fail("backupId and expectedSha256 are required");
  const v=await verifyBackup(env,body.backupId,body.expectedSha256);
  const now=new Date().toISOString();
  await env.DB.prepare("UPDATE backup_records SET verified_at=? WHERE id=?").bind(now,body.backupId).run();
  return json({verified:true,backupId:body.backupId,sha256:v.record.sha256,byteLength:v.plainBytes,schemaVersion:v.snapshot.schemaVersion,tableCounts:Object.fromEntries(TABLES.map(t=>[t,v.snapshot.tables[t].length]))});
 }
 if(path==="/api/backups/restore"&&method==="POST"){
  const body=await readBody(request);
  if(body.confirmation!=="RESTORE STAGING FROM VERIFIED BACKUP")throw fail("Explicit restore confirmation is required",403);
  if(typeof body.backupId!=="string"||typeof body.expectedSha256!=="string")throw fail("backupId and expectedSha256 are required");
  const target=await verifyBackup(env,body.backupId,body.expectedSha256);
  const pre=await createBackup(env,session.user.id,"pre-restore");
  const result=await restoreMerge(env,target,session.user.id);
  const now=new Date().toISOString();
  await env.DB.prepare("UPDATE backup_records SET restore_tested_at=?,restore_test_sha256=? WHERE id=?").bind(now,target.record.sha256,body.backupId).run();
  await env.BACKUP_DB.prepare("UPDATE backup_records SET status='restored' WHERE backup_id=?").bind(body.backupId).run();
  return json({restored:true,backupId:body.backupId,sha256:target.record.sha256,preRestoreBackupId:pre.backupId,...result});
 }
 return null;
}

export {createBackup,verifyBackup,restoreMerge};
