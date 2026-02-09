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
  if username is null or length(trim(username)) < 3 then
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
set search_path = public
as $$
declare
  result text;
begin
  select email into result
  from public.profiles
  where lower(display_name) = lower(trim(username))
  limit 1;
  return result;
end;
$$;

grant execute on function public.is_username_available(text) to anon, authenticated;
grant execute on function public.get_email_for_username(text) to anon, authenticated;
