import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replay} from './contract.mjs';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const role=async(db,n)=>{await db.exec('reset role; set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[uid(n)]);};
test('private helper policies preserve real-schema grape/social/share writes and tester restrictions',async()=>{
 const db=await replay();
 try{
  for(let n=1;n<=4;n++)await db.query('insert into auth.users(id,email) values($1,$2)',[uid(n),`helper${n}@example.invalid`]);
  await db.query('update profiles set is_test_account=true where id=$1',[uid(4)]);
  await db.query("insert into friend_requests(requester_id,recipient_id,status) values($1,$2,'accepted')",[uid(1),uid(2)]);
  for(const[n,privacy]of[[100,'public'],[101,'friends'],[102,'private']])await db.query('insert into wine_entries(id,user_id,wine_name,entry_privacy) values($1,$2,$3,$4)',[uid(n),uid(1),`Fixture ${n}`,privacy]);
  await db.query("insert into grape_varieties(id,slug,name) values($1,'fixture','Fixture')",[uid(200)]);
  for(const n of[100,101,102])await db.query('insert into entry_primary_grapes(entry_id,variety_id,position) values($1,$2,1)',[uid(n),uid(200)]);
  for(const[viewer,visible]of[[1,3],[2,2],[3,1],[4,3]]){
   await role(db,viewer);assert.equal((await db.query('select * from entry_primary_grapes')).rows.length,visible);
  }
  await role(db,2);
  await db.query("insert into entry_comments(entry_id,user_id,body) values($1,$2,'Fixture comment')",[uid(101),uid(2)]);
  await db.query("insert into entry_reactions(entry_id,user_id,emoji) values($1,$2,'❤️')",[uid(101),uid(2)]);
  assert.equal((await db.query('select * from entry_comments')).rows.length,1);
  assert.equal((await db.query('select * from entry_reactions')).rows.length,1);
  await role(db,3);
  assert.equal((await db.query('select * from entry_comments')).rows.length,0);
  assert.equal((await db.query('select * from entry_reactions')).rows.length,0);
  await assert.rejects(db.query("insert into entry_comments(entry_id,user_id,body) values($1,$2,'Denied')",[uid(101),uid(3)]),/row-level security/);
  await role(db,4);
  await assert.rejects(db.query("insert into entry_comments(entry_id,user_id,body) values($1,$2,'Denied tester')",[uid(100),uid(4)]),/row-level security/);
  await role(db,1);
  await db.query('insert into post_shares(post_id,created_by) values($1,$2)',[uid(100),uid(1)]);
  await assert.rejects(db.query('select * from post_shares'),/permission denied/);
  await db.exec('reset role; set role service_role');
  assert.equal((await db.query('select * from post_shares')).rows.length,1);
  await role(db,1);
  const profiles=(await db.query('select * from public_profiles')).rows;
  assert.equal(profiles.length,3);assert.ok(profiles.every(p=>p.first_name===null&&p.last_name===null));
 }finally{await db.close();}
});
