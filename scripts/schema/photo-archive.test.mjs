import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {replay} from './contract.mjs';
import {ARCHIVE_BUCKET,archiveStorage,recoveryReceipt,resumeArchive,prepareArchiveRetirement,retireArchiveSource} from '../storage/photo-archive.mjs';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=uid(1),entry=uid(2),id=uid(3),objectId=uid(4),path=`${owner}/${entry}/label/é.jpg`;
const bytes=Buffer.from('preserved historical image'),sha=createHash('sha256').update(bytes).digest('hex');
const receipt={backup_id:objectId,size:bytes.length,sha256:sha,inventory_sha256:'a'.repeat(64),backup_index_sha256:'b'.repeat(64)};
async function fixture(){
 const db=await replay();
 const value=async(sql,args)=>(await db.query(sql,args)).rows[0].v;
 const api={
  get:async id=>value('select to_jsonb(o) v from private.photo_archive_operations o where id=$1',[id]),
  plan:async(id,p=path,r=receipt)=>value('select private.plan_photo_archive($1,$2,$3) v',[id,p,r]),
  snapshot:async(p,d)=>value('select private.photo_archive_snapshot($1,$2) v',[p,d]),
  commit:async(id,p)=>value('select private.commit_photo_archive($1,$2) v',[id,p]),
  prepareRetirement:async id=>value('select private.prepare_photo_archive_retirement($1) v',[id]),
  beginDeletion:async id=>value('select private.begin_photo_archive_deletion($1) v',[id]),
  confirmDeletion:async id=>value('select private.confirm_photo_archive_deletion($1) v',[id]),
  recordEvidence:async(id,evidence)=>value('select private.record_photo_archive_revocation_evidence($1,$2) v',[id,evidence]),
 };
 await db.query('insert into auth.users(id,email) values($1,$2)',[owner,'archive@example.invalid']);
 await db.query('insert into wine_entries(id,user_id) values($1,$2)',[entry,owner]);
 await db.exec("insert into storage.buckets(id,name) values('wine-photos','wine-photos')");
 await db.query("insert into storage.objects(id,bucket_id,name,metadata) values($1,'wine-photos',$2,$3)",[objectId,path,{size:bytes.length,mimetype:'image/jpeg'}]);
 const blobs=new Map([['wine-photos/'+path,{bytes,mimetype:'image/jpeg'}]]);let copies=0;
 const storage={read:async(b,p)=>blobs.get(b+'/'+p),copy:async(s,d)=>{
  copies++;const source=blobs.get('wine-photos/'+s);
  await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[ARCHIVE_BUCKET,d,{size:source.bytes.length,mimetype:source.mimetype}]);
  blobs.set(ARCHIVE_BUCKET+'/'+d,source);
 },remove:async p=>{await db.query("select set_config('storage.allow_delete_query','true',false)");
  await db.query("delete from storage.objects where bucket_id='wine-photos' and name=$1",[p]);blobs.delete('wine-photos/'+p);}};
 return {db,api,storage,blobs,copies:()=>copies};
}
test('archival preserves source, verifies historical bytes, resumes lost copy/commit and rechecks copied operations',async()=>{
 const f=await fixture();try{
  const op=await f.api.plan(id);assert.deepEqual(await f.api.plan(id),op);
  await assert.rejects(f.api.plan(id,path,{...receipt,sha256:'c'.repeat(64)}),/identity mismatch/);
  await assert.rejects(f.api.plan(uid(9)),/duplicate key/);
  await assert.rejects(resumeArchive(f.api,{...f.storage,copy:async(s,d)=>{await f.storage.copy(s,d);throw Error('lost copy response');}},id),/lost copy/);
  assert.equal((await f.api.get(id)).state,'planned');
  await assert.rejects(resumeArchive({...f.api,commit:async(i,p)=>{await f.api.commit(i,p);throw Error('lost commit response');}},f.storage,id),/lost commit/);
  const done=await resumeArchive(f.api,f.storage,id);assert.equal(done.state,'copied');assert.equal(f.copies(),1);
  assert.equal(done.proof.sha256,sha);assert(done.verified_at);assert.deepEqual((await f.api.snapshot(path,done.archive_path)).source,op.expected);
  assert.equal((await f.db.query('select count(*)::int n from private.photo_retired_paths')).rows[0].n,0);
  await assert.rejects(f.db.query('select private.abandon_photo_archive($1)',[id]),/remain durable/);
  f.blobs.set(ARCHIVE_BUCKET+'/'+done.archive_path,{bytes:Buffer.from('corrupt'),mimetype:'image/jpeg'});
  await assert.rejects(resumeArchive(f.api,f.storage,id),/hash, size or type mismatch/);assert.equal(f.copies(),1);
 }finally{await f.db.close();}
});
test('archive retirement fences one source, confirms exact deletion and requires two-region CDN denial',async()=>{
 const f=await fixture();try{
  const planned=await f.api.plan(id);await f.storage.copy(path,planned.archive_path);
  await f.api.commit(id,{object:(await f.api.snapshot(path,planned.archive_path)).archive,sha256:sha,size:bytes.length,mimetype:'image/jpeg'});
  await assert.rejects(f.db.query('update private.photo_archive_operations set deleted_at=now() where id=$1',[id]),/photo_archive_deleted_timestamp/);
  await assert.rejects(f.db.query("update private.photo_archive_operations set retirement_evidence='[]' where id=$1",[id]),/photo_archive_evidence_state/);
  await assert.rejects(prepareArchiveRetirement(f.api,f.storage,id),/Legacy signing cutoff required/);
  await f.db.query('select private.activate_photo_cutoff()');
  const fenced=await prepareArchiveRetirement(f.api,f.storage,id);assert.equal(fenced.retirement_phase,'fenced');
  const retired=(await f.db.query('select operation_id,archive_operation_id from private.photo_retired_paths where path=$1',[path])).rows[0];
  assert.equal(retired.operation_id,null);assert.equal(retired.archive_operation_id,id);
  await assert.rejects(f.db.query('update profiles set avatar_path=$1 where id=$2',[path,owner]),/Photo moved/);
  const deleted=await retireArchiveSource(f.api,f.storage,id);assert.equal(deleted.retirement_phase,'deleted_pending_cdn');assert(deleted.deleted_at);
  assert.equal((await f.api.snapshot(path,planned.archive_path)).archive.id,planned.proof?.object?.id??deleted.proof.object.id);
  const warmed=new Date(Date.parse(deleted.deleted_at)-1000).toISOString(),observed=deleted.deleted_at;
  const observation=(region,surface)=>({region,path,surface,status:404,observed_at:observed,
   capability_sha256:'c'.repeat(64),source_sha256:sha,warm_sha256:'d'.repeat(64),warmed_at:warmed,warm_status:200});
  await assert.rejects(f.api.recordEvidence(id,[observation('us-east','raw'),observation('us-east','transformed')]),/Two independently/);
  const verified=await f.api.recordEvidence(id,['us-east','eu-west'].flatMap(region=>['raw','transformed'].map(surface=>observation(region,surface))));
  assert.equal(verified.retirement_phase,'verified');
 }finally{await f.db.close();}
});
test('separately preserved base and original siblings can retire sequentially without weakening missing-object checks',async()=>{
 const f=await fixture();try{
  const original=path.replace('.jpg','__original.jpg'),originalId=uid(5),originalOp=uid(6);
  await f.db.query("insert into storage.objects(id,bucket_id,name,metadata) values($1,'wine-photos',$2,$3)",[originalId,original,{size:bytes.length,mimetype:'image/jpeg'}]);
  f.blobs.set('wine-photos/'+original,{bytes,mimetype:'image/jpeg'});
  const basePlan=await f.api.plan(id),originalPlan=await f.api.plan(originalOp,original,{...receipt,backup_id:originalId});
  for(const [operation,source] of [[basePlan,path],[originalPlan,original]]){
   await f.storage.copy(source,operation.archive_path);
   await f.api.commit(operation.id,{object:(await f.api.snapshot(source,operation.archive_path)).archive,sha256:sha,size:bytes.length,mimetype:'image/jpeg'});
  }
  await f.db.query('select private.activate_photo_cutoff()');
  await f.db.exec('begin');await f.db.query("select set_config('storage.allow_delete_query','true',false)");
  await f.db.query("delete from storage.objects where bucket_id='wine-photos' and name=$1",[path]);
  await assert.rejects(prepareArchiveRetirement(f.api,f.storage,originalOp),/Historical source changed/);await f.db.exec('rollback');
  await prepareArchiveRetirement(f.api,f.storage,id);await retireArchiveSource(f.api,f.storage,id);
  assert.equal((await prepareArchiveRetirement(f.api,f.storage,originalOp)).retirement_phase,'fenced');
  assert.equal((await retireArchiveSource(f.api,f.storage,originalOp)).retirement_phase,'deleted_pending_cdn');
  assert.equal((await f.db.query("select count(*)::int n from storage.objects where bucket_id='wine-photos' and name=any($1)",[[path,original]])).rows[0].n,0);
 }finally{await f.db.close();}
});
test('archive planning holds referenced cohorts, missing-base originals, changed historical identities and malformed receipts',async()=>{
 const f=await fixture();try{
  for(const r of [null,{}, {...receipt,backup_id:uid(8)},{...receipt,size:receipt.size+1},{...receipt,sha256:'bad'}])await assert.rejects(f.api.plan(id,path,r));
  for(const p of ['../bad','/absolute','owner//bad','owner/../bad','owner/\\bad',''])await assert.rejects(f.api.plan(id,p),/Invalid archive source/);
  await f.db.query('update wine_entries set label_image_path=$1 where id=$2',[path,entry]);
  await assert.rejects(f.api.plan(id),/Referenced cohort/);
  const original=path.replace('.jpg','__original.jpg');
  await f.db.query("update storage.objects set name=$1 where id=$2",[original,objectId]);
  await assert.rejects(f.api.plan(id,original),/Referenced cohort/);
  await f.db.query('update wine_entries set label_image_path=null where id=$1',[entry]);
  const held=await f.api.plan(id,original);assert.equal(held.state,'planned');
  await f.db.query('select private.abandon_photo_archive($1)',[id]);
  await assert.rejects(resumeArchive(f.api,f.storage,id),/not resumable/);
  assert.equal((await f.api.plan(uid(9),original)).state,'planned');
 }finally{await f.db.close();}
});
test('archive commit rejects late references, object replacement, changed proof and public bucket',async()=>{
 const f=await fixture();try{
  const op=await f.api.plan(id);await f.storage.copy(path,op.archive_path);
  const object=(await f.api.snapshot(path,op.archive_path)).archive;
  const proof={object,sha256:sha,size:bytes.length,mimetype:'image/jpeg'};
  await f.db.exec('begin isolation level repeatable read');
  await assert.rejects(f.api.commit(id,proof),/requires READ COMMITTED/);
  await f.db.exec('rollback');
  for(const p of [null,{}, {...proof,sha256:'c'.repeat(64)},{...proof,size:1},{...proof,mimetype:'text/html'}])await assert.rejects(f.api.commit(id,p),/proof or destination changed/);
  await f.db.query('update profiles set avatar_path=$1 where id=$2',[path,owner]);
  await assert.rejects(f.api.commit(id,proof),/source changed/);
  await f.db.query('update profiles set avatar_path=null where id=$1',[owner]);
  await f.db.query('update storage.objects set version=$1 where id=$2',['replacement',objectId]);
  await assert.rejects(f.api.commit(id,proof),/source changed/);
  const originalObject=op.expected.objects.find(o=>o.path===path).object;
  // The managed Storage trigger changes updated_at as well as version. Start a
  // fresh operation for the independent bucket-protection assertion.
  await f.db.query('select private.abandon_photo_archive($1)',[id]);
  await f.db.query('update storage.objects set version=$1 where id=$2',[originalObject.version,objectId]);
  const next=await f.api.plan(uid(10));await f.storage.copy(path,next.archive_path);
  const nextProof={...proof,object:(await f.api.snapshot(path,next.archive_path)).archive};
  await f.db.query('update storage.buckets set public=true where id=$1',[ARCHIVE_BUCKET]);
  await assert.rejects(f.api.commit(uid(10),nextProof),/proof or destination changed/);
  await assert.rejects(resumeArchive(f.api,f.storage,uid(10)),/protection changed/);
  assert.equal((await f.api.get(uid(10))).state,'planned');
 }finally{await f.db.close();}
});
test('private ledger/functions and restrictive archive policies deny every client operation even with permissive policies',async()=>{
 const f=await fixture();try{
  const op=await f.api.plan(id);await f.storage.copy(path,op.archive_path);
  await f.db.exec(`create policy archive_test_broad_objects on storage.objects for all to anon,authenticated using(true) with check(true);
   create policy archive_test_broad_buckets on storage.buckets for all to anon,authenticated using(true) with check(true);
   grant select,insert,update,delete on storage.objects,storage.buckets to anon,authenticated;`);
  for(const role of ['anon','authenticated','service_role']){
   const grants=(await f.db.query("select has_table_privilege($1,'private.photo_archive_operations','select') allowed",[role])).rows[0];assert.equal(grants.allowed,false);
   for(const name of ['private.plan_photo_archive(uuid,text,jsonb)','private.commit_photo_archive(uuid,jsonb)','private.photo_archive_snapshot(text,text)','private.abandon_photo_archive(uuid)',
    'private.prepare_photo_archive_retirement(uuid)','private.begin_photo_archive_deletion(uuid)','private.confirm_photo_archive_deletion(uuid)','private.record_photo_archive_revocation_evidence(uuid,jsonb)'])
    assert.equal((await f.db.query('select has_function_privilege($1,$2,\'execute\') allowed',[role,name])).rows[0].allowed,false);
   assert.equal((await f.db.query("select has_function_privilege($1,'private.photo_archive_source_snapshot_valid(jsonb,jsonb,text,boolean)','execute') allowed",[role])).rows[0].allowed,false);
  }
  for(const role of ['anon','authenticated']){
   await f.db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await f.db.exec(`set role ${role}`);
   for(const operation of ['object.sign','object.sign_many','render.image_sign','object.get_authenticated','render.image_authenticated','object.copy','object.list','object.upload','object.delete']){
    await f.db.query("select set_config('storage.operation',$1,false)",[operation]);
    assert.equal((await f.db.query('select count(*)::int n from storage.objects where bucket_id=$1',[ARCHIVE_BUCKET])).rows[0].n,0);
   }
   assert.equal((await f.db.query('select count(*)::int n from storage.buckets where id=$1',[ARCHIVE_BUCKET])).rows[0].n,0);
   await assert.rejects(f.db.query('insert into storage.objects(bucket_id,name) values($1,$2)',[ARCHIVE_BUCKET,'new']),/row-level security/);
   assert.equal((await f.db.query('update storage.objects set name=\'exposed\' where bucket_id=$1 returning id',[ARCHIVE_BUCKET])).rows.length,0);
   assert.equal((await f.db.query('update storage.buckets set public=true where id=$1 returning id',[ARCHIVE_BUCKET])).rows.length,0);
   await f.db.query("select set_config('storage.allow_delete_query','true',false)");
   assert.equal((await f.db.query('delete from storage.objects where bucket_id=$1 returning id',[ARCHIVE_BUCKET])).rows.length,0);
   await f.db.exec('reset role');
  }
  assert.equal((await f.db.query('select public from storage.buckets where id=$1',[ARCHIVE_BUCKET])).rows[0].public,false);
  assert.equal((await f.db.query('select count(*)::int n from storage.objects where bucket_id=$1',[ARCHIVE_BUCKET])).rows[0].n,1);
  const migration=await readFile(new URL('../../supabase/sql/20260922063629_protected_photo_archive.sql',import.meta.url),'utf8');
  // Installation must not silently rely on policies when hosted RLS drifted off,
  // or adopt a pre-existing bucket whose capabilities/provenance are unknown.
  await f.db.exec('alter table storage.objects disable row level security');
  await assert.rejects(f.db.exec(migration),/Storage RLS must be enabled/);await f.db.exec('rollback');
  await f.db.exec('alter table storage.objects enable row level security');
  await assert.rejects(f.db.exec(migration),/duplicate key/);await f.db.exec('rollback');
 }finally{await f.db.close();}
});
test('recovery receipt binds one eligible historical object to unchanged recovery bytes and index',async()=>{
 const backup=[{id:objectId,name:path,bytes:bytes.length,sha256:sha}];
 const row={path,classification:'unreferenced-archive-review',references:[],baseReferences:[],backupId:objectId,objectId,bytes:bytes.length,sha256:sha};
 const report={version:1,retirementAuthorized:false,retained:[row],inventorySha256:'a'.repeat(64),backupIndexSha256:createHash('sha256').update(JSON.stringify(backup)).digest('hex')};
 assert.equal((await recoveryReceipt(report,backup,path,async()=>bytes)).sha256,sha);
 await assert.rejects(recoveryReceipt(report,backup,path,async()=>Buffer.from('wrong')),/Recovery bytes changed/);
 for(const classification of ['referenced-review','missing-base-recovery-review','changed-object-review'])
  await assert.rejects(recoveryReceipt({...report,retained:[{...row,classification}]},backup,path,async()=>bytes),/not eligible/);
 await assert.rejects(recoveryReceipt({...report,retained:[row,row]},backup,path,async()=>bytes),/Ambiguous/);
 await assert.rejects(recoveryReceipt(report,[{...backup[0],id:'../escape'}],path,async()=>assert.fail()),/provenance/);
 await assert.rejects(recoveryReceipt({...report,retirementAuthorized:true},backup,path,async()=>bytes),/provenance/);
});
test('archive HTTP adapter uses fixed cross-bucket no-upsert copy and bounded private downloads',async()=>{
 const requests=[];
 const adapter=archiveStorage('https://example.invalid','secret',async(url,options)=>{
  requests.push({url:String(url),...options});return new Response(bytes,{headers:{'content-type':'image/jpeg'}});
 });
 await adapter.copy('owner/é.jpg','uuid/preserved');
 assert.deepEqual(JSON.parse(requests[0].body),{bucketId:'wine-photos',sourceKey:'owner/é.jpg',destinationBucket:ARCHIVE_BUCKET,destinationKey:'uuid/preserved'});
 assert.equal(requests[0].headers['x-upsert'],'false');assert.equal(requests[0].redirect,'error');
 assert.deepEqual((await adapter.read(ARCHIVE_BUCKET,'uuid/preserved')).bytes,bytes);
 await adapter.remove('owner/é.jpg');
 assert.equal(requests[2].url,'https://example.invalid/storage/v1/object/wine-photos');
 assert.equal(requests[2].method,'DELETE');assert.deepEqual(JSON.parse(requests[2].body),{prefixes:['owner/é.jpg']});
 await assert.rejects(adapter.read('public','bad'),/Unsupported/);
 for(const response of [new Response('bad',{status:403}),new Response(bytes,{headers:{'content-type':'text/html'}}),new Response(bytes,{headers:{'content-type':'image/jpeg','content-length':String(26*1024*1024)}})])
  await assert.rejects(archiveStorage('https://example.invalid','secret',async()=>response).read(ARCHIVE_BUCKET,'uuid/preserved'));
 assert.throws(()=>archiveStorage('http://example.invalid','secret'),/HTTPS/);
});
