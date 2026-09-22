// Real independent PostgreSQL sessions prove that the final short CAS sees a
// writer that committed while it waited for a table lock. No hosted connection.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
export async function archiveRaces({sql,session,waitForLock,env,bin}) {
 const owner='00000000-0000-4000-8000-000000000001';
 const literal=x=>`convert_from(decode('${Buffer.from(JSON.stringify(x)).toString('hex')}','hex'),'UTF8')::jsonb`;
 const value=input=>JSON.parse(sql(input).split('\n').find(l=>l.startsWith('{')));
 let races=0;
 for(const kind of ['reference','source','archive','bucket']){
  const id=`00000000-0000-4000-8000-00000000100${races}`;
  const objectId=`00000000-0000-4000-8000-00000000101${races}`;
  const path=`${owner}/archive-race-${races}.jpg`;
  sql(`insert into storage.objects(id,bucket_id,name,metadata) values('${objectId}','wine-photos','${path}','{"size":1,"mimetype":"image/jpeg"}');`);
  const receipt={backup_id:objectId,size:1,sha256:'a'.repeat(64),inventory_sha256:'b'.repeat(64),backup_index_sha256:'c'.repeat(64)};
  const op=value(`select private.plan_photo_archive('${id}','${path}',${literal(receipt)});`);
  sql(`insert into storage.objects(bucket_id,name,metadata) values('photo-recovery-archive','${op.archive_path}','{"size":1,"mimetype":"image/jpeg"}');`);
  const snapshot=value(`select private.photo_archive_snapshot('${path}','${op.archive_path}');`);
  const proof={object:snapshot.archive,size:1,sha256:'a'.repeat(64),mimetype:'image/jpeg'};
  const mutations={reference:`update profiles set avatar_path='${path}' where id='${owner}'`,
   source:`update storage.objects set version='changed' where id='${objectId}'`,
   archive:`update storage.objects set version='changed' where bucket_id='photo-recovery-archive' and name='${op.archive_path}'`,
   bucket:"update storage.buckets set public=true where id='photo-recovery-archive'"};
  const first=session(),second=session();
  try{
   const ready=new Promise((ok,no)=>{let out='';const timer=setTimeout(()=>no(Error('Archive writer did not become ready')),5000);
    first.child.stdout.on('data',chunk=>{out+=chunk;if(out.includes('archive-ready')){clearTimeout(timer);ok();}});});
   first.child.stdin.write(`begin; ${mutations[kind]}; select 'archive-ready';\n`);await ready;
   second.child.stdin.end(`set application_name='photo-archive-waiter'; select private.commit_photo_archive('${id}',${literal(proof)});`);
   await waitForLock('photo-archive-waiter');first.child.stdin.end('commit;');assert.equal((await first.done).code,0);
   const result=await second.done;assert.notEqual(result.code,0);
   assert.match(result.error,/Archive source changed|Archive byte proof or destination changed/);
   assert.equal(sql(`select state from private.photo_archive_operations where id='${id}'`).trim(),'planned');
   const status=spawnSync(process.execPath,[resolve('scripts/storage/photo-archive.mjs'),'status',id],{
    env:{...process.env,...env,CELLARSNAP_PSQL:resolve(bin,'psql')},encoding:'utf8'});
   assert.equal(status.status,0,status.stderr);
   assert.deepEqual(JSON.parse(status.stdout),{operationId:id,state:'planned',bytes:1,verifiedAt:null,retirementAuthorized:false});
   if(kind==='bucket')sql("update storage.buckets set public=false where id='photo-recovery-archive'");
   races++;
  }finally{first.child.kill();second.child.kill();}
 }
 return {referenceSourceDestinationBucketRaces:races,operatorCli:true,productionWrites:0};
}
