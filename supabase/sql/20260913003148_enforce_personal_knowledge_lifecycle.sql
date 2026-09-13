-- B03b / AUD-04, AUD-26. Invalidate legacy derived text; preserve all raw
-- entries and curated knowledge. Regenerate personal vectors after rollout.
begin;

create unique index if not exists wine_entries_id_owner_knowledge_key
  on public.wine_entries(id, user_id);
create table if not exists public.user_entry_knowledge_chunks (
  id bigserial primary key,
  entry_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  embedding vector(1536) not null,
  metadata jsonb not null default '{}',
  source_hash text not null,
  created_at timestamptz not null default now(),
  foreign key (entry_id, user_id) references public.wine_entries(id, user_id) on delete cascade
);
create index if not exists user_entry_knowledge_owner_idx on public.user_entry_knowledge_chunks(user_id);
alter table public.user_entry_knowledge_chunks enable row level security;
revoke all on public.user_entry_knowledge_chunks from public, anon, authenticated;
grant select on public.user_entry_knowledge_chunks to authenticated;
grant all on public.user_entry_knowledge_chunks to service_role;
grant usage, select on sequence public.user_entry_knowledge_chunks_id_seq to service_role;
drop policy if exists user_entry_knowledge_owner_read on public.user_entry_knowledge_chunks;
create policy user_entry_knowledge_owner_read on public.user_entry_knowledge_chunks
  for select to authenticated using (user_id = (select auth.uid()));

-- One MVCC snapshot of the source row and ordered grapes; no separate queries
-- that could pair a new version token with old notes. Service-only ingestion.
create or replace function public.entry_knowledge_snapshot(target_entry_id uuid)
returns jsonb language sql stable security invoker
set search_path = public, extensions
as $$
  select jsonb_build_object('entry', to_jsonb(e), 'primary_grapes', coalesce((
    select jsonb_agg(jsonb_build_object('id', g.variety_id, 'name', v.name, 'position', g.position)
      order by g.position, g.id)
    from public.entry_primary_grapes g
    join public.grape_varieties v on v.id = g.variety_id
    where g.entry_id = e.id
  ), '[]'::jsonb))
  from public.wine_entries e where e.id = target_entry_id;
$$;
revoke all on function public.entry_knowledge_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.entry_knowledge_snapshot(uuid) to service_role;

create or replace function public.get_entry_knowledge_sources(
  after_entry_id uuid default null, batch_size int default 100
) returns table (entry_id uuid, source_snapshot jsonb)
language sql stable security invoker set search_path = public, extensions
as $$
  select e.id, public.entry_knowledge_snapshot(e.id)
  from public.wine_entries e
  where after_entry_id is null or e.id > after_entry_id
  order by e.id limit greatest(0, least(coalesce(batch_size, 100), 200));
$$;
revoke all on function public.get_entry_knowledge_sources(uuid, int) from public, anon, authenticated;
grant execute on function public.get_entry_knowledge_sources(uuid, int) to service_role;

create or replace function public.publish_entry_knowledge(
  target_entry_id uuid, expected_snapshot jsonb, chunk_content text, chunk_embedding vector(1536)
) returns boolean language plpgsql volatile security invoker
set search_path = public, extensions
as $$
declare current_snapshot jsonb; owner_id uuid;
begin
  -- Serializes publication with entry edits/deletion and grape invalidation.
  select e.user_id into owner_id from public.wine_entries e
    where e.id = target_entry_id for update;
  if not found then return false; end if;
  current_snapshot := public.entry_knowledge_snapshot(target_entry_id);
  if expected_snapshot is null or current_snapshot is distinct from expected_snapshot then
    return false;
  end if;
  if chunk_content is null or length(trim(chunk_content)) = 0 or chunk_embedding is null then
    raise exception 'Personal knowledge requires content and an embedding' using errcode = '22023';
  end if;
  insert into public.user_entry_knowledge_chunks(entry_id,user_id,content,embedding,metadata,source_hash)
  values (target_entry_id,owner_id,chunk_content,chunk_embedding,
    jsonb_build_object('table','wine_entries','user_id',owner_id,'entry_id',target_entry_id,
      'title',coalesce(nullif(current_snapshot->'entry'->>'wine_name',''),
        nullif(current_snapshot->'entry'->>'producer',''),'Cellar entry'),
      'wine_type',current_snapshot->'entry'->'wine_type',
      'rating',current_snapshot->'entry'->'rating',
      'vintage',current_snapshot->'entry'->'vintage'),
    md5(current_snapshot::text))
  on conflict (entry_id) do update set
    user_id=excluded.user_id, content=excluded.content, embedding=excluded.embedding,
    metadata=excluded.metadata, source_hash=excluded.source_hash, created_at=now();
  return true;
