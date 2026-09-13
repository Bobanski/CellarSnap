-- B03b QC follow-up: preserve per-entry snapshot checks without one HTTP
-- round trip per entry. Separate forward file because lifecycle SQL is live.
begin;
create or replace function public.publish_entry_knowledge_batch(chunks jsonb)
returns table (entry_id uuid, published boolean)
language plpgsql volatile security invoker set search_path = public, extensions
as $$
declare item jsonb;
begin
  if chunks is null or jsonb_typeof(chunks) <> 'array' then
    raise exception 'Expected a personal knowledge batch' using errcode = '22023';
  end if;
  if jsonb_array_length(chunks) > 100 then
    raise exception 'Personal knowledge batch exceeds 100 entries' using errcode = '22023';
  end if;
  -- Consistent lock ordering across competing batches.
  for item in select value from jsonb_array_elements(chunks) order by value->>'entry_id' loop
    entry_id := (item->>'entry_id')::uuid;
    published := public.publish_entry_knowledge(entry_id, item->'source_snapshot',
      item->>'content', (item->'embedding')::text::vector(1536));
    return next;
  end loop;
end;
$$;
revoke all on function public.publish_entry_knowledge_batch(jsonb) from public, anon, authenticated;
grant execute on function public.publish_entry_knowledge_batch(jsonb) to service_role;
commit;
