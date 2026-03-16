alter table public.profiles enable row level security;

drop policy if exists "Authenticated users can view profiles" on public.profiles;
drop policy if exists "Users can view their own profile" on public.profiles;

create policy "Users can view their own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

drop view if exists public.public_profiles;

create view public.public_profiles as
select
  id,
  display_name,
  first_name,
  last_name,
  avatar_path,
  created_at,
  null::text as email
from public.profiles;

grant select on public.public_profiles to authenticated;
revoke all on public.public_profiles from anon;
