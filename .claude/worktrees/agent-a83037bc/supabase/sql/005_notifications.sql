create table if not exists public.wine_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references public.wine_entries(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'tagged',
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

create unique index if not exists wine_notifications_unique_tag
  on public.wine_notifications (user_id, entry_id, type);

alter table public.wine_notifications enable row level security;

drop policy if exists "Users can view their notifications" on public.wine_notifications;
create policy "Users can view their notifications"
  on public.wine_notifications
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update their notifications" on public.wine_notifications;
create policy "Users can update their notifications"
  on public.wine_notifications
  for update
  using (auth.uid() = user_id);

create or replace function public.handle_wine_tag_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  added uuid[];
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

  insert into public.wine_notifications (user_id, entry_id, actor_id, type)
  select tag_id, new.id, new.user_id, 'tagged'
  from unnest(added) as tag_id
  where tag_id is not null and tag_id <> new.user_id
  on conflict (user_id, entry_id, type) do nothing;

  return new;
end;
$$;

drop trigger if exists wine_entries_tag_notifications on public.wine_entries;
create trigger wine_entries_tag_notifications
  after insert or update of tasted_with_user_ids
  on public.wine_entries
  for each row execute procedure public.handle_wine_tag_notifications();
