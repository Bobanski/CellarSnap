-- AUD-06 / B02f: move policy helper identities into a non-exposed schema.
-- ALTER ... SET SCHEMA preserves function OIDs, so existing policy dependencies
-- move with them without recreating/changing their access expressions.
-- Service-only public facades preserve privileged internal/legacy callers.
begin;

do $$ begin
  if to_regprocedure('private.is_test_account(uuid)') is null then
    if to_regprocedure('public.is_test_account(uuid)') is null then
      raise exception 'Missing B02f predecessor: is_test_account';
    end if;
    alter function public.is_test_account(uuid) set schema private;
  end if;
end $$;

do $$ begin
  if to_regprocedure('private.is_user_blocked(uuid, uuid)') is null then
    if to_regprocedure('public.is_user_blocked(uuid, uuid)') is null then
      raise exception 'Missing B02f predecessor: is_user_blocked';
    end if;
    alter function public.is_user_blocked(uuid, uuid) set schema private;
  end if;
end $$;

do $$ begin
  if to_regprocedure('private.are_friends(uuid, uuid)') is null then
    if to_regprocedure('public.are_friends(uuid, uuid)') is null then
      raise exception 'Missing B02f predecessor: are_friends';
    end if;
    alter function public.are_friends(uuid, uuid) set schema private;
  end if;
end $$;

do $$ begin
  if to_regprocedure('private.can_view_test_authored_content(uuid, uuid)') is null then
    if to_regprocedure('public.can_view_test_authored_content(uuid, uuid)') is null then
      raise exception 'Missing B02f predecessor: can_view_test_authored_content';
    end if;
    alter function public.can_view_test_authored_content(uuid, uuid) set schema private;
  end if;
end $$;

do $$ begin
  if to_regprocedure('private.can_view_entry_standard(uuid, uuid, text)') is null then
    if to_regprocedure('public.can_view_entry_standard(uuid, uuid, text)') is null then
      raise exception 'Missing B02f predecessor: can_view_entry_standard';
    end if;
    alter function public.can_view_entry_standard(uuid, uuid, text) set schema private;
  end if;
end $$;

do $$ begin
  if to_regprocedure('private.can_view_entry(uuid, uuid, text)') is null then
    if to_regprocedure('public.can_view_entry(uuid, uuid, text)') is null then
      raise exception 'Missing B02f predecessor: can_view_entry';
    end if;
    alter function public.can_view_entry(uuid, uuid, text) set schema private;
  end if;
end $$;

CREATE OR REPLACE FUNCTION private.is_test_account(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if user_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.profiles
    where id = user_id
      and coalesce(is_test_account, false)
  );
end;
$function$
;
revoke all on function private.is_test_account(uuid) from public, anon;
grant execute on function private.is_test_account(uuid) to authenticated, service_role;

create or replace function public.is_test_account(user_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.is_test_account(user_id);
$$;
revoke all on function public.is_test_account(uuid) from public, anon, authenticated;
grant execute on function public.is_test_account(uuid) to service_role;

CREATE OR REPLACE FUNCTION private.is_user_blocked(viewer_id uuid, target_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if viewer_id is null or target_id is null then
    return false;
  end if;

  if viewer_id = target_id then
    return false;
  end if;

  return exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = viewer_id and b.blocked_id = target_id)
       or (b.blocker_id = target_id and b.blocked_id = viewer_id)
  );
end;
$function$
;
revoke all on function private.is_user_blocked(uuid, uuid) from public, anon;
grant execute on function private.is_user_blocked(uuid, uuid) to authenticated, service_role;

