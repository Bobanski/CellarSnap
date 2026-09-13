-- B03a / AUD-04: personal notes are owner-only, even for public entries.
-- Curated sources are an allowlist: new source kinds fail closed.
begin;

alter table public.wine_knowledge_chunks enable row level security;
revoke all on public.wine_knowledge_chunks from public, anon, authenticated;
grant select on public.wine_knowledge_chunks to authenticated;
grant all on public.wine_knowledge_chunks to service_role;

drop policy if exists wine_knowledge_chunks_select_authenticated on public.wine_knowledge_chunks;
create policy wine_knowledge_chunks_select_authenticated
on public.wine_knowledge_chunks for select to authenticated
using (
  source_table in (
    'base_profiles', 'classification_tier_modifiers', 'producer_modifiers',
    'aging_curve_baselines', 'vintage_weather_modifiers',
    'grape_sensitivity_coefficients', 'taxonomy_classification_tiers'
  )
  or (source_table = 'wine_entries' and exists (
    select 1 from public.wine_entries e
    where e.id::text = source_row_id and e.user_id = (select auth.uid())
  ))
);

create or replace function public.match_wine_knowledge(
  query_embedding vector(1536),
  match_threshold float default 0.72,
  match_count int default 5
) returns table (id bigint, content text, similarity float, metadata jsonb)
language sql stable security invoker
set search_path = public, extensions
as $$
  select k.id, k.content, 1 - (k.embedding <=> query_embedding), k.metadata
  from public.wine_knowledge_chunks k
  where k.embedding is not null
    and k.source_table in (
      'base_profiles', 'classification_tier_modifiers', 'producer_modifiers',
      'aging_curve_baselines', 'vintage_weather_modifiers',
      'grape_sensitivity_coefficients', 'taxonomy_classification_tiers'
    )
    and 1 - (k.embedding <=> query_embedding) > match_threshold
  order by k.embedding <=> query_embedding, k.id
  limit greatest(0, least(coalesce(match_count, 5), 50));
$$;

create or replace function public.match_user_entries(
  query_embedding vector(1536),
  target_user_id uuid,
  match_threshold float default 0.55,
  match_count int default 5
) returns table (id bigint, content text, similarity float, metadata jsonb)
language sql stable security invoker
set search_path = public, extensions
as $$
  select k.id, k.content, 1 - (k.embedding <=> query_embedding), k.metadata
  from public.wine_knowledge_chunks k
  join public.wine_entries e on e.id::text = k.source_row_id
  where k.source_table = 'wine_entries' and k.embedding is not null
    and e.user_id = target_user_id
    and (target_user_id = (select auth.uid()) or current_user = 'service_role')
    and 1 - (k.embedding <=> query_embedding) > match_threshold
  order by k.embedding <=> query_embedding, k.id
  limit greatest(0, least(coalesce(match_count, 5), 50));
$$;

revoke all on function public.match_wine_knowledge(vector, float, int) from public, anon, authenticated;
revoke all on function public.match_user_entries(vector, uuid, float, int) from public, anon, authenticated;
grant execute on function public.match_wine_knowledge(vector, float, int) to authenticated, service_role;
grant execute on function public.match_user_entries(vector, uuid, float, int) to authenticated, service_role;
commit;
