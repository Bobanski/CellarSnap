-- AUD-01 / B02b2. Apply after B02b1; release the share resolver afterwards.
-- Source-owned paths are authoritative. References, roots and collection
-- snapshots are not capabilities. Already-issued signed URLs expire normally.
begin;

do $$
begin
  -- Supabase owns storage.objects. Verify its managed RLS setting rather than
  -- issuing ALTER TABLE, which the hosted migration role cannot perform.
  if not (select relrowsecurity from pg_class where oid='storage.objects'::regclass) then
    raise exception 'Storage object RLS must be enabled before Storage privacy';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='public.profiles'::regclass
    and tgname='profiles_protect_capabilities' and tgenabled in ('O','A')
    and tgfoid=to_regprocedure('private.protect_profile_capabilities()'))
    or not exists (select 1 from pg_policies where schemaname='public'
      and tablename='entry_group_slides' and policyname='Users can view allowed entry group slides') then
    raise exception 'Apply and verify B01/B02a/B02b1 before Storage privacy';
  end if;
  if exists (select 1 from storage.buckets where id='wine-photos' and public)
    or not exists (select 1 from storage.buckets where id='wine-photos') then
    raise exception 'wine-photos must exist and be private';
  end if;
  if exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and (cmd='ALL' or (cmd='SELECT' and policyname not in (
      'Authenticated users can read wine photos','Users can read allowed wine photos',
      'Delete_own_photos bzgjph_1','Read_own_photos bzgjph_0',
      'Update_Own_Photos bzgjph_1','Public read access for public-assets')))) then
    raise exception 'Unreviewed Storage read policy; reconcile drift first';
  end if;
end;
$$;

-- Hidden metadata must be distinguishable from absent metadata. Otherwise a
-- visible context reference could relabel a private source. Keep this narrow
-- lookup in the non-exposed private schema, with explicit entry/photo access,
-- a fixed JWT identity, and a boolean-only result. No caller-supplied identity.
create or replace function private.can_access_wine_photo(object_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  viewer uuid := auth.uid();
  public_only boolean := coalesce(auth.role() = 'service_role', false);
  parts text[] := string_to_array(object_name, '/');
  source public.wine_entries%rowtype;
  base_path text := regexp_replace(object_name, '__original(\.[a-zA-Z0-9]+)?$', '\1');
  kinds text[];
  kind text;
  photo_privacy text;
begin
  if not public_only and viewer is null then return false; end if;
  -- Preserves uploads before metadata exists, upserts, avatar/cover changes,
  -- originals, drafts and cleanup of orphaned objects within one's own prefix.
  if not public_only and parts[1] = viewer::text then return true; end if;
  if parts[1] is null or parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  if not public_only and array_length(parts,1)=2 then
    return parts[2] ~ '^avatar\.(jpg|png|webp|gif)$'
      and public.can_view_entry(viewer, parts[1]::uuid, 'public')
      and exists (select 1 from public.profiles p
        where p.id=parts[1]::uuid and p.avatar_path=object_name);
  end if;
  if array_length(parts,1) not in (3,4) or parts[2] is null
    or parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  select * into source from public.wine_entries e
    where e.id=parts[2]::uuid and e.user_id=parts[1]::uuid;
  if not found then return false; end if;
  if public_only then
    if source.entry_privacy::text is distinct from 'public'
      or public.is_test_account(source.user_id) then return false; end if;
  elsif not public.can_view_entry(viewer,source.user_id,source.entry_privacy::text) then
    return false;
  end if;

  -- Photo reclassification updates metadata without moving the object. Exact
  -- ordered metadata wins over legacy columns and group references. ALL current
  -- types must permit access if duplicate rows point at the same source object.
  select array_agg(distinct p.type::text) into kinds from public.entry_photos p
    where p.entry_id=source.id and p.path=base_path;
  if kinds is null then
    select array_agg(v.kind) into kinds from (values
      ('label',source.label_image_path),('place',source.place_image_path),
      ('pairing',source.pairing_image_path)) v(kind,path) where v.path=base_path;
  end if;
  if kinds is null then
    -- Some legacy group photos exist only in slides. Validate the source member
    -- and the group's owned, readable anchor. Entry-less context is anchored.
    -- A private ordered/legacy source above always wins over a slide reference.
    select array_agg(distinct s.photo_type::text) into kinds
    from public.entry_groups g join public.entry_group_slides s on s.group_id=g.id
    join public.wine_entries anchor on anchor.id=g.anchor_entry_id
      and anchor.user_id=g.user_id and anchor.entry_group_id=g.id
    where g.user_id=source.user_id and source.entry_group_id=g.id
      and coalesce(s.entry_id,g.anchor_entry_id)=source.id and s.path=base_path
      and case when public_only then anchor.entry_privacy::text='public'
        else public.can_view_entry(viewer,anchor.user_id,anchor.entry_privacy::text) end;
  end if;
  if kinds is null then return false; end if;
  foreach kind in array kinds loop
    if kind is null or kind not in ('label','place','pairing','lineup','people','other_bottles') then return false; end if;
    photo_privacy := case kind
      when 'label' then coalesce(source.label_photo_privacy,source.entry_privacy)::text
      when 'place' then coalesce(source.place_photo_privacy,source.entry_privacy)::text
      else source.entry_privacy::text end;
    if public_only then
      if photo_privacy is distinct from 'public' then return false; end if;
    elsif not public.can_view_entry(viewer,source.user_id,photo_privacy) then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function private.can_access_wine_photo(text) from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.can_access_wine_photo(text) to authenticated, service_role;

-- Invoker RPC facade for the server's anonymous projection. service_role uses
-- the helper's public-only branch; ordinary callers get their own visibility.
create or replace function public.can_access_wine_photo(object_name text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.can_access_wine_photo(object_name);
$$;
revoke all on function public.can_access_wine_photo(text) from public, anon;
grant execute on function public.can_access_wine_photo(text) to authenticated, service_role;

drop policy if exists "Authenticated users can read wine photos" on storage.objects;
drop policy if exists "Users can read allowed wine photos" on storage.objects;
drop policy if exists "Delete_own_photos bzgjph_1" on storage.objects;
drop policy if exists "Read_own_photos bzgjph_0" on storage.objects;
drop policy if exists "Update_Own_Photos bzgjph_1" on storage.objects;
create policy "Users can read allowed wine photos" on storage.objects for select to authenticated
  using (bucket_id='wine-photos' and public.can_access_wine_photo(name));
-- Owner INSERT/UPDATE/DELETE and public-assets policy are unchanged.
commit;
