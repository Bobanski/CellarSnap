import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import type { PGlite } from '@electric-sql/pglite';
import { storageDatabase } from './fixtures/storage-access-database';
import { uid } from './fixtures/photo-group-database';

const migration = 'supabase/sql/20260913205430_private_policy_helpers.sql';
const helpers = [
  ['is_test_account', [uid(5)]], ['is_user_blocked', [uid(1), uid(4)]],
  ['are_friends', [uid(1), uid(2)]], ['can_view_test_authored_content', [uid(1), uid(5)]],
  ['can_view_entry_standard', [uid(1), uid(2), 'friends']], ['can_view_entry', [uid(5), uid(1), 'private']],
] as const;
async function role(db: PGlite, viewer: number | null, role = 'authenticated') {
  await db.exec(`reset role; set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [viewer ? uid(viewer) : '', role]);
}
async function matrix(db: PGlite) {
  const result = [];
  for (const viewer of [1, 2, 3, 4, 5, 6, 7, null]) {
    await role(db, viewer);
    const tables = [];
    for (const table of ['wine_entries', 'entry_photos', 'entry_groups', 'entry_group_slides']) {
      tables.push((await db.query(`select id from ${table} order by id`)).rows);
    }
    const paths = [100, 101, 102, 103].map(e => `${uid(1)}/${uid(e)}/label-legacy.jpg`);
    const photos = [];
    for (const path of paths) photos.push((await db.query('select can_access_wine_photo($1) allowed', [path])).rows);
    result.push({ viewer, tables, photos });
  }
  return result;
}

test('moving policy helper OIDs preserves complete owner/friend/FOF/stranger/test/photo/group matrix', async () => {
  const db = await storageDatabase();
  try {
    const before = await matrix(db);
    await db.exec('reset role'); await db.exec(await readFile(migration, 'utf8'));
    expect(await matrix(db)).toEqual(before);
    // Both directions of blocks must remain stronger than friend/test access.
    for (const reverse of [false, true]) {
      await db.exec('reset role; delete from user_blocks');
      await db.query('insert into user_blocks values($1,$2)', [uid(reverse ? 1 : 5), uid(reverse ? 5 : 1)]);
      await role(db, 5);
      expect((await db.query('select id from wine_entries where user_id=$1', [uid(1)])).rows).toEqual([]);
      expect((await db.query('select can_access_wine_photo($1) allowed', [`${uid(1)}/${uid(100)}/label-legacy.jpg`])).rows).toEqual([{ allowed: false }]);
    }
    await db.exec('reset role'); await db.exec(await readFile(migration, 'utf8'));
    expect((await db.query<{n: number}>("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('is_test_account','is_user_blocked','are_friends','can_view_test_authored_content','can_view_entry_standard','can_view_entry')")).rows[0].n).toBe(6);
  } finally { await db.close(); }
});

test('anonymous/authenticated arbitrary-ID helper RPCs are denied; service-only results retained', async () => {
  const db = await storageDatabase();
  try {
    const before = [];
    for (const [name, args] of helpers) before.push((await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, [...args])).rows);
    await db.exec(await readFile(migration, 'utf8'));
    for (const caller of ['anon', 'authenticated']) {
      await role(db, 4, caller);
      for (const [name, args] of helpers) await expect(db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')})`, [...args])).rejects.toMatchObject({ code: '42501' });
    }
    await role(db, null, 'service_role');
    for (const [index, [name, args]] of helpers.entries()) expect((await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, [...args])).rows).toEqual(before[index]);
    await role(db, null, 'anon');
    await expect(db.query('select private.is_test_account($1)', [uid(5)])).rejects.toMatchObject({ code: '42501' });
  } finally { await db.close(); }
});
