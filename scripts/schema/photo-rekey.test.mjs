import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replay} from './contract.mjs';
import {resumeRekey,storageAdapter,psqlAdapter,MAX_PHOTO_BYTES} from '../storage/photo-rekey.mjs';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=uid(1),viewer=uid(2),entry=uid(100),group=uid(200),collection=uid(300),id=uid(400);
const path=`${owner}/${entry}/label/é.jpg`,original=path.replace('.jpg','__original.jpg');
export const rekeyDbAdapter=db=>({
  plan:async(id,path)=>(await db.query('select private.plan_photo_rekey($1,$2) value',[id,path])).rows[0].value,
  get:async id=>(await db.query('select to_jsonb(o) value from private.photo_rekey_operations o where id=$1',[id])).rows[0].value,
  snapshot:async paths=>(await db.query('select private.photo_rekey_snapshot($1) value',[paths])).rows[0].value,
  commit:async(id,proof)=>(await db.query('select private.commit_photo_rekey($1,$2) value',[id,proof])).rows[0].value,
  abandon:async id=>(await db.query('select private.abandon_photo_rekey($1) value',[id])).rows[0].value,
});
async function fixture(withOriginal=true){
 const db=await replay(),api=rekeyDbAdapter(db),blobs=new Map();
 await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[owner,'rekey-owner@example.invalid',viewer,'rekey-viewer@example.invalid']);
 await db.query("insert into wine_entries(id,user_id,wine_name,entry_privacy,label_photo_privacy,label_image_path,place_image_path,pairing_image_path) values($1,$2,'Rekey fixture','public','public',$3,$3,$3)",[entry,owner,path]);
 await db.query("insert into entry_photos(entry_id,path,type) values($1,$2,'label')",[entry,path]);
 await db.query("insert into entry_groups(id,user_id,mode,title,anchor_entry_id) values($1,$2,'event','Rekey fixture',$3)",[group,owner,entry]);
 await db.query("insert into entry_group_slides(group_id,entry_id,photo_type,path,position) values($1,$2,'label',$3,0)",[group,entry,path]);
 await db.query('update profiles set avatar_path=$1 where id=$2',[path,owner]);
 await db.query("insert into user_collections(id,user_id,name,cover_image_path) values($1,$2,'Rekey fixture',$3)",[collection,viewer,path]);
 await db.query('insert into user_collection_items(collection_id,user_id,entry_id,snapshot_label_image_path,snapshot_preview_image_path) values($1,$2,$3,$4,$4)',[collection,viewer,entry,path]);
 await db.exec("insert into storage.buckets(id,name) values('wine-photos','wine-photos')");
 const put=async(p,bytes)=>{blobs.set(p,{bytes:Buffer.from(bytes),mimetype:'image/jpeg'});await db.query("insert into storage.objects(bucket_id,name,metadata) values('wine-photos',$1,$2)",[p,{size:bytes.length,mimetype:'image/jpeg'}]);};
 await put(path,Buffer.from('base'));if(withOriginal)await put(original,Buffer.from('original'));
 const storage={copy:async(a,b)=>put(b,blobs.get(a).bytes),read:async p=>blobs.get(p)};
 return {db,api,blobs,storage};
}
test('durable cohort swaps all nine reference columns, IDs and originals; preserves source-based access and replays lost commits',async()=>{
 const f=await fixture();try{
  const op=await f.api.plan(id,path);assert.equal(op.expected.refs.length,9);
  assert.ok(!JSON.stringify(op).includes('Rekey fixture'));assert.ok(op.expected.refs.every(r=>/^[a-f0-9]{64}$/.test(r.fingerprint)));
  assert.equal(new Set(op.expected.refs.map(r=>r.t+'.'+r.c)).size,9);
  assert.deepEqual(await f.api.plan(id,path),op);
  const committed=await resumeRekey(f.api,f.storage,id);assert.equal(committed.state,'pending_revocation');
  assert.equal(committed.proof.hashes.length,2);assert.equal((await f.api.snapshot(op.mapping.map(m=>m.old))).refs.length,0);
  const current=await f.api.snapshot(op.mapping.map(m=>m.new));assert.equal(current.refs.length,9);
  assert.deepEqual(current.refs.map(r=>[r.t,r.id,r.c]),op.expected.refs.map(r=>[r.t,r.id,r.c]));
  assert.equal((await f.db.query('select count(*)::int n from storage.objects')).rows[0].n,4); // no retirement
  assert.deepEqual(await resumeRekey(f.api,{copy:()=>assert.fail(),read:()=>assert.fail()},id),committed);
  await assert.rejects(f.api.abandon(id),/cannot be abandoned/);
  for(const allowed of [true,false]){
   await f.db.query('update wine_entries set label_photo_privacy=$1 where id=$2',[allowed?'public':'private',entry]);
   await f.db.exec('set role authenticated');await f.db.query("select set_config('request.jwt.claim.sub',$1,false)",[viewer]);
   const paths=op.mapping.map(m=>m.new);
   assert.equal((await f.db.query('select count(*)::int n from public.readable_wine_photo_paths($1)',[paths])).rows[0].n,allowed?2:0);
   await f.db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
   assert.equal((await f.db.query('select count(*)::int n from public.readable_wine_photo_paths($1)',[paths])).rows[0].n,2);
   await f.db.exec('reset role');
  }
 }finally{await f.db.close();}
});
test('lost copy response leaves stable destination and resumes without overwriting; missing originals stay absent',async()=>{
 const f=await fixture(false);try{
  const op=await f.api.plan(id,path);let copies=0;
  await assert.rejects(resumeRekey(f.api,{...f.storage,copy:async(a,b)=>{copies++;await f.storage.copy(a,b);throw Error('lost response');}},id),/lost response/);
  assert.equal((await f.api.get(id)).state,'planned');
  const committed=await resumeRekey(f.api,{...f.storage,copy:()=>assert.fail('must discover completed copy')},id);
  assert.equal(copies,1);assert.equal(committed.state,'pending_revocation');
  assert.equal((await f.api.snapshot(op.mapping.map(m=>m.new))).objects.filter(o=>o.object).length,1);
 }finally{await f.db.close();}
});
test('copy failure, corrupt bytes and destination metadata changes never rewrite references',async()=>{
 const f=await fixture();try{
  const op=await f.api.plan(id,path);
  await assert.rejects(resumeRekey(f.api,{...f.storage,copy:async()=>{throw Error('503');}},id),/503/);
  await f.storage.copy(path,op.mapping[0].new);f.blobs.get(op.mapping[0].new).bytes=Buffer.from('wrong');
  await assert.rejects(resumeRekey(f.api,f.storage,id),/hash, size or type mismatch/);
  assert.deepEqual(await f.api.snapshot(op.mapping.map(m=>m.old)),op.expected);
  f.blobs.get(op.mapping[0].new).bytes=Buffer.from('base');
  let changed=false;
  await assert.rejects(resumeRekey(f.api,{...f.storage,read:async p=>{
    if(!changed){changed=true;await f.db.query("update storage.objects set version='changed' where name=$1",[op.mapping[0].new]);}return f.storage.read(p);
  }},id),/destination changed/);
  assert.equal((await f.api.get(id)).state,'planned');
 }finally{await f.db.close();}
});
test('edits, new shared references and original uploads conflict with captured source; abandon allows a new mapping',async()=>{
 for(const mutation of ["update wine_entries set notes='concurrent edit'",`insert into entry_photos(entry_id,path,type) values('${entry}','${path}','label')`,`insert into storage.objects(bucket_id,name,metadata) values('wine-photos','${original}','{}')`]){
  const f=await fixture(false);try{
   await f.api.plan(id,path);await f.db.exec(mutation);
   await assert.rejects(resumeRekey(f.api,f.storage,id),/source changed/);
   await f.api.abandon(id);const next=await f.api.plan(uid(401),path);assert.notEqual(next.mapping[0].new,id);
  }finally{await f.db.close();}
 }
});
test('commit atomically rolls back all cells if any downstream write fails; retry succeeds',async()=>{
 const f=await fixture();try{
  const op=await f.api.plan(id,path);
  await f.db.exec("create function public.rekey_fail() returns trigger language plpgsql as $$begin raise exception 'injected failure'; end$$; create trigger rekey_fail before update on public.wine_entries for each row execute function public.rekey_fail();");
  await assert.rejects(resumeRekey(f.api,f.storage,id),/injected failure/);
  assert.deepEqual(await f.api.snapshot(op.mapping.map(m=>m.old)),op.expected);assert.equal((await f.api.get(id)).state,'planned');
  await f.db.exec('drop trigger rekey_fail on public.wine_entries; drop function public.rekey_fail()');
  let lost=true;const adapter={...f.api,commit:async(...args)=>{const r=await f.api.commit(...args);if(lost){lost=false;throw Error('lost commit');}return r;}};
  await assert.rejects(resumeRekey(adapter,f.storage,id),/lost commit/);
  assert.equal((await resumeRekey(adapter,f.storage,id)).state,'pending_revocation');
 }finally{await f.db.close();}
});
test('commit rejects late source edits, destination replacement or new destination references',async()=>{
 for(const mutation of [async(f)=>f.db.exec("update wine_entries set notes='late'"),async(f,op)=>f.db.query("update storage.objects set version='late' where name=$1",[op.mapping[0].new]),async(f,op)=>f.db.query("insert into entry_photos(entry_id,path,type) values($1,$2,'label')",[entry,op.mapping[0].new])]){
  const f=await fixture();try{
   const op=await f.api.plan(id,path);
   await assert.rejects(resumeRekey({...f.api,commit:async(...args)=>{await mutation(f,op);return f.api.commit(...args);}},f.storage,id),{code:'PT409'});
   assert.equal((await f.api.get(id)).state,'planned');
   assert.equal((await f.db.query('select label_image_path from wine_entries where id=$1',[entry])).rows[0].label_image_path,path);
  }finally{await f.db.close();}
 }
});
test('operator ledger and functions reject all API roles; invalid paths and missing sources fail closed',async()=>{
 const f=await fixture();try{
  for(const p of [null,`${owner}/avatar.jpg`,original,`${owner}/${entry}/../bad`,`${owner}/${uid(999)}/missing.jpg`])await assert.rejects(f.api.plan(id,p),{code:'22023'});
  await f.api.plan(id,path);await assert.rejects(f.api.plan(id,`${owner}/${entry}/different.jpg`),/identity mismatch/);
  await assert.rejects(f.api.plan(uid(401),path),{code:'23505'});
  for(const role of ['anon','authenticated','service_role']){
   await f.db.exec(`set role ${role}`);
   await assert.rejects(f.api.plan(id,path),/permission denied/);await assert.rejects(f.api.get(id),/permission denied/);
   await assert.rejects(f.api.snapshot([path,original]),/permission denied/);await assert.rejects(f.api.commit(id,{}),/permission denied/);
   await assert.rejects(f.api.abandon(id),/permission denied/);await f.db.exec('reset role');
  }
 }finally{await f.db.close();}
});
test('Storage adapter uses explicit origin, non-upsert copy, bounded image reads and sanitized failures',async()=>{
 let seen;const s=storageAdapter('https://fixture.example','secret',async(url,options)=>{seen={url:String(url),options};return new Response(Buffer.from('photo'),{headers:{'content-type':'image/jpeg'}});});
 await s.copy('owner/a é.jpg','owner/b.jpg');assert.equal(seen.options.redirect,'error');assert.equal(seen.options.headers['x-upsert'],'false');
 assert.deepEqual(JSON.parse(seen.options.body),{bucketId:'wine-photos',sourceKey:'owner/a é.jpg',destinationKey:'owner/b.jpg'});
 assert.equal((await s.read('owner/a é.jpg')).bytes.toString(),'photo');assert.match(seen.url,/a%20%C3%A9\.jpg$/);
 for(const response of [new Response('secret',{status:503}),new Response('bad',{headers:{'content-type':'text/html'}}),new Response('big',{headers:{'content-type':'image/jpeg','content-length':String(MAX_PHOTO_BYTES+1)}})]){
  await assert.rejects(storageAdapter('https://fixture.example','secret',async()=>response).read('x'));
 }
 assert.throws(()=>storageAdapter('http://fixture.example','secret'));
 assert.throws(()=>psqlAdapter({PGHOST:'remote.example',PGUSER:'operator',PGDATABASE:'postgres'}),/verify-full/);
});
test('missing referenced originals and oversized reference cohorts cannot create an operation',async()=>{
 const f=await fixture(false);try{
  await f.db.query("insert into entry_photos(entry_id,path,type) values($1,$2,'label')",[entry,original]);
  await assert.rejects(f.api.plan(id,path),/Referenced original is missing/);
  await f.db.query('delete from entry_photos where path=$1',[original]);
  await f.db.query("insert into entry_photos(entry_id,path,type) select $1,$2,'label' from generate_series(1,1001)",[entry,path]);
  await assert.rejects(f.api.plan(id,path),{code:'54000'});
  assert.equal((await f.db.query('select count(*)::int n from private.photo_rekey_operations')).rows[0].n,0);
 }finally{await f.db.close();}
});
