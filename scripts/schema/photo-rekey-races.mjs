// Real independent PostgreSQL backends; invoked by replay-postgres.mjs.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
export async function rekeyRaces({sql,session,waitForLock,env,bin}) {
 const owner='00000000-0000-4000-8000-000000000001',entry='00000000-0000-4000-8000-000000000951';
 const path=`${owner}/${entry}/label/race.jpg`;
 sql(`insert into wine_entries(id,user_id,wine_name,label_image_path) values('${entry}','${owner}','Rekey race','${path}');
   insert into storage.objects(bucket_id,name,metadata) values('wine-photos','${path}','{"size":1,"mimetype":"image/jpeg"}');`);
 const value=input=>JSON.parse(sql(input).split('\n').find(l=>l.startsWith('{')));
 const literal=x=>`convert_from(decode('${Buffer.from(JSON.stringify(x)).toString('hex')}','hex'),'UTF8')::jsonb`;
 let count=0;
 for (const mutation of [`update wine_entries set notes='racing' where id='${entry}';`,
   `insert into entry_photos(entry_id,path,type) values('${entry}','${path}','label');`,
   `update storage.objects set version='racing' where name='${path}';`]){
  const id=`00000000-0000-4000-8000-00000000096${count}`;
  const op=value(`select private.plan_photo_rekey('${id}','${path}');`);
  sql(`insert into storage.objects(bucket_id,name,metadata) values('wine-photos','${op.mapping[0].new}','{"size":1,"mimetype":"image/jpeg"}');`);
  const dest=value(`select private.photo_rekey_snapshot(array['${op.mapping[0].new}','${op.mapping[1].new}']);`);
  const proof={objects:dest.objects,hashes:op.mapping.map((m,i)=>i?{...m,absent:true}:{...m,sha256:'a'.repeat(64),size:1,mimetype:'image/jpeg'})};
  const first=session(),second=session();
  try{
   const ready=new Promise((ok,no)=>{let out='';const timer=setTimeout(()=>no(Error('rekey writer not ready')),5000);
    first.child.stdout.on('data',chunk=>{out+=chunk;if(out.includes('rekey-ready')){clearTimeout(timer);ok();}});});
   first.child.stdin.write(`begin; ${mutation} select 'rekey-ready';\n`);await ready;
   second.child.stdin.end(`set application_name='photo-rekey-waiter'; select private.commit_photo_rekey('${id}',${literal(proof)});`);
   await waitForLock('photo-rekey-waiter');first.child.stdin.end('commit;');assert.equal((await first.done).code,0);
   const result=await second.done;assert.notEqual(result.code,0);assert.match(result.error,/Photo source changed/);
   assert.equal(sql(`select label_image_path from wine_entries where id='${entry}';`).trim(),path);
   sql(`select private.abandon_photo_rekey('${id}');`);count++;
  }finally{first.child.kill();second.child.kill();}
 }
 // Drive the real CLI and psql transport, including UTF-8 source arguments and
 // a duplicate plan after a hypothetical lost response. No Storage key needed.
 const cliEnv={...process.env,...env,CELLARSNAP_PSQL:resolve(bin,'psql')};
 const run=(...args)=>spawnSync(process.execPath,[resolve('scripts/storage/photo-rekey.mjs'),...args],{env:cliEnv,encoding:'utf8'});
 const id='00000000-0000-4000-8000-000000000970';
 const plan=run('plan',id,path);assert.equal(plan.status,0,plan.stderr);
 assert.deepEqual(JSON.parse(run('plan',id,path).stdout),JSON.parse(plan.stdout));
 assert.equal(JSON.parse(run('status',id).stdout).state,'planned');
 assert.equal(JSON.parse(run('abandon',id).stdout).state,'abandoned');
 assert.notEqual(run('retire',id).status,0);
 return {sourceEditAndReferenceAndStorageRaces:count,operatorCli:true,retirementUnavailable:true};
}
