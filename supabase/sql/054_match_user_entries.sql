create or replace function public.match_user_entries(
  query_embedding vector(1536),
  target_user_id uuid,
  match_threshold float default 0.55,
  match_count int default 5
) returns table (
  id bigint,
  content text,
  similarity float,
  metadata jsonb
)
language sql
stable
as $$
  select
    wkc.id,
    wkc.content,
    1 - (wkc.embedding <=> query_embedding) as similarity,
    wkc.metadata
  from public.wine_knowledge_chunks wkc
  where wkc.embedding is not null
    and wkc.source_table = 'wine_entries'
    and wkc.metadata->>'user_id' = target_user_id::text
    and 1 - (wkc.embedding <=> query_embedding) > match_threshold
  order by wkc.embedding <=> query_embedding
  limit match_count;
$$;
