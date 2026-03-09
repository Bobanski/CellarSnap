-- Shared tasting copies should preserve the original tasting group without
-- generating fresh "tagged" notifications for people already on the canonical
-- root post.

create or replace function public.handle_wine_tag_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  added uuid[];
  root_author_id uuid;
  root_tagged_user_ids uuid[];
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
  root_tagged_user_ids := '{}'::uuid[];
  if new.root_entry_id is not null then
    select
      user_id,
      coalesce(tasted_with_user_ids, '{}'::uuid[])
    into
      root_author_id,
      root_tagged_user_ids
    from public.wine_entries
    where id = new.root_entry_id;
  end if;

  insert into public.wine_notifications (user_id, entry_id, actor_id, type)
  select tag_id, new.id, new.user_id, 'tagged'
  from unnest(added) as tag_id
  where tag_id is not null
    and tag_id <> new.user_id
    and not (root_author_id is not null and tag_id = root_author_id)
    and not (new.root_entry_id is not null and tag_id = any(root_tagged_user_ids))
  on conflict (user_id, entry_id, type) do update
    set actor_id = excluded.actor_id,
        created_at = now(),
        seen_at = null;

  return new;
end;
$$;