create or replace function public.is_user_blocked(viewer_id uuid, target_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.is_user_blocked(viewer_id, target_id);
$$;
revoke all on function public.is_user_blocked(uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_user_blocked(uuid, uuid) to service_role;

CREATE OR REPLACE FUNCTION private.are_friends(user_a uuid, user_b uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if user_a is null or user_b is null then
    return false;
  end if;

  if user_a = user_b then
    return true;
  end if;

  return exists (
    select 1
    from public.friend_requests fr
    where fr.status = 'accepted'
      and (
        (fr.requester_id = user_a and fr.recipient_id = user_b)
        or
        (fr.requester_id = user_b and fr.recipient_id = user_a)
      )
  );
end;
$function$
;
revoke all on function private.are_friends(uuid, uuid) from public, anon;
grant execute on function private.are_friends(uuid, uuid) to authenticated, service_role;

create or replace function public.are_friends(user_a uuid, user_b uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.are_friends(user_a, user_b);
$$;
revoke all on function public.are_friends(uuid, uuid) from public, anon, authenticated;
grant execute on function public.are_friends(uuid, uuid) to service_role;

CREATE OR REPLACE FUNCTION private.can_view_test_authored_content(viewer_id uuid, owner_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if viewer_id is null or owner_id is null then
    return false;
  end if;

  if viewer_id = owner_id then
    return true;
  end if;

  if not private.is_test_account(owner_id) then
    return true;
  end if;

  return private.is_test_account(viewer_id);
end;
$function$
;
revoke all on function private.can_view_test_authored_content(uuid, uuid) from public, anon;
grant execute on function private.can_view_test_authored_content(uuid, uuid) to authenticated, service_role;

create or replace function public.can_view_test_authored_content(viewer_id uuid, owner_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.can_view_test_authored_content(viewer_id, owner_id);
$$;
revoke all on function public.can_view_test_authored_content(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_view_test_authored_content(uuid, uuid) to service_role;

CREATE OR REPLACE FUNCTION private.can_view_entry_standard(viewer_id uuid, owner_id uuid, privacy text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  normalized_privacy text;
begin
  if viewer_id is null or owner_id is null then
    return false;
  end if;

  if private.is_user_blocked(viewer_id, owner_id) then
    return false;
  end if;

  if not private.can_view_test_authored_content(viewer_id, owner_id) then
    return false;
  end if;

  if viewer_id = owner_id then
    return true;
  end if;

  normalized_privacy := lower(coalesce(privacy, ''));

  if normalized_privacy = 'public' then
    return true;
  end if;

  if normalized_privacy = 'friends' then
    return private.are_friends(viewer_id, owner_id);
  end if;

  if normalized_privacy = 'friends_of_friends' then
    if private.are_friends(viewer_id, owner_id) then
      return true;
    end if;

    return exists (
      with viewer_friends as (
        select case
          when fr.requester_id = viewer_id then fr.recipient_id
          else fr.requester_id
        end as friend_id
        from public.friend_requests fr
        where fr.status = 'accepted'
          and (fr.requester_id = viewer_id or fr.recipient_id = viewer_id)
      ),
      owner_friends as (
        select case
          when fr.requester_id = owner_id then fr.recipient_id
          else fr.requester_id
        end as friend_id
        from public.friend_requests fr
        where fr.status = 'accepted'
          and (fr.requester_id = owner_id or fr.recipient_id = owner_id)
      )
      select 1
      from viewer_friends vf
      join owner_friends ofr
        on ofr.friend_id = vf.friend_id
      where vf.friend_id <> viewer_id
        and vf.friend_id <> owner_id
      limit 1
    );
  end if;

  return false;
end;
$function$
;
revoke all on function private.can_view_entry_standard(uuid, uuid, text) from public, anon;
grant execute on function private.can_view_entry_standard(uuid, uuid, text) to authenticated, service_role;

create or replace function public.can_view_entry_standard(viewer_id uuid, owner_id uuid, privacy text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.can_view_entry_standard(viewer_id, owner_id, privacy);
$$;
revoke all on function public.can_view_entry_standard(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.can_view_entry_standard(uuid, uuid, text) to service_role;

CREATE OR REPLACE FUNCTION private.can_view_entry(viewer_id uuid, owner_id uuid, privacy text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if private.can_view_entry_standard(viewer_id, owner_id, privacy) then
    return true;
  end if;

  if viewer_id is null or owner_id is null then
    return false;
  end if;

  if private.is_user_blocked(viewer_id, owner_id) then
    return false;
  end if;

  if not private.can_view_test_authored_content(viewer_id, owner_id) then
    return false;
  end if;

  return private.is_test_account(viewer_id);
end;
$function$
;
revoke all on function private.can_view_entry(uuid, uuid, text) from public, anon;
grant execute on function private.can_view_entry(uuid, uuid, text) to authenticated, service_role;

create or replace function public.can_view_entry(viewer_id uuid, owner_id uuid, privacy text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.can_view_entry(viewer_id, owner_id, privacy);
$$;
revoke all on function public.can_view_entry(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.can_view_entry(uuid, uuid, text) to service_role;

-- Fail closed if any captured policy still depends on an exposed facade.
do $$ begin
  if exists (
    select 1 from pg_depend d
    join pg_policy p on d.classid='pg_policy'::regclass and d.objid=p.oid
    join pg_proc f on d.refclassid='pg_proc'::regclass and d.refobjid=f.oid
    join pg_namespace n on n.oid=f.pronamespace
    where n.nspname='public' and f.proname = any(array[
      'is_test_account','is_user_blocked','are_friends',
      'can_view_test_authored_content','can_view_entry_standard','can_view_entry'])
  ) then raise exception 'Public helper policy dependency remains'; end if;
end $$;
commit;
