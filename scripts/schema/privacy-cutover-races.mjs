import assert from 'node:assert/strict';
export async function privacyCutoverRaces({sql,session}){
 const owner='00000000-0000-4000-8000-000000000001',entry='00000000-0000-4000-8000-000000000980';
 const waiter=session();
 try{
  const ready=new Promise((ok,no)=>{let out='';const timer=setTimeout(()=>no(Error('Snapshot not ready')),5000);waiter.child.stdout.on('data',chunk=>{out+=chunk;if(out.includes('privacy-ready')){clearTimeout(timer);ok();}});});
  waiter.child.stdin.write("begin isolation level repeatable read; select count(*) from profiles; select 'privacy-ready';\n");await ready;
  sql('select private.activate_rating_isolation();');
  waiter.child.stdin.end(`set local role authenticated; select set_config('request.jwt.claim.sub','${owner}',true); insert into wine_entries(id,user_id,rating) values('${entry}','${owner}',95); commit;`);
  const result=await waiter.done;assert.equal(result.code,0,result.error);
  assert.equal(sql(`select coalesce(rating::text,'null') from wine_entries where id='${entry}';`).trim(),'null');
  assert.equal(sql(`select rating from wine_entry_ratings where entry_id='${entry}';`).trim(),'95');
 }finally{waiter.child.kill();}
 // A row lock on the epoch forces an old snapshot to abort rather than ignore
 // a path fenced after its snapshot. This covers direct privileged RR writers.
 const old=session();try{
  const ready=new Promise((ok,no)=>{let out='';const timer=setTimeout(()=>no(Error('Fence snapshot not ready')),5000);old.child.stdout.on('data',chunk=>{out+=chunk;if(out.includes('fence-ready')){clearTimeout(timer);ok();}});});
  old.child.stdin.write("begin isolation level repeatable read; select count(*) from profiles; select 'fence-ready';\n");await ready;
  sql('update private.photo_delivery_state set fence_epoch=fence_epoch+1;');
  old.child.stdin.end(`insert into entry_photos(entry_id,path,type) values('${entry}','${owner}/${entry}/label/snapshot.jpg','label'); commit;`);
  const result=await old.done;assert.notEqual(result.code,0);assert.match(result.error,/could not serialize/);
  assert.equal(sql(`select count(*) from entry_photos where entry_id='${entry}';`).trim(),'0');
 }finally{old.child.kill();}
 return {oldSnapshotRatingInsertIsolated:true,stalePhotoWriterAborted:true};
}
