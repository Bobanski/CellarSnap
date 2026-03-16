-- Re-tagging the same user on the same entry should surface the alert again.
-- Keep one row per (user, entry, type) and reopen it by clearing seen_at.

create or replace function public.handle_wine_tag_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  added uuid[];
  root_author_id uuid;
begin
  if tg_op = 'INSERT' then
    added := new.tasted_with_user_ids;
  else
    added := array(
      select unnest(coalesce(new.tasted_with_user_ids, '{}'::uuid[]))
      except
      select unnest(coalesce(old.tasted_with_user_ids, '{}'::uuid[]))
    );
  end if;

  if added is null then
    return new;
  end if;

  root_author_id := null;
  if new.root_entry_id is not null then
    select user_id into root_author_id
    from public.wine_entries
    where id = new.root_entry_id;
  end if;

  insert into public.wine_notifications (user_id, entry_id, actor_id, type)
  select tag_id, new.id, new.user_id, 'tagged'
  from unnest(added) as tag_id
  where tag_id is not null
    and tag_id <> new.user_id
    and not (root_author_id is not null and tag_id = root_author_id)
  on conflict (user_id, entry_id, type) do update
    set actor_id = excluded.actor_id,
        created_at = now(),
        seen_at = null;

  return new;
end;
$$;
