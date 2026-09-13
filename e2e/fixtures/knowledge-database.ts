import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

export const knowledgeReadMigration = "supabase/sql/20260913002148_isolate_personal_knowledge_reads.sql";
export const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const embedding = JSON.stringify([1, ...Array(1535).fill(0)]);

export async function knowledgeDatabase(migrate = true) {
  const db = new PGlite({ extensions: { vector } });
  await db.exec(`
    create extension vector;
    create schema auth;
    create schema extensions;
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth, extensions to anon, authenticated, service_role;
    create table auth.users(id uuid primary key);
    create table public.wine_entries (
      id uuid primary key, user_id uuid not null references auth.users on delete cascade,
      wine_name text, notes text, rating int, entry_privacy text default 'private'
    );
    create table public.entry_primary_grapes (
      id uuid primary key, entry_id uuid not null references wine_entries on delete cascade,
      variety_id uuid not null, position smallint not null
    );
    alter table wine_entries enable row level security;
    create policy fixture_entry_read on wine_entries for select to authenticated
      using (user_id = auth.uid() or entry_privacy = 'public');
    create policy fixture_entry_update on wine_entries for update to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
    create policy fixture_entry_delete on wine_entries for delete to authenticated
      using (user_id = auth.uid());
    grant select, update, delete on wine_entries to authenticated;
    grant all on wine_entries, entry_primary_grapes to service_role;
    grant all on entry_primary_grapes to authenticated;
    create table wine_knowledge_chunks (
      id bigserial primary key, source_table text not null, source_row_id text not null,
      chunk_index int not null default 0, content text not null, embedding vector(1536),
      metadata jsonb not null default '{}', created_at timestamptz not null default now(),
      unique(source_table, source_row_id, chunk_index)
    );
    alter table wine_knowledge_chunks enable row level security;
    create policy wine_knowledge_chunks_select_authenticated on wine_knowledge_chunks
      for select to authenticated using (true);
    grant all on wine_knowledge_chunks to anon, authenticated, service_role;
    grant all on all sequences in schema public to service_role;
    insert into auth.users values ('${uid(1)}'), ('${uid(2)}');
    insert into wine_entries(id,user_id,wine_name,notes,entry_privacy) values
      ('${uid(11)}','${uid(1)}','Owner wine','Private marker A','private'),
      ('${uid(12)}','${uid(2)}','Other wine','Private marker B','public');
  `);
  // Real captured function bodies preserve the vulnerable baseline for regression proof.
  const catalog = JSON.parse(await readFile("docs/remediation/evidence/b03-live-catalog.json", "utf8"));
  for (const fn of catalog.functions) await db.exec(fn.definition);
  for (const [source, row, content, owner] of [
    ["base_profiles", "curated", "Curated wine context", ""],
    ["wine_entries", uid(11), "Private marker A", uid(2)], // forged metadata must not grant B access
    ["wine_entries", uid(12), "Private marker B", uid(2)],
    ["wine_entries", "malformed-orphan", "Orphan private marker", uid(1)],
    ["future_source", "unknown", "Unreviewed source", ""],
  ]) {
    await db.query(`insert into wine_knowledge_chunks(source_table,source_row_id,content,embedding,metadata)
      values ($1,$2,$3,$4,$5)`, [source, row, content, embedding, JSON.stringify({ user_id: owner, table: source })]);
  }
  if (migrate) await db.exec(await readFile(knowledgeReadMigration, "utf8"));
  return db;
}

export async function asKnowledgeRole(db: PGlite, role: "anon" | "authenticated" | "service_role", user = "") {
  await db.exec(`reset role; set role ${role};`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
}
