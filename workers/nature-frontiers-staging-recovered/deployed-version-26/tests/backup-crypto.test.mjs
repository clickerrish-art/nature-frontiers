import test from "node:test";
import assert from "node:assert/strict";
import {createBackup,verifyBackup} from "../backups.js";

class MockStatement {
 constructor(db,sql){this.db=db;this.sql=sql;this.args=[];}
 bind(...args){this.args=args;return this;}
 async all(){
  if(this.sql.startsWith("SELECT * FROM "))return {results:[]};
  if(this.sql.startsWith("SELECT chunk_index,chunk_text FROM backup_chunks"))return {results:this.db.chunks.filter(x=>x.backup_id===this.args[0]).sort((a,b)=>a.chunk_index-b.chunk_index)};
  return {results:[]};
 }
 async first(){
  if(this.sql.startsWith("SELECT backup_id,created_at,created_by,schema_version,sha256,nonce,ciphertext_bytes,chunk_count,status,reason FROM backup_records")){
   return this.db.records.get(this.args[0])||null;
  }
  return null;
 }
 async run(){
  if(this.sql.startsWith("INSERT INTO backup_records(backup_id")){
   const [backup_id,created_at,created_by,schema_version,sha256,nonce,ciphertext_bytes,chunk_count,status,reason]=this.args;
   this.db.records.set(backup_id,{backup_id,created_at,created_by,schema_version,sha256,nonce,ciphertext_bytes,chunk_count,status,reason});
  }else if(this.sql.startsWith("INSERT INTO backup_chunks")){
   const [backup_id,chunk_index,chunk_text]=this.args;
   this.db.chunks.push({backup_id,chunk_index,chunk_text});
  }else if(this.sql.startsWith("UPDATE backup_records SET status=")){
   const record=this.db.records.get(this.args[0]);
   if(record)record.status=this.sql.includes("status='verified'")?"verified":this.sql.includes("status='stored'")?"stored":"restored";
  }else if(this.sql.startsWith("INSERT INTO backup_records(id,backup_uri")){
   this.db.primaryRecords.push(this.args);
  }
  return {meta:{changes:1}};
 }
}
class MockDb {
 constructor(){this.records=new Map();this.chunks=[];this.primaryRecords=[];}
 prepare(sql){return new MockStatement(this,sql);}
}

test("encrypted backup can be created and independently verified",async()=>{
 const DB=new MockDb(),BACKUP_DB=new MockDb();
 const result=await createBackup({DB,BACKUP_DB,NF_BACKUP_ENCRYPTION_KEY:"test-backup-encryption-key-at-least-32-bytes"},"test-operator");
 assert.equal(result.status,"verified");
 assert.ok(result.sha256);
 assert.equal(BACKUP_DB.records.get(result.backupId).status,"verified");
 assert.equal(BACKUP_DB.chunks.length,result.chunkCount);
 assert.equal(DB.primaryRecords.length,1);
 const verified=await verifyBackup({BACKUP_DB,NF_BACKUP_ENCRYPTION_KEY:"test-backup-encryption-key-at-least-32-bytes"},result.backupId,result.sha256);
 assert.equal(verified.record.backup_id,result.backupId);
 assert.equal(verified.snapshot.schemaVersion,"nature-frontiers-staging-0009");
 assert.ok(Array.isArray(verified.snapshot.tables.content_items));
});

test("tampered encrypted backup chunks fail authentication",async()=>{
 const DB=new MockDb(),BACKUP_DB=new MockDb();
 const result=await createBackup({DB,BACKUP_DB,NF_BACKUP_ENCRYPTION_KEY:"test-backup-encryption-key-at-least-32-bytes"},"test-operator");
 const chunk=BACKUP_DB.chunks[0];
 chunk.chunk_text=(chunk.chunk_text[0]==="A"?"B":"A")+chunk.chunk_text.slice(1);
 await assert.rejects(()=>verifyBackup({BACKUP_DB,NF_BACKUP_ENCRYPTION_KEY:"test-backup-encryption-key-at-least-32-bytes"},result.backupId,result.sha256));
});
