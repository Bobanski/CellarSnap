-- AUD-01 / B02a: restore entry-row privacy using the deployed access contract.
-- Apply AFTER 20260912185640_protect_profile_capabilities_and_public_assets.sql.
-- Storage, grouped slides and public-field projection are separate B02 slices.
begin;

-- can_view_entry intentionally grants trusted test viewers extra read access.
-- Refuse a partial rollout that leaves that capability client-editable (AUD-03).
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'profiles_protect_capabilities'
      and tgfoid = to_regprocedure('private.protect_profile_capabilities()')
      and tgenabled in ('O', 'A')
      and not tgisinternal
  ) then
    raise exception 'Apply the profile capability protection migration before entry privacy';
  end if;

  -- Permissive SELECT/ALL policies combine with OR. Stop on unreviewed drift
  -- instead of leaving a second policy that silently bypasses this repair.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'wine_entries'
      and cmd in ('SELECT', 'ALL')
      and policyname not in (
        'Users can view own wine entries',
        'Authenticated users can view wine entries',
        'Users can view allowed wine entries'
      )
  ) then
    raise exception 'Unreviewed wine_entries read policy; capture and reconcile policy drift first';
  end if;
end;
$$;

alter table public.wine_entries enable row level security;
drop policy if exists "Users can view own wine entries" on public.wine_entries;
drop policy if exists "Authenticated users can view wine entries" on public.wine_entries;
drop policy if exists "Users can view allowed wine entries" on public.wine_entries;
create policy "Users can view allowed wine entries"
  on public.wine_entries
  for select
  to authenticated
  using (public.can_view_entry((select auth.uid()), user_id, entry_privacy::text));

-- Existing owner-only INSERT/UPDATE/DELETE and backend grants are preserved.
-- An original and a shared copy each retain their own owner/privacy boundary;
-- a root_entry_id, tag, or group membership does not grant access to other rows.
commit;