end;
$$;
revoke all on function public.publish_entry_knowledge(uuid,jsonb,text,vector) from public, anon, authenticated;
grant execute on function public.publish_entry_knowledge(uuid,jsonb,text,vector) to service_role;

create schema if not exists private;
-- Narrow trigger-only definers: clients cannot write the derived table. No
-- exposed RPC, dynamic SQL, supplied identity, or client execute authority.
create or replace function private.invalidate_entry_knowledge()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.user_entry_knowledge_chunks where entry_id = old.id;
  return new;
end;
$$;
revoke all on function private.invalidate_entry_knowledge() from public, anon, authenticated;
drop trigger if exists invalidate_entry_knowledge on public.wine_entries;
create trigger invalidate_entry_knowledge before update on public.wine_entries
  for each row when (old.* is distinct from new.*)
  execute function private.invalidate_entry_knowledge();

create or replace function private.invalidate_grape_entry_knowledge()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare affected_ids uuid[];
begin
  if tg_op = 'INSERT' then affected_ids := array[new.entry_id];
  elsif tg_op = 'DELETE' then affected_ids := array[old.entry_id];
  else affected_ids := array[old.entry_id,new.entry_id]; end if;
  perform 1 from public.wine_entries where id = any(affected_ids) order by id for update;
  delete from public.user_entry_knowledge_chunks where entry_id = any(affected_ids);
  return null;
end;
$$;
revoke all on function private.invalidate_grape_entry_knowledge() from public, anon, authenticated;
drop trigger if exists invalidate_grape_entry_knowledge on public.entry_primary_grapes;
create trigger invalidate_grape_entry_knowledge after insert or update or delete on public.entry_primary_grapes
  for each row execute function private.invalidate_grape_entry_knowledge();

create or replace function private.invalidate_variety_entry_knowledge()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.wine_entries e where exists (
    select 1 from public.entry_primary_grapes g where g.entry_id=e.id and g.variety_id=old.id
  ) order by e.id for update;
  delete from public.user_entry_knowledge_chunks k where exists (
    select 1 from public.entry_primary_grapes g where g.entry_id=k.entry_id and g.variety_id=old.id
  );
  return new;
end;
$$;
revoke all on function private.invalidate_variety_entry_knowledge() from public, anon, authenticated;
drop trigger if exists invalidate_variety_entry_knowledge on public.grape_varieties;
create trigger invalidate_variety_entry_knowledge after update of name on public.grape_varieties
  for each row when (old.name is distinct from new.name)
  execute function private.invalidate_variety_entry_knowledge();

create or replace function public.match_user_entries(
  query_embedding vector(1536), target_user_id uuid,
  match_threshold float default 0.55, match_count int default 5
) returns table (id bigint, content text, similarity float, metadata jsonb)
language sql stable security invoker set search_path = public, extensions
as $$
  select k.id,k.content,1-(k.embedding <=> query_embedding),k.metadata
  from public.user_entry_knowledge_chunks k
  where k.user_id=target_user_id
    and (target_user_id=(select auth.uid()) or current_user='service_role')
    and 1-(k.embedding <=> query_embedding)>match_threshold
  order by k.embedding <=> query_embedding,k.id
  limit greatest(0,least(coalesce(match_count,5),50));
$$;
revoke all on function public.match_user_entries(vector,uuid,float,int) from public,anon,authenticated;
grant execute on function public.match_user_entries(vector,uuid,float,int) to authenticated,service_role;

-- Old chunks lack a trustworthy source version. Do not label stale notes fresh.
-- This intentionally invalidates only regenerateable personal derived records.
delete from public.wine_knowledge_chunks where source_table='wine_entries';
alter table public.wine_knowledge_chunks drop constraint if exists wine_knowledge_curated_only;
alter table public.wine_knowledge_chunks add constraint wine_knowledge_curated_only
  check (source_table <> 'wine_entries');
-- General search already has its reviewed allowlist (B03a prerequisite).
drop policy if exists wine_knowledge_chunks_select_authenticated on public.wine_knowledge_chunks;
create policy wine_knowledge_chunks_select_authenticated on public.wine_knowledge_chunks
for select to authenticated using (source_table in (
  'base_profiles','classification_tier_modifiers','producer_modifiers',
  'aging_curve_baselines','vintage_weather_modifiers',
  'grape_sensitivity_coefficients','taxonomy_classification_tiers'
));
commit;
