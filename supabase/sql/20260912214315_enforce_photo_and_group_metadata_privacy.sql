-- AUD-01 / B02b1: photo metadata and grouped-post read boundaries.
-- Requires deployed B01 and B02a. Object Storage and anonymous server shares
-- are separate B02b2 work: a metadata path is not an authorization capability.
begin;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass
      and tgname = 'profiles_protect_capabilities'
      and tgfoid = to_regprocedure('private.protect_profile_capabilities()')
      and tgenabled in ('O', 'A') and not tgisinternal
  ) then
    raise exception 'Apply profile capability protection before photo/group privacy';
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'wine_entries'
      and policyname = 'Users can view allowed wine entries' and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
  ) or exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'wine_entries'
      and cmd in ('SELECT', 'ALL') and policyname <> 'Users can view allowed wine entries'
  ) then
    raise exception 'Apply and verify B02a entry privacy before photo/group privacy';
  end if;
  if exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename in ('entry_photos', 'entry_groups', 'entry_group_slides')
      and cmd in ('SELECT', 'ALL')
      and not (
        (tablename = 'entry_photos' and policyname in
          ('Owners can manage entry photos', 'Users can view entry photos')) or
        (tablename = 'entry_groups' and policyname in
          ('Owners can manage entry groups', 'Authenticated users can view entry groups', 'Users can view allowed entry groups')) or
        (tablename = 'entry_group_slides' and policyname in
          ('Owners can manage entry group slides', 'Authenticated users can view entry group slides', 'Users can view allowed entry group slides'))
      )
  ) then
    raise exception 'Unreviewed photo/group read policy; reconcile drift first';
  end if;
end;
$$;

alter table public.entry_photos enable row level security;
alter table public.entry_groups enable row level security;
alter table public.entry_group_slides enable row level security;

-- Recreate known owner ALL policies too: permissive ALL also grants SELECT.
-- Owner writes retain the same parent ownership checks, including draft rows.
drop policy if exists "Owners can manage entry photos" on public.entry_photos;
create policy "Owners can manage entry photos" on public.entry_photos
  for all to authenticated
  using ((select auth.uid()) = (select e.user_id from public.wine_entries e where e.id = entry_id))
  with check ((select auth.uid()) = (select e.user_id from public.wine_entries e where e.id = entry_id));
drop policy if exists "Users can view entry photos" on public.entry_photos;
create policy "Users can view entry photos" on public.entry_photos
  for select to authenticated using (exists (
    select 1 from public.wine_entries e where e.id = entry_id
      -- Parent SELECT RLS is necessary even when a photo override is broader.
      and public.can_view_entry((select auth.uid()), e.user_id, e.entry_privacy::text)
      and public.can_view_entry((select auth.uid()), e.user_id,
        case entry_photos.type
          when 'label' then coalesce(e.label_photo_privacy, e.entry_privacy)
          when 'place' then coalesce(e.place_photo_privacy, e.entry_privacy)
          else e.entry_privacy end::text)
  ));

drop policy if exists "Owners can manage entry groups" on public.entry_groups;
create policy "Owners can manage entry groups" on public.entry_groups
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Authenticated users can view entry groups" on public.entry_groups;
drop policy if exists "Users can view allowed entry groups" on public.entry_groups;
create policy "Users can view allowed entry groups" on public.entry_groups
  for select to authenticated using (exists (
    select 1 from public.wine_entries e
    where e.id = entry_groups.anchor_entry_id
      and e.entry_group_id = entry_groups.id and e.user_id = entry_groups.user_id
      and public.can_view_entry((select auth.uid()), e.user_id, e.entry_privacy::text)
  ));

drop policy if exists "Owners can manage entry group slides" on public.entry_group_slides;
create policy "Owners can manage entry group slides" on public.entry_group_slides
  for all to authenticated
  using ((select auth.uid()) = (select g.user_id from public.entry_groups g where g.id = group_id))
  with check ((select auth.uid()) = (select g.user_id from public.entry_groups g where g.id = group_id));
drop policy if exists "Authenticated users can view entry group slides" on public.entry_group_slides;
drop policy if exists "Users can view allowed entry group slides" on public.entry_group_slides;
create policy "Users can view allowed entry group slides" on public.entry_group_slides
  for select to authenticated using (exists (
    -- Invoker lookups: group RLS checks its anchor, then entry RLS checks the
    -- individual slide. Neither dependency reads this table, avoiding recursion.
    select 1 from public.entry_groups g join public.wine_entries e
      on e.id = coalesce(entry_group_slides.entry_id, g.anchor_entry_id)
    where g.id = entry_group_slides.group_id
      and e.entry_group_id = g.id and e.user_id = g.user_id
      and public.can_view_entry((select auth.uid()), e.user_id, e.entry_privacy::text)
      and public.can_view_entry((select auth.uid()), e.user_id,
        case entry_group_slides.photo_type
          when 'label' then coalesce(e.label_photo_privacy, e.entry_privacy)
          when 'place' then coalesce(e.place_photo_privacy, e.entry_privacy)
          else e.entry_privacy end::text)
      -- Entry-less uploads belong to the group author, never a foreign prefix.
      and (entry_group_slides.entry_id is not null
        or split_part(entry_group_slides.path, '/', 1) = g.user_id::text)
  ));

-- No new functions, grants, data rewrites, Storage policies or helper changes.
commit;
