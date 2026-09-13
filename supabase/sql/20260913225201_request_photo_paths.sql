-- B02i / AUD-01: metadata authorization without minting Storage capabilities.
-- Invoker authority preserves managed Storage SELECT/RLS and source-owned rules.
create function public.readable_wine_photo_paths(object_names text[])
returns setof text language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if object_names is null or cardinality(object_names) > 100
    or exists(select 1 from unnest(object_names) p where p is null or octet_length(p) > 2048) then
    raise exception 'Invalid photo batch' using errcode='22023';
  end if;
  return query select o.name from storage.objects o
    where o.bucket_id='wine-photos' and o.name=any(object_names)
      and private.can_access_wine_photo(o.name);
end;
$$;
revoke all on function public.readable_wine_photo_paths(text[]) from public, anon, authenticated, service_role;
grant execute on function public.readable_wine_photo_paths(text[]) to authenticated;
