-- AUD-06 / B02c2. Preserve legacy select columns, but never expose private
-- identity fields or allow writes through the public projection.
begin;

-- The base table remains owner-only. This narrow private-schema reader is the
-- intentional social projection boundary; it accepts no caller-supplied viewer
-- identity and returns only the same safe fields as the public view.
create or replace function private.read_public_profiles()
returns table (
  id uuid, display_name text, username text, first_name text, last_name text,
  name_display_preference text, avatar_path text, created_at timestamptz,
  email text, is_test_account boolean
)
language sql stable security definer
set search_path = ''
as $$
  select p.id,
    case when p.name_display_preference = 'real_name'
      and nullif(btrim(p.first_name), '') is not null
    then concat(btrim(p.first_name), case when nullif(btrim(p.last_name), '') is not null
      then ' ' || upper(left(btrim(p.last_name), 1)) || '.' else '' end)
    else nullif(btrim(p.display_name), '') end,
    nullif(btrim(p.display_name), ''), null::text, null::text,
    p.name_display_preference, p.avatar_path, p.created_at, null::text,
    case when p.id = (select auth.uid())
      or (select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'service_role'
      then p.is_test_account else null::boolean end
  from public.profiles p
  where
    (select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'service_role'
    or ((select auth.uid()) is not null and (
      p.id = (select auth.uid()) or (
        not public.is_user_blocked((select auth.uid()), p.id)
        and public.can_view_test_authored_content((select auth.uid()), p.id)
      )
    ));
$$;

revoke all on function private.read_public_profiles() from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.read_public_profiles() to authenticated, service_role;

create or replace view public.public_profiles
with (security_invoker = true, security_barrier = true) as
select * from private.read_public_profiles();

-- Historical default grants include INSERT/UPDATE/DELETE on this view.
-- Drop column grants too: revoking table grants alone does not remove them.
revoke all on public.public_profiles from public, anon, authenticated, service_role;
revoke all (id, display_name, username, first_name, last_name,
  name_display_preference, avatar_path, created_at, email, is_test_account)
  on public.public_profiles from public, anon, authenticated, service_role;
grant select on public.public_profiles to authenticated, service_role;
comment on view public.public_profiles is
  'Read-only social projection. Private identity fields are null; blocks and trusted-test visibility apply. Owner edits use profiles.';

commit;
