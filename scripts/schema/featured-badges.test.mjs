import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replay} from './contract.mjs';
const owner='00000000-0000-4000-8000-000000000001', other='00000000-0000-4000-8000-000000000002';
async function fixture(){
 const db=await replay();
 await db.query("insert into auth.users(id,email) values ($1,'featured-a@example.invalid'),($2,'featured-b@example.invalid')",[owner,other]);
 await db.query("insert into user_badges(user_id,badge_id) select $1,f from unnest(array['a','b','c','d','e','f']) f",[owner]);
 await db.query("insert into user_badges(user_id,badge_id) values ($1,'other-only')",[other]);
 await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
 return db;
}
async function selection(db){return (await db.query('select featured_badge_id,featured_badge_ids from profiles where id=$1',[owner])).rows[0];}
async function update(db,sql){return db.query(`update profiles set ${sql} where id=$1 returning id`,[owner]);}
test('featured profile: modern/legacy feature, reorder, clear, repeat and unrelated edits',async()=>{
 const db=await fixture();try{
 await update(db,"featured_badge_ids=array['a','b','c','d','e']");
 assert.deepEqual(await selection(db),{featured_badge_id:'a',featured_badge_ids:['a','b','c','d','e']});
 await update(db,"featured_badge_ids=array['b','a'],featured_badge_id='b'");
 await update(db,"display_name='Disposable profile'");
 assert.deepEqual(await selection(db),{featured_badge_id:'b',featured_badge_ids:['b','a']});
 await update(db,"featured_badge_id='c'");
 assert.deepEqual(await selection(db),{featured_badge_id:'c',featured_badge_ids:['c']});
 await update(db,"featured_badge_id=null");
 assert.deepEqual(await selection(db),{featured_badge_id:null,featured_badge_ids:[]});
 await update(db,"featured_badge_ids=array['e']");await update(db,"featured_badge_ids='{}'");
 assert.deepEqual(await selection(db),{featured_badge_id:null,featured_badge_ids:[]});
 }finally{await db.close();}
});
test('featured profile: denies unearned/other-owner, malformed and contradictory writes atomically',async()=>{
 const db=await fixture();try{
 for(const sql of ["featured_badge_id='fake'","featured_badge_ids=array['a','other-only']","featured_badge_ids=array['a',null]","featured_badge_ids=array['a','a']","featured_badge_ids=array['a','b','c','d','e','f']","featured_badge_ids=array[['a','b']]","featured_badge_ids='[0:0]={a}'","featured_badge_ids=null","featured_badge_ids=array['b'],featured_badge_id='a'"]){
 await assert.rejects(update(db,sql),/Badge not earned|distinct earned|Conflicting/);assert.deepEqual(await selection(db),{featured_badge_id:null,featured_badge_ids:[]});
 }
 assert.deepEqual((await db.query("update profiles set featured_badge_id='a' where id=$1 returning id",[other])).rows,[]);
 await assert.rejects(db.exec('select private.enforce_earned_featured_badges()'),/permission denied/);
 await db.exec("reset role; set role anon; select set_config('request.jwt.claim.sub','',false)");assert.deepEqual((await update(db,"featured_badge_id='a'")).rows,[]);
 }finally{await db.close();}
});
test('featured profile: own INSERT/upsert authority and cross-owner INSERT denial',async()=>{
 const db=await fixture();try{
 await db.exec('reset role');await db.query('delete from profiles where id=$1',[owner]);await db.exec('set role authenticated');
 await assert.rejects(db.query("insert into profiles(id,featured_badge_id) values($1,'fake')",[owner]),/Badge not earned/);
 await db.query("insert into profiles(id,featured_badge_ids) values($1,array['a','b'])",[owner]);
 await db.query("insert into profiles(id,featured_badge_id) values($1,'c') on conflict(id) do update set featured_badge_id=excluded.featured_badge_id",[owner]);
 assert.deepEqual(await selection(db),{featured_badge_id:'c',featured_badge_ids:['c']});
 await assert.rejects(db.query("insert into profiles(id,featured_badge_id) values($1,'other-only')",[other]),/another user|row-level security/);
 }finally{await db.close();}
});
test('featured profile: privileged revocation/key reassignment clears only revoked picks and preserves awards',async()=>{
 const db=await fixture();try{
 await update(db,"featured_badge_ids=array['a','b','c']");await db.exec('reset role;set role service_role');
 await db.query("delete from user_badges where user_id=$1 and badge_id in ('a','b')",[owner]);
 assert.deepEqual(await selection(db),{featured_badge_id:'c',featured_badge_ids:['c']});
 await db.query("update user_badges set badge_id='renamed' where user_id=$1 and badge_id='c'",[owner]);
 assert.deepEqual(await selection(db),{featured_badge_id:null,featured_badge_ids:[]});
 assert.equal((await db.query('select count(*)::int n from user_badges where user_id=$1',[owner])).rows[0].n,4);
 await assert.rejects(update(db,"featured_badge_id='fake'"),/Badge not earned/);
 }finally{await db.close();}
});
