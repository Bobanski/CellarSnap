-- Targeted live function baseline, rbmkypbqavmnuycznssv, 2026-09-12.
-- Catalog definitions only; no user rows. Test fixture, NOT a production migration.
-- See docs/remediation/b02a-access-contract.md for capture query and scope.

CREATE OR REPLACE FUNCTION public.are_friends(user_a uuid, user_b uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.can_view_entry(viewer_id uuid, owner_id uuid, privacy text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.can_view_entry_standard(viewer_id, owner_id, privacy) then
    return true;
  end if;

  if viewer_id is null or owner_id is null then
    return false;
  end if;

  if public.is_user_blocked(viewer_id, owner_id) then
    return false;
  end if;

  if not public.can_view_test_authored_content(viewer_id, owner_id) then
    return false;
  end if;

  return public.is_test_account(viewer_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.can_view_entry_standard(viewer_id uuid, owner_id uuid, privacy text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  normalized_privacy text;
begin
  if viewer_id is null or owner_id is null then
    return false;
  end if;

  if public.is_user_blocked(viewer_id, owner_id) then
    return false;
  end if;

  if not public.can_view_test_authored_content(viewer_id, owner_id) then
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
    return public.are_friends(viewer_id, owner_id);
  end if;

  if normalized_privacy = 'friends_of_friends' then
    if public.are_friends(viewer_id, owner_id) then
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

CREATE OR REPLACE FUNCTION public.can_view_test_authored_content(viewer_id uuid, owner_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if viewer_id is null or owner_id is null then
    return false;
  end if;

  if viewer_id = owner_id then
    return true;
  end if;

  if not public.is_test_account(owner_id) then
    return true;
  end if;

  return public.is_test_account(viewer_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_test_account(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.is_user_blocked(viewer_id uuid, target_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
