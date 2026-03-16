create or replace function public.apply_friend_transition(
  target_user_id uuid,
  action text
)
returns table (
  status text,
  request_id uuid,
  changed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  normalized_action text := lower(trim(coalesce(action, '')));
  now_ts timestamptz := now();
  lock_key text;
  forward_row public.friend_requests%rowtype;
  reverse_row public.friend_requests%rowtype;
  inserted_id uuid;
  removed_outgoing_count integer := 0;
  removed_incoming_count integer := 0;
begin
  if actor_id is null then
    raise exception 'FRIEND_TRANSITION_UNAUTHORIZED'
      using errcode = '42501',
            detail = 'Authenticated user required.';
  end if;

  if target_user_id is null then
    raise exception 'FRIEND_TRANSITION_TARGET_REQUIRED'
      using errcode = '22023',
            detail = 'target_user_id is required.';
  end if;

  if target_user_id = actor_id then
    raise exception 'FRIEND_TRANSITION_SELF_NOT_ALLOWED'
      using errcode = '22023',
            detail = 'Users cannot transition friendship with themselves.';
  end if;

  if normalized_action not in ('request', 'accept', 'decline', 'remove') then
    raise exception 'FRIEND_TRANSITION_INVALID_ACTION'
      using errcode = '22023',
            detail = 'Action must be one of request, accept, decline, remove.';
  end if;

  -- Serialize all transitions for this pair to avoid racey split-brain states.
  lock_key := concat(
    least(actor_id::text, target_user_id::text),
    ':',
    greatest(actor_id::text, target_user_id::text)
  );
  perform pg_advisory_xact_lock(hashtext(lock_key));

  select *
  into forward_row
  from public.friend_requests
  where requester_id = actor_id
    and recipient_id = target_user_id
  limit 1
  for update;

  select *
  into reverse_row
  from public.friend_requests
  where requester_id = target_user_id
    and recipient_id = actor_id
  limit 1
  for update;

  if normalized_action = 'request' then
    if reverse_row.id is not null and reverse_row.status in ('pending', 'accepted') then
      if reverse_row.status = 'pending' then
        update public.friend_requests as fr
        set status = 'accepted',
            responded_at = now_ts,
            seen_at = now_ts
        where fr.id = reverse_row.id
          and fr.status = 'pending';
      end if;

      delete from public.friend_requests fr
      where fr.requester_id = actor_id
        and fr.recipient_id = target_user_id
        and fr.status in ('pending', 'accepted');
      get diagnostics removed_outgoing_count = row_count;

      return query select
        'accepted'::text,
        reverse_row.id,
        (reverse_row.status = 'pending') or removed_outgoing_count > 0;
      return;
    end if;

    if forward_row.id is not null then
      if forward_row.status = 'declined' then
        delete from public.friend_requests fr
        where fr.requester_id = actor_id
          and fr.recipient_id = target_user_id
          and fr.status = 'declined';

        inserted_id := gen_random_uuid();
        insert into public.friend_requests (id, requester_id, recipient_id, status)
        values (inserted_id, actor_id, target_user_id, 'pending');

        return query select 'pending'::text, inserted_id, true;
        return;
      end if;

      return query select forward_row.status::text, forward_row.id, false;
      return;
    end if;

    inserted_id := gen_random_uuid();
    insert into public.friend_requests (id, requester_id, recipient_id, status)
    values (inserted_id, actor_id, target_user_id, 'pending');

    return query select 'pending'::text, inserted_id, true;
    return;
  end if;

  if normalized_action = 'accept' then
    if reverse_row.id is null then
      raise exception 'FRIEND_TRANSITION_NOT_FOUND'
        using errcode = 'P0002',
              detail = 'No incoming request to accept.';
    end if;

    if reverse_row.status = 'pending' then
      update public.friend_requests as fr
      set status = 'accepted',
          responded_at = now_ts,
          seen_at = now_ts
      where fr.id = reverse_row.id
        and fr.status = 'pending';

      delete from public.friend_requests fr
      where fr.requester_id = actor_id
        and fr.recipient_id = target_user_id
        and fr.status in ('pending', 'accepted');

      return query select 'accepted'::text, reverse_row.id, true;
      return;
    end if;

    if reverse_row.status = 'accepted' then
      delete from public.friend_requests fr
      where fr.requester_id = actor_id
        and fr.recipient_id = target_user_id
        and fr.status in ('pending', 'accepted');
      get diagnostics removed_outgoing_count = row_count;

      return query select 'accepted'::text, reverse_row.id, removed_outgoing_count > 0;
      return;
    end if;

    raise exception 'FRIEND_TRANSITION_CONFLICT'
      using errcode = '23514',
            detail = 'Cannot accept a declined request.';
  end if;

  if normalized_action = 'decline' then
    if reverse_row.id is null then
      raise exception 'FRIEND_TRANSITION_NOT_FOUND'
        using errcode = 'P0002',
              detail = 'No incoming request to decline.';
    end if;

    if reverse_row.status = 'pending' then
      update public.friend_requests as fr
      set status = 'declined',
          responded_at = now_ts,
          seen_at = now_ts
      where fr.id = reverse_row.id
        and fr.status = 'pending';

      delete from public.friend_requests fr
      where fr.requester_id = actor_id
        and fr.recipient_id = target_user_id
        and fr.status = 'pending';
      get diagnostics removed_outgoing_count = row_count;

      return query select 'declined'::text, reverse_row.id, true;
      return;
    end if;

    if reverse_row.status = 'declined' then
      return query select 'declined'::text, reverse_row.id, false;
      return;
    end if;

    raise exception 'FRIEND_TRANSITION_CONFLICT'
      using errcode = '23514',
            detail = 'Cannot decline an accepted request.';
  end if;

  delete from public.friend_requests fr
  where fr.requester_id = actor_id
    and fr.recipient_id = target_user_id
    and fr.status in ('pending', 'accepted');
  get diagnostics removed_outgoing_count = row_count;

  delete from public.friend_requests fr
  where fr.requester_id = target_user_id
    and fr.recipient_id = actor_id
    and fr.status in ('pending', 'accepted');
  get diagnostics removed_incoming_count = row_count;

  return query
  select
    'none'::text,
    coalesce(
      case
        when reverse_row.status in ('pending', 'accepted') then reverse_row.id
        else null
      end,
      case
        when forward_row.status in ('pending', 'accepted') then forward_row.id
        else null
      end
    ),
    removed_outgoing_count > 0 or removed_incoming_count > 0;
  return;
end;
$$;

revoke all on function public.apply_friend_transition(uuid, text) from public;
grant execute on function public.apply_friend_transition(uuid, text) to authenticated;
grant execute on function public.apply_friend_transition(uuid, text) to service_role;
