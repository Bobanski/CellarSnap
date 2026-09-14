import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replay} from './contract.mjs';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=uid(1),other=uid(2),entry=uid(100);
async function fixture(){
 const db=await replay();
 await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[owner,'rating-owner@example.invalid',other,'rating-other@example.invalid']);
 await db.query("insert into wine_entries(id,user_id,wine_name,rating,entry_privacy) values($1,$2,'Private rating fixture',93,'public')",[entry,owner]);
 return db;
}
const as=async(db,role,id)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);await db.exec(`set role ${role}`);};
const row=async(db,table='wine_entries_with_ratings')=>(await db.query(`select rating,public_rating_label from public.${table} where id=$1`,[entry])).rows[0];
test('staged source preserves owner numbers and public bands; activation empties readable raw fields',async()=>{
 const db=await fixture();try{
  assert.equal((await row(db,'wine_entries')).rating,93);
  await as(db,'authenticated',owner);assert.deepEqual(await row(db),{rating:93,public_rating_label:'Loved it'});
  await as(db,'authenticated',other);assert.deepEqual(await row(db),{rating:null,public_rating_label:'Loved it'});
  assert.deepEqual((await db.query('select * from wine_entry_ratings')).rows,[]);
  await as(db,'postgres',null);assert.equal((await db.query('select private.activate_rating_isolation() result')).rows[0].result.transferred,1);
  assert.equal((await row(db,'wine_entries')).rating,null);
  assert.equal((await db.query('select private.activate_rating_isolation() result')).rows[0].result.replayed,true);
  for(const role of ['authenticated','anon']){
   await as(db,role,role==='authenticated'?other:null);
   assert.equal((await db.query('select * from wine_entry_ratings')).rows.length,0);
   assert.equal((await db.query('select * from wine_entries where rating=93')).rows.length,0);
   assert.equal((await db.query('select * from wine_entries_with_ratings where rating=93')).rows.length,0);
   await assert.rejects(db.exec('select private.activate_rating_isolation()'),/permission denied/);
  }
  await as(db,'authenticated',owner);assert.equal((await row(db)).rating,93);
 }finally{await db.close();}
});
test('isolated direct writes retain 1–100/null, never leak committed values, and cannot forge ownership/bands',async()=>{
 const db=await fixture();try{
  await db.exec('select private.activate_rating_isolation()');await as(db,'authenticated',owner);
  for(const rating of [1,100,null,75,60,59]){
   await db.query('update wine_entries set rating=$1 where id=$2',[rating,entry]);
   assert.equal((await row(db)).rating,rating);assert.equal((await row(db,'wine_entries')).rating,null);
  }
  for(const rating of [0,101])await assert.rejects(db.query('update wine_entries set rating=$1 where id=$2',[rating,entry]),{code:'23514'});
  await assert.rejects(db.query("update wine_entries set public_rating_label='Loved it' where id=$1",[entry]),/permission denied/);
  await assert.rejects(db.query('update wine_entry_ratings set rating=99 where entry_id=$1',[entry]),/permission denied/);
  await assert.rejects(db.query('update wine_entries set user_id=$1 where id=$2',[other,entry]),{code:'42501'});
  assert.equal((await row(db)).rating,59);
  await db.query("insert into wine_entries(id,user_id,rating) values($1,$2,99) on conflict(id) do nothing",[entry,owner]);
  assert.equal((await row(db)).rating,59);
  await as(db,'authenticated',other);await db.query('update wine_entries set rating=99 where id=$1',[entry]);
  assert.equal((await row(db,'wine_entries')).rating,null);
  await as(db,'authenticated',owner);assert.equal((await row(db)).rating,59);
  await db.query('delete from wine_entries where id=$1',[entry]);
  assert.equal((await db.query('select * from wine_entry_ratings')).rows.length,0);
 }finally{await db.close();}
});
test('atomic owner command preserves private snapshots, null clears, lost-response replay, grapes and stale conflicts',async()=>{
 const db=await fixture();try{
  await db.exec('select private.activate_rating_isolation()');await as(db,'authenticated',owner);
  const edit=async(updates,expected)=>(await db.query('select save_entry_details($1,$2,$3) result',[entry,updates,expected])).rows[0].result;
  const result=await edit({rating:94,notes:'saved'},{rating:93,notes:null});assert.equal(result.entry.rating,94);assert.equal(result.replayed,false);
  assert.equal((await edit({rating:94,notes:'saved'},{rating:93,notes:null})).replayed,true);
  await assert.rejects(edit({rating:95},{rating:93}),{code:'PT409'});
  assert.equal((await row(db)).rating,94);assert.equal((await row(db,'wine_entries')).rating,null);
  assert.equal((await edit({rating:null},{rating:94})).entry.rating,null);
  await assert.rejects(db.query('select save_entry_details($1,$2,$3,$4,$5)',[entry,{rating:99},{rating:null},[uid(999)],[]]),{code:'22023'});
  assert.equal((await row(db)).rating,null);
 }finally{await db.close();}
});
test('service knowledge snapshots retain exact ratings and synchronous updates invalidate personal chunks',async()=>{
 const db=await fixture();try{
  await as(db,'service_role',null);
  const before=(await db.query('select entry_knowledge_snapshot($1) s',[entry])).rows[0].s;
  const embedding=JSON.stringify(Array(1536).fill(0));
  await db.query('select publish_entry_knowledge($1,$2,$3,$4)',[entry,before,'Private current content',embedding]);
  await as(db,'postgres',null);await db.exec('select private.activate_rating_isolation()');await as(db,'service_role',null);
  const snapshot=(await db.query('select entry_knowledge_snapshot($1) s',[entry])).rows[0].s;
  assert.equal(snapshot.entry.rating,93);assert.deepEqual(snapshot,before);
  assert.equal((await db.query('select count(*)::int n from user_entry_knowledge_chunks')).rows[0].n,1);
  await db.query('update wine_entries set rating=94 where id=$1',[entry]);
  assert.equal((await db.query('select count(*)::int n from user_entry_knowledge_chunks')).rows[0].n,0);
  assert.equal((await db.query('select publish_entry_knowledge($1,$2,$3,$4) ok',[entry,before,'stale',embedding])).rows[0].ok,false);
  assert.equal((await row(db)).rating,94);
  await as(db,'postgres',null);
  await db.query("insert into wine_entries(id,user_id,rating) values($1,$2,88)",[uid(101),owner]);
  assert.equal((await db.query('select rating from wine_entries where id=$1',[uid(101)])).rows[0].rating,null);
  await as(db,'service_role',null);
  assert.equal((await db.query('select rating from wine_entries_with_ratings where id=$1',[uid(101)])).rows[0].rating,88);
 }finally{await db.close();}
});
