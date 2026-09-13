-- AUD-05: contact resolution and deliberate availability checks are backend-only.
-- Deploy API clients first, then apply this migration. No source rows change.
begin;
alter function public.get_email_for_phone(text) set search_path = '';
revoke all on function public.get_email_for_phone(text) from public, anon, authenticated;
grant execute on function public.get_email_for_phone(text) to service_role;
alter function public.get_email_for_username(text) set search_path = '';
revoke all on function public.get_email_for_username(text) from public, anon, authenticated;
grant execute on function public.get_email_for_username(text) to service_role;
alter function public.get_phone_for_email(text) set search_path = '';
revoke all on function public.get_phone_for_email(text) from public, anon, authenticated;
grant execute on function public.get_phone_for_email(text) to service_role;
alter function public.get_phone_for_username(text) set search_path = '';
revoke all on function public.get_phone_for_username(text) from public, anon, authenticated;
grant execute on function public.get_phone_for_username(text) to service_role;
alter function public.is_phone_available(text) set search_path = '';
revoke all on function public.is_phone_available(text) from public, anon, authenticated;
grant execute on function public.is_phone_available(text) to service_role;
alter function public.is_username_available(text) set search_path = '';
revoke all on function public.is_username_available(text) from public, anon, authenticated;
grant execute on function public.is_username_available(text) to service_role;
CREATE OR REPLACE FUNCTION public.get_email_for_phone(phone text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  normalized text;
  result text;
begin
  normalized := trim(phone);
  if normalized is null or normalized = '' then
    return null;
  end if;
  if normalized !~ '^[+][1-9][0-9]{7,14}$' then
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
$function$
;
CREATE OR REPLACE FUNCTION public.is_phone_available(phone text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  normalized text;
begin
  normalized := trim(phone);
  if normalized is null or normalized = '' then
    return false;
  end if;
  if normalized !~ '^[+][1-9][0-9]{7,14}$' then
    return false;
  end if;
  return not exists (
    select 1
    from public.profiles
    where profiles.phone = normalized
  );
end;
$function$
;
commit;
