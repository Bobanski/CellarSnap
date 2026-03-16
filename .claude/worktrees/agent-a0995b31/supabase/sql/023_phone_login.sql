alter table public.profiles
  add column if not exists phone text;

comment on column public.profiles.phone is
  'Phone number normalized to E.164 format (for example: +14155551234).';

create unique index if not exists profiles_phone_unique
  on public.profiles (phone)
  where phone is not null;

create or replace function public.is_phone_available(phone text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
begin
  normalized := trim(phone);
  if normalized is null or normalized = '' then
    return false;
  end if;
  if normalized !~ '^\+[1-9][0-9]{7,14}$' then
    return false;
  end if;
  return not exists (
    select 1
    from public.profiles
    where profiles.phone = normalized
  );
end;
$$;

create or replace function public.get_email_for_phone(phone text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized text;
  result text;
begin
  normalized := trim(phone);
  if normalized is null or normalized = '' then
    return null;
  end if;
  if normalized !~ '^\+[1-9][0-9]{7,14}$' then
    return null;
  end if;

  select users.email into result
  from public.profiles profiles
  join auth.users users on users.id = profiles.id
  where profiles.phone = normalized
  order by profiles.id
  limit 1;

  return result;
end;
$$;

create or replace function public.handle_auth_user_phone_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set phone = new.phone
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_phone_updated on auth.users;

create trigger on_auth_user_phone_updated
  after update of phone on auth.users
  for each row
  when (old.phone is distinct from new.phone)
  execute procedure public.handle_auth_user_phone_update();

update public.profiles profiles
set phone = users.phone
from auth.users users
where users.id = profiles.id
  and users.phone is not null
  and profiles.phone is distinct from users.phone;

grant execute on function public.is_phone_available(text) to anon, authenticated;
grant execute on function public.get_email_for_phone(text) to anon, authenticated;
