import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";

const owner = "11111111-1111-4111-8111-111111111111";
const another = "22222222-2222-4222-8222-222222222222";
const migrationPath = "supabase/sql/20260912185640_protect_profile_capabilities_and_public_assets.sql";

// Reproduce the relevant live grants/policies, then execute the real migration.
// Fixtures are synthetic and this PostgreSQL instance never connects to Supabase.
async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema storage;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth, storage to anon, authenticated, service_role;
    create table public.profiles (
      id uuid primary key,
      display_name text,
      is_test_account boolean not null default false
    );
    alter table public.profiles enable row level security;
    create policy "Users can view their own profile" on public.profiles for select
      using (auth.uid() = id);
    create policy "Users can insert their profile" on public.profiles for insert
      with check (auth.uid() = id);
    create policy "Users can update their profile" on public.profiles for update
      using (auth.uid() = id);
    grant select, insert, update on public.profiles to authenticated, service_role;
    create table storage.objects (name text primary key, bucket_id text not null);
    alter table storage.objects enable row level security;
    create policy "Public read access for public-assets" on storage.objects for select
      using (bucket_id = 'public-assets');
    create policy "Service role can upload to public-assets" on storage.objects for insert
      with check (bucket_id = 'public-assets');
    create policy "Service role can update public-assets" on storage.objects for update
      using (bucket_id = 'public-assets');
    grant select, insert, update on storage.objects to anon, authenticated, service_role;
    insert into storage.objects values ('original.svg', 'public-assets');
  `);
  await db.exec(await readFile(migrationPath, "utf8"));
  return db;
}

async function asRole(db: PGlite, role: "anon" | "authenticated" | "service_role", userId = owner) {
  await db.exec(`reset role; set role ${role};`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
}

test("profile owners can edit names but cannot assign or revoke privileged flags", async () => {
  const db = await database();
  try {
    // Applying the same forward migration again must preserve policies/data.
    await db.exec(await readFile(migrationPath, "utf8"));
    await asRole(db, "authenticated");
    await db.query("insert into profiles (id, display_name) values ($1, 'Original')", [owner]);
    await db.query("update profiles set display_name = 'Edited' where id = $1", [owner]);
    await expect(db.query("update profiles set is_test_account = true where id = $1", [owner]))
      .rejects.toMatchObject({ code: "42501" });
    await asRole(db, "service_role");
    await db.query("update profiles set is_test_account = true where id = $1", [owner]);
    await asRole(db, "authenticated");
    await db.query("update profiles set display_name = 'Still editable' where id = $1", [owner]);
    await expect(db.query("update profiles set is_test_account = false where id = $1", [owner]))
      .rejects.toMatchObject({ code: "42501" });
    expect((await db.query("select display_name, is_test_account from profiles")).rows)
      .toEqual([{ display_name: "Still editable", is_test_account: true }]);
    await asRole(db, "authenticated", another);
    await db.query("select set_config('request.jwt.claim.role', 'service_role', false)");
    await expect(db.query("insert into profiles (id, is_test_account) values ($1, true)", [another]))
      .rejects.toMatchObject({ code: "42501" });
    expect((await db.query("select * from profiles")).rows).toEqual([]);
  } finally {
    await db.close();
  }
});

for (const role of ["anon", "authenticated"] as const) {
  test(`public assets remain readable but cannot be uploaded/replaced by ${role}`, async () => {
    const db = await database();
    try {
      await asRole(db, role);
      expect((await db.query("select name from storage.objects")).rows)
        .toEqual([{ name: "original.svg" }]);
      await expect(db.query("insert into storage.objects values ('injected.svg', 'public-assets')"))
        .rejects.toMatchObject({ code: "42501" });
      expect((await db.query("update storage.objects set name = 'changed.svg' returning name")).rows)
        .toEqual([]);
      await asRole(db, "service_role");
      await db.query("insert into storage.objects values ('admin.svg', 'public-assets')");
      await db.query("update storage.objects set name = 'updated.svg' where name = 'original.svg'");
      expect((await db.query("select name from storage.objects order by name")).rows)
        .toEqual([{ name: "admin.svg" }, { name: "updated.svg" }]);
    } finally {
      await db.close();
    }
  });
}
