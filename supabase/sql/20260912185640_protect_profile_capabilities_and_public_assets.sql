-- Audit findings 02 and 03. Forward-only; no existing profile flags are changed.
begin;

create schema if not exists private;

create or replace function private.protect_profile_capabilities()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Use the database role, never user-editable metadata or a submitted user ID.
  -- Auth hooks / service-role administration can continue maintaining this flag.
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if coalesce(new.is_test_account, false) then
        raise exception 'Account capabilities can only be assigned by an administrator'
          using errcode = '42501';
      end if;
    elsif new.is_test_account is distinct from old.is_test_account then
      raise exception 'Account capabilities can only be changed by an administrator'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.protect_profile_capabilities() from public, anon, authenticated;
drop trigger if exists profiles_protect_capabilities on public.profiles;
create trigger profiles_protect_capabilities
before insert or update on public.profiles
for each row execute function private.protect_profile_capabilities();

-- These policies were named for service_role but actually granted writes to PUBLIC.
-- service_role already bypasses RLS; public read access is intentionally retained.
drop policy if exists "Service role can upload to public-assets" on storage.objects;
drop policy if exists "Service role can update public-assets" on storage.objects;

commit;
