create unique index if not exists profiles_display_name_unique
  on public.profiles (lower(display_name))
  where display_name is not null;

create or replace function public.is_username_available(username text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if username is null
    or length(trim(username)) < 3
    or trim(username) ~ '\s'
    or position('@' in trim(username)) > 0
  then
    return false;
  end if;
  return not exists (
    select 1
    from public.profiles
    where lower(display_name) = lower(trim(username))
  );
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
  select users.email into result
  from public.profiles profiles
  join auth.users users on users.id = profiles.id
  where lower(profiles.display_name) = lower(trim(username))
  order by profiles.id
  limit 1;
  return result;
end;
$$;

create or replace function public.handle_auth_user_email_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute procedure public.handle_auth_user_email_update();

update public.profiles profiles
set email = users.email
from auth.users users
where users.id = profiles.id
  and profiles.email is distinct from users.email;

grant execute on function public.is_username_available(text) to anon, authenticated;
grant execute on function public.get_email_for_username(text) to anon, authenticated;
