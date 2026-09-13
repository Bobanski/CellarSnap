import {test} from 'node:test';import assert from 'node:assert/strict';import{replay}from'./contract.mjs';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function fixture(){const db=await replay();for(const n of[1,2])await db.query('insert into auth.users(id,email) values($1,$2)',[uid(n),`edit${n}@example.invalid`]);await db.query("insert into wine_entries(id,user_id,wine_name,notes,rating,entry_privacy) values($1,$2,'Fixture','Before',91,'private')",[uid(100),uid(1)]);for(const n of[1,2,3,4])await db.query('insert into grape_varieties(id,name,slug) values($1,$2,$2)',[uid(200+n),`fixture${n}`]);await db.query('insert into entry_primary_grapes(entry_id,variety_id,position) values($1,$2,1),($1,$3,2)',[uid(100),uid(201),uid(202)]);return db;}
const role=async(db,n=1)=>{await db.exec('reset role; set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]);};
const save=(db,updates,expected,grapes=null,old=null)=>db.query('select save_entry_details($1,$2,$3,$4,$5) result',[uid(100),updates,expected,grapes,old]);
const state=async db=>({entry:(await db.query('select notes,rating from wine_entries where id=$1',[uid(100)])).rows,grapes:(await db.query('select id,variety_id,position from entry_primary_grapes where entry_id=$1 order by position',[uid(100)])).rows});
test('atomic edit rolls back details and grape deletion on insert failure; retries preserve link identities',async()=>{
 const db=await fixture();try{const before=await state(db);await db.exec(`create function public.qc_reject_grape() returns trigger language plpgsql as $$ begin if new.variety_id='${uid(203)}' then raise exception 'QC injected insertion failure'; end if; return new; end $$; create trigger qc_reject before insert on entry_primary_grapes for each row execute function public.qc_reject_grape();`);await role(db);
 await assert.rejects(save(db,{notes:'After',rating:92},{notes:'Before',rating:91},[uid(203)],[uid(201),uid(202)]),/QC injected/);assert.deepEqual(await state(db),before);
 await db.exec('reset role; drop trigger qc_reject on entry_primary_grapes');await role(db);await save(db,{notes:'After',rating:92},{notes:'Before',rating:91},[uid(203)],[uid(201),uid(202)]);const after=await state(db);assert.equal(after.entry[0].notes,'After');assert.deepEqual(after.grapes.map(g=>g.variety_id),[uid(203)]);
 const retry=await save(db,{notes:'After',rating:92},{notes:'Before',rating:91},[uid(203)],[uid(201),uid(202)]);assert.equal(retry.rows[0].result.replayed,true);assert.deepEqual(await state(db),after);
 }finally{await db.close();}
});
test('notes-only retains concurrent grape edits; stale explicit edits conflict without partial changes',async()=>{
 const db=await fixture();try{await role(db);await save(db,{}, {},[uid(203)],[uid(201),uid(202)]);const grapes=(await state(db)).grapes;await save(db,{notes:'After'},{notes:'Before'});assert.deepEqual((await state(db)).grapes,grapes);
 const before=await state(db);await assert.rejects(save(db,{notes:'Stale'},{notes:'Before'},[uid(204)],[uid(201),uid(202)]),/Entry changed elsewhere/);assert.deepEqual(await state(db),before);
 await assert.rejects(save(db,{notes:'Grape stale'},{notes:'After'},[uid(204)],[uid(201),uid(202)]),/Entry changed elsewhere/);assert.deepEqual(await state(db),before);
 await save(db,{}, {},[],[uid(203)]);assert.deepEqual((await state(db)).grapes,[]);
 }finally{await db.close();}
});
test('owner boundary, input allowlist, exact optimistic snapshots and ordered grape bounds fail closed',async()=>{
 const db=await fixture();try{await role(db,2);await assert.rejects(save(db,{notes:'Attack'},{notes:'Before'}),/Entry unavailable/);await role(db);const before=await state(db);
 for(const[updates,expected,grapes,old]of[[{user_id:uid(2)},{user_id:uid(1)},null,null],[{notes:'Bad'},{},null,null],[{notes:'Bad'},{notes:'Before'},[uid(203)],null],[{}, {},[uid(201),uid(201)],[uid(201),uid(202)]],[{}, {},[uid(999)],[uid(201),uid(202)]],[{}, {},[uid(201),uid(202),uid(203),uid(204)],[uid(201),uid(202)]],[{rating:101},{rating:91},null,null]])await assert.rejects(save(db,updates,expected,grapes,old));assert.deepEqual(await state(db),before);
 await db.exec('reset role; set role anon');await assert.rejects(save(db,{},{}),/permission denied/);
 }finally{await db.close();}
});
