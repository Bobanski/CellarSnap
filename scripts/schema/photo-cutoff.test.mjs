import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replay} from './contract.mjs';
import {resumeRekey,retireRekey} from '../storage/photo-rekey.mjs';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=uid(1),viewer=uid(2),entry=uid(100),id=uid(400),path=`${owner}/${entry}/label/a.jpg`;
async function fixture(){
 const db=await replay();
 const api={get:async id=>(await db.query('select to_jsonb(o) value from private.photo_rekey_operations o where id=$1',[id])).rows[0].value,
 snapshot:async paths=>(await db.query('select private.photo_rekey_snapshot($1) value',[paths])).rows[0].value,
 commit:async(id,proof)=>(await db.query('select private.commit_photo_rekey($1,$2) value',[id,proof])).rows[0].value,
 prepareRetirement:async id=>(await db.query('select private.prepare_photo_retirement($1) value',[id])).rows[0].value,
 confirmDeletion:async id=>(await db.query('select private.confirm_photo_deletion($1) value',[id])).rows[0].value};
 const blobs=new Map();
 const put=async(p,bytes)=>{blobs.set(p,{bytes:Buffer.from(bytes),mimetype:'image/jpeg'});await db.query("insert into storage.objects(bucket_id,name,metadata) values('wine-photos',$1,$2)",[p,{size:bytes.length,mimetype:'image/jpeg'}]);};
 const storage={copy:async(a,b)=>put(b,blobs.get(a).bytes),read:async p=>blobs.get(p),remove:async paths=>{await db.exec("select set_config('storage.allow_delete_query','true',false)");for(const p of paths){blobs.delete(p);await db.query('delete from storage.objects where name=$1',[p]);}}};
 await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[owner,'photo-owner@example.invalid',viewer,'photo-viewer@example.invalid']);
 await db.query("insert into wine_entries(id,user_id,entry_privacy,label_photo_privacy,label_image_path) values($1,$2,'public','public',$3)",[entry,owner,path]);
 await db.exec("insert into storage.buckets(id,name) values('wine-photos','wine-photos')");
 await put(path,Buffer.from('private-photo'));await db.query('select private.plan_photo_rekey($1,$2)',[id,path]);
 return{db,api,storage};
}
const as=async(db,role,who)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who??'']);await db.exec(`set role ${role}`);};
const operation=async(db,op)=>db.query("select set_config('storage.operation',$1,false)",[op]);
test('cutoff denies direct raw/transformed signing and reads while retaining protected app metadata and owned writes',async()=>{
 const f=await fixture();try{
  await f.db.exec('select private.activate_photo_cutoff()');await as(f.db,'authenticated',owner);
  for(const op of ['','object.sign','object.sign_many','render.image_sign','object.get_authenticated','render.image_authenticated','object.list','s3.object.get']){
   await operation(f.db,op);assert.equal((await f.db.query('select count(*)::int n from storage.objects')).rows[0].n,0,op);
  }
  for(const op of ['object.upload','object.upload_update','object.upload_signed','object.copy','object.delete','object.delete_many']){
   await operation(f.db,op);assert.equal((await f.db.query('select count(*)::int n from storage.objects')).rows[0].n,1,op);
  }
  await operation(f.db,'');assert.deepEqual((await f.db.query('select public.readable_wine_photo_paths($1) p',[[path]])).rows,[{p:path}]);
  await as(f.db,'authenticated',viewer);await operation(f.db,'object.copy');assert.equal((await f.db.query('select count(*)::int n from storage.objects')).rows[0].n,1);
  await as(f.db,'postgres',null);await f.db.query("update wine_entries set label_photo_privacy='private' where id=$1",[entry]);
  await as(f.db,'authenticated',viewer);assert.equal((await f.db.query('select public.readable_wine_photo_paths($1)',[[path]])).rows.length,0);
 }finally{await f.db.close();}
});
test('reference commit fences late old/original uploads and all future canonical references, including privileged writes',async()=>{
 const f=await fixture();try{
  const op=await resumeRekey(f.api,f.storage,id);
  for(const p of op.mapping.map(m=>m.old)){
   await as(f.db,'authenticated',owner);await operation(f.db,'object.upload');
   await assert.rejects(f.db.query("insert into storage.objects(bucket_id,name) values('wine-photos',$1)",[p]),/row-level security|duplicate key/);
   await assert.rejects(f.db.query('update wine_entries set label_image_path=$1 where id=$2',[p,entry]),{code:'PT409'});
   await as(f.db,'postgres',null);
   await assert.rejects(f.db.query("insert into entry_photos(entry_id,path,type) values($1,$2,'label')",[entry,p]),{code:'PT409'});
   await assert.rejects(f.db.query('update profiles set avatar_path=$1 where id=$2',[p,owner]),{code:'PT409'});
  }
  await as(f.db,'authenticated',owner);assert.equal((await f.db.query('select public.can_access_wine_photo($1) allowed',[path])).rows[0].allowed,false);
 }finally{await f.db.close();}
});
test('retirement requires cutoff, unchanged verified bytes and actual application access; lost deletion resumes',async()=>{
 const f=await fixture();try{
  const op=await resumeRekey(f.api,f.storage,id);
  const warmedAt=new Date().toISOString();
  await assert.rejects(retireRekey(f.api,f.storage,id,async()=>true),/Legacy signing cutoff required/);
  await f.db.exec('select private.activate_photo_cutoff()');
  await assert.rejects(retireRekey(f.api,f.storage,id,async()=>false),/application access failed/);
  assert.equal((await f.api.get(id)).retirement_phase,null);
  let calls=0;
  await assert.rejects(retireRekey(f.api,{...f.storage,remove:async paths=>{calls++;await f.storage.remove(paths);throw Error('lost deletion response');}},id,async()=>true),/lost deletion/);
  assert.equal((await f.api.get(id)).retirement_phase,'deleting');
  const done=await retireRekey(f.api,f.storage,id,async()=>true);assert.equal(done.retirement_phase,'deleted_pending_cdn');assert.equal(calls,1);
  assert.equal((await f.api.snapshot(op.mapping.map(m=>m.old))).objects.filter(o=>o.object).length,0);
  assert.equal((await f.api.snapshot(op.mapping.map(m=>m.new))).objects.filter(o=>o.object).length,1);
  assert.equal((await retireRekey(f.api,{read:()=>assert.fail(),remove:()=>assert.fail()},id)).retirement_phase,'deleted_pending_cdn');
  const observe=async observations=>f.db.query('select private.record_photo_revocation_evidence($1,$2) result',[id,observations]);
  await assert.rejects(observe([]),/Two independently/);
  const observations=['region-a','region-b'].flatMap(region=>['raw','transformed'].map(surface=>({region,surface,path, status:404,observed_at:new Date().toISOString(),capability_sha256:'a'.repeat(64),source_sha256:op.proof.hashes[0].sha256,warm_sha256:'b'.repeat(64),warmed_at:warmedAt,warm_status:200})));
  await assert.rejects(observe(observations.slice(0,2)),/Two independently/);
  await assert.rejects(observe(observations.map(o=>({...o,warm_sha256:null}))),/Invalid or unrelated/);
  assert.equal((await observe(observations)).rows[0].result.retirement_phase,'verified');

 }finally{await f.db.close();}
});
test('fixed and unique avatars can rekey; public profile access follows the new immutable path',async()=>{
 const f=await fixture();try{
  const avatar=`${owner}/avatar.jpg`,avatarId=uid(401);
  await f.db.query('update profiles set avatar_path=$1 where id=$2',[avatar,owner]);
  await f.db.query("insert into storage.objects(bucket_id,name,metadata) values('wine-photos',$1,$2)",[avatar,{size:13,mimetype:'image/jpeg'}]);
  const op=(await f.db.query('select private.plan_photo_rekey($1,$2) value',[avatarId,avatar])).rows[0].value;
  assert.match(op.mapping[0].new,/\/avatar-[0-9a-f-]+\.jpg$/);
  // The provider adapter and hash contract are shared with entry photos.
  const storage={...f.storage,read:async()=>({bytes:Buffer.from('private-photo'),mimetype:'image/jpeg'}),copy:async(a,b)=>f.db.query("insert into storage.objects(bucket_id,name,metadata) values('wine-photos',$1,$2)",[b,{size:13,mimetype:'image/jpeg'}])};
  const committed=await resumeRekey(f.api,storage,avatarId);assert.equal(committed.state,'pending_revocation');
  await as(f.db,'authenticated',viewer);
  assert.equal((await f.db.query('select can_access_wine_photo($1) ok',[op.mapping[0].new])).rows[0].ok,true);
  assert.equal((await f.db.query('select can_access_wine_photo($1) ok',[avatar])).rows[0].ok,false);
 }finally{await f.db.close();}
});
