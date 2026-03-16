-- Deprecate the legacy follows table.
-- Friendship source-of-truth is accepted rows in public.friend_requests.

create or replace function public.are_friends(user_a uuid, user_b uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
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
$$;

drop table if exists public.user_follows;

comment on table public.friend_requests is
  'Source of truth for friendship. Accepted rows represent active friendships.';
