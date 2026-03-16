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

  select coalesce(users.email, profiles.email) into result
  from public.profiles profiles
  join auth.users users on users.id = profiles.id
  where profiles.phone = normalized
  order by profiles.id
  limit 1;

  return result;
end;
$$;

create or replace function public.get_email_for_username(username text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result text;
begin
  select coalesce(users.email, profiles.email) into result
  from public.profiles profiles
  join auth.users users on users.id = profiles.id
  where lower(profiles.display_name) = lower(trim(username))
  order by profiles.id
  limit 1;
  return result;
end;
$$;

create or replace function public.get_phone_for_username(username text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result text;
begin
  select coalesce(users.phone, profiles.phone) into result
  from public.profiles profiles
  join auth.users users on users.id = profiles.id
  where lower(profiles.display_name) = lower(trim(username))
  order by profiles.id
  limit 1;
  return result;
end;
$$;

create or replace function public.get_phone_for_email(email text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized text;
  result text;
begin
  normalized := lower(trim(email));
  if normalized is null or normalized = '' then
    return null;
  end if;

  select coalesce(users.phone, profiles.phone) into result
  from public.profiles profiles
  join auth.users users on users.id = profiles.id
  where lower(coalesce(users.email, profiles.email, '')) = normalized
  order by profiles.id
  limit 1;

  return result;
end;
$$;

grant execute on function public.get_email_for_phone(text) to anon, authenticated;
grant execute on function public.get_email_for_username(text) to anon, authenticated;
grant execute on function public.get_phone_for_username(text) to anon, authenticated;
grant execute on function public.get_phone_for_email(text) to anon, authenticated;
