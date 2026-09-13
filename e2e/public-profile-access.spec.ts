import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { PGlite } from '@electric-sql/pglite';
import { getPublicProfileName } from '@shared';

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const migration = 'supabase/sql/20260913194536_restrict_public_profile_projection.sql';
async function role(db: PGlite, id: string | null, name = 'authenticated') {
  await db.exec(`reset role; set role ${name}`);
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub:id,role:name})]);
}
async function fixture(migrate = true) {
  const db = new PGlite();
  await db.exec(await readFile('e2e/fixtures/entry-access-schema.sql', 'utf8'));
  await db.exec(await readFile('e2e/fixtures/entry-access-functions.sql', 'utf8'));
  await db.exec(`create schema private;
    alter table profiles add column first_name text, add column last_name text,
      add column email text, add column name_display_preference text default 'real_name',
      add column avatar_path text, add column created_at timestamptz default now();`);
  await db.exec(await readFile('supabase/sql/043_name_display_preference.sql', 'utf8'));
  // 043 predates the hosted test flag; preserve its exact projection plus flag.
  const old = (await db.query<{definition:string}>("select pg_get_viewdef('public_profiles'::regclass,true) definition")).rows[0].definition;
  await db.exec('create or replace view public_profiles as '+old.replace('NULL::text AS email', 'NULL::text AS email, is_test_account'));
  await db.exec('grant all on public_profiles to authenticated, service_role; grant update(first_name) on public_profiles to authenticated');
  for (const [n, name, preference, tester] of [[1,'owner','username',false],[2,'friend','real_name',false],[3,'stranger','real_name',false],[4,'tester','username',true]] as const) {
    await db.query('insert into profiles(id,display_name,first_name,last_name,email,name_display_preference,is_test_account) values($1,$2,$3,$4,$5,$6,$7)',
      [uid(n), name, `Private${n}`, `Surname${n}`, `secret${n}@example.test`,preference,tester]);
  }
  await db.query("insert into friend_requests values($1,$2,'accepted')",[uid(1),uid(2)]);
  if (migrate) await db.exec(await readFile(migration,'utf8'));
  return db;
}

test('captured definer view lets a stranger overwrite an identity before containment',async()=>{
  const db=await fixture(false);
  try {
    await role(db,uid(3));
    expect((await db.query('update profiles set first_name=$1 where id=$2 returning id',['changed',uid(1)])).rows).toHaveLength(0);
    expect((await db.query('update public_profiles set first_name=$1 where id=$2 returning id',['changed',uid(1)])).rows).toHaveLength(1);
    await db.exec('reset role');
    await db.exec(await readFile(migration,'utf8'));
    await db.exec(await readFile(migration,'utf8'));
    await role(db,uid(3));
    await expect(db.query('update public_profiles set first_name=$1 where id=$2',['again',uid(1)])).rejects.toThrow(/permission denied|cannot update view/);
  } finally {await db.close();}
});

test('owner, friend and stranger get preference-aware safe names; owner private profile remains editable',async()=>{
  const db=await fixture();
  try {
    for(const viewer of [1,2,3]) {
      await role(db,uid(viewer));
      const rows=(await db.query<{id:string;display_name:string;username:string;first_name:null;last_name:null;email:null;is_test_account:boolean|null}>('select * from public_profiles order by id')).rows;
      expect(rows.map(r=>r.id)).toEqual([1,2,3].map(uid));
      expect(rows.map(r=>getPublicProfileName(r))).toEqual(['owner','Private2 S.','Private3 S.']);
      expect(rows.every(r=>r.first_name===null&&r.last_name===null&&r.email===null)).toBe(true);
      expect(rows.filter(r=>r.id!==uid(viewer)).every(r=>r.is_test_account===null)).toBe(true);
      expect((await db.query('select id from public_profiles where first_name=$1 or last_name=$2',['Private1','Surname1'])).rows).toEqual([]);
      expect((await db.query('select id from profiles')).rows).toEqual([{id:uid(viewer)}]);
    }
    await role(db,uid(1));
    expect((await db.query("update profiles set first_name='Retained' where id=$1 returning first_name",[uid(1)])).rows).toEqual([{first_name:'Retained'}]);
  } finally {await db.close();}
});

test('blocks in either direction hide profiles from ordinary and trusted-test viewers',async()=>{
  const db=await fixture();
  try {
    for(const viewer of [2,3,4]) for(const reverse of [false,true]) {
      await db.exec('reset role; delete from user_blocks');
      await db.query('insert into user_blocks values($1,$2)',[uid(reverse?1:viewer),uid(reverse?viewer:1)]);
      await role(db,uid(viewer));
      expect((await db.query('select id from public_profiles where id=$1',[uid(1)])).rows).toEqual([]);
    }
    await role(db,uid(4));
    expect((await db.query('select is_test_account from public_profiles where id=$1',[uid(4)])).rows).toEqual([{is_test_account:true}]);
  } finally {await db.close();}
});

test('anonymous, missing identities and all public-projection mutations fail closed',async()=>{
  const db=await fixture();
  try {
    await role(db,null,'anon');
    await expect(db.query('select * from public_profiles')).rejects.toThrow(/permission denied/);
    await expect(db.query('select * from private.read_public_profiles()')).rejects.toThrow(/permission denied/);
    await role(db,null);
    expect((await db.query('select * from public_profiles')).rows).toEqual([]);
    await role(db,uid(1));
    for(const sql of ["insert into public_profiles(id) values('00000000-0000-4000-8000-000000000010')",
      'delete from public_profiles', "update public_profiles set avatar_path='bad'", "update public_profiles set is_test_account=true"])
      await expect(db.exec(sql)).rejects.toThrow(/permission denied|cannot (insert|delete|update)/);
    await role(db,null,'service_role');
    const rows=(await db.query<{is_test_account:boolean;first_name:null}>('select * from public_profiles')).rows;
    expect(rows).toHaveLength(4);expect(rows.filter(r=>r.is_test_account)).toHaveLength(1);
    expect(rows.every(r=>r.first_name===null)).toBe(true);
  } finally {await db.close();}
});
