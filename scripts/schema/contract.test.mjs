import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { replay, catalog, expectedCatalog, differences } from './contract.mjs';

describe('B05 reviewed complete app schema', () => {
  test('replays tables, private functions, Auth hooks, Storage policies and privileges without catalog drift', async () => {
    const db = await replay();
    try {
      assert.deepEqual(differences(await expectedCatalog(), await catalog(db)), []);
      assert.equal((await db.query("select count(*)::int count from pg_tables where schemaname='public'")).rows[0].count, 51);
    } finally { await db.close(); }
  });

  test('detects column, permission, policy, function, trigger and default-grant drift', async () => {
    const db = await replay();
    try {
      const expected = await expectedCatalog();
      const changes = [
        ['alter table wine_entries add column unexpected text', 'columns'],
        ['revoke select on public.profiles from authenticated', 'grants'],
        ['grant update(email) on public.profiles to anon', 'column_grants'],
        ['alter policy "Users can view allowed wine entries" on wine_entries using (true)', 'policies'],
        ["create or replace function public.is_test_account(user_id uuid) returns boolean language sql stable as $$ select false $$", 'functions'],
        ['alter table profiles disable trigger profiles_protect_capabilities', 'triggers'],
        ['alter default privileges for role postgres in schema public revoke insert on tables from anon', 'default_grants'],
      ];
      for (const [sql, category] of changes) {
        await db.exec('begin');
        try {
          await db.exec(sql);
          assert(differences(expected, await catalog(db)).includes(category), sql);
        } finally { await db.exec('rollback'); }
      }
      assert.deepEqual(differences(expected, await catalog(db)), []);
    } finally { await db.close(); }
  });

  test('actual baseline preserves owner isolation, test capability guard and service-only contact RPCs', async () => {
    const db = await replay();
    const owner='00000000-0000-4000-8000-000000000001';
    const other='00000000-0000-4000-8000-000000000002';
    try {
      await db.exec(`insert into auth.users(id,email) values ('${owner}','owner@example.invalid'),('${other}','other@example.invalid');
        insert into public.wine_entries(user_id,wine_name,entry_privacy) values ('${owner}','Disposable private','private'),('${owner}','Disposable public','public');
        set role authenticated;`);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
      assert.deepEqual((await db.query('select wine_name from public.wine_entries')).rows, [{wine_name:'Disposable public'}]);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
      assert.deepEqual((await db.query('select count(*)::int count from public.wine_entries')).rows, [{count:2}]);
      await assert.rejects(db.query('update profiles set is_test_account=true where id=$1',[owner]), /test.account|capabilit|permission/i);
      await assert.rejects(db.query("select public.get_email_for_username('nobody')"), /permission denied/);
      await db.exec('reset role; set role service_role');
      assert.deepEqual((await db.query("select public.get_email_for_username('nobody') email")).rows, [{email:null}]);
      await db.exec('reset role; set role anon');
      assert.deepEqual((await db.query('select * from wine_entries')).rows, []);
    } finally { await db.close(); }
  });
});
