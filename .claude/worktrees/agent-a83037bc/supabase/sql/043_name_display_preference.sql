alter table public.profiles
  add column if not exists name_display_preference text not null default 'real_name';

update public.profiles
set name_display_preference = 'real_name'
where name_display_preference is null
  or name_display_preference not in ('real_name', 'username');

alter table public.profiles
  drop constraint if exists profiles_name_display_preference_check;

alter table public.profiles
  add constraint profiles_name_display_preference_check
  check (name_display_preference in ('real_name', 'username'));

comment on column public.profiles.name_display_preference is
  'Controls whether social surfaces show the user''s real name or username.';

drop view if exists public.public_profiles;

create view public.public_profiles as
select
  id,
  case
    when coalesce(name_display_preference, 'real_name') = 'real_name'
      and nullif(btrim(first_name), '') is not null
    then concat(
      btrim(first_name),
      case
        when nullif(btrim(last_name), '') is not null
        then ' ' || upper(left(btrim(last_name), 1)) || '.'
        else ''
      end
    )
    else nullif(btrim(display_name), '')
  end as display_name,
  nullif(btrim(display_name), '') as username,
  first_name,
  last_name,
  name_display_preference,
  avatar_path,
  created_at,
  null::text as email
from public.profiles;

grant select on public.public_profiles to authenticated;
revoke all on public.public_profiles from anon;
