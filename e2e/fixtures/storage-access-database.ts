import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { photoGroupBaselineSql, photoGroupMigration } from "./photo-group-database";
export const storageMigration = "supabase/sql/20260912222036_enforce_wine_object_privacy.sql";
export async function storageBaselineSql() {
  const policies = JSON.parse(await readFile("docs/remediation/evidence/b02b2-live-storage-policies.json","utf8")) as Array<{
    policyname:string;roles:string;cmd:string;qual:string|null;with_check:string|null;
  }>;
  const quote = (v:string) => '"' + v.replaceAll('"','""') + '"';
  return policies.map(p => `drop policy if exists ${quote(p.policyname)} on storage.objects;
create policy ${quote(p.policyname)} on storage.objects for ${p.cmd} to ${p.roles.slice(1,-1).split(',').map(quote).join(',')}
${p.qual?`using (${p.qual})`:''} ${p.with_check?`with check (${p.with_check})`:''};`).join('\n');
}
export async function storageDatabase(migrated=true) {
  const db=new PGlite();
  for (const file of ["e2e/fixtures/entry-access-schema.sql","e2e/fixtures/entry-access-functions.sql","e2e/fixtures/entry-access-seed.sql",
    "supabase/sql/20260912185640_protect_profile_capabilities_and_public_assets.sql","supabase/sql/20260912200417_enforce_entry_read_privacy.sql"]) {
    await db.exec(await readFile(file,"utf8"));
  }
  await db.exec(await photoGroupBaselineSql());
  await db.exec(await readFile("e2e/fixtures/photo-group-seed.sql","utf8"));
  await db.exec(await readFile(photoGroupMigration,"utf8"));
  await db.exec(await readFile("e2e/fixtures/storage-access-schema.sql","utf8"));
  await db.exec(await storageBaselineSql());
  if(migrated) await db.exec(await readFile(storageMigration,"utf8"));
  return db;
}
