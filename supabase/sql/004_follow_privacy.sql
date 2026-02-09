do $$
begin
  create type public.privacy_level as enum ('public', 'friends', 'private');
exception
  when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists default_entry_privacy public.privacy_level not null default 'public';

alter table public.wine_entries
  add column if not exists entry_privacy public.privacy_level not null default 'public',
  add column if not exists label_photo_privacy public.privacy_level,
  add column if not exists place_photo_privacy public.privacy_level;

create table if not exists public.user_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index if not exists user_follows_followee_id_idx
  on public.user_follows (followee_id, follower_id);

create index if not exists wine_entries_user_privacy_idx
  on public.wine_entries (user_id, entry_privacy);

alter table public.user_follows enable row level security;

drop policy if exists "Users can read own follow relationships" on public.user_follows;
create policy "Users can read own follow relationships"
  on public.user_follows
  for select
  using (auth.uid() = follower_id or auth.uid() = followee_id);

drop policy if exists "Users can follow others" on public.user_follows;
create policy "Users can follow others"
  on public.user_follows
  for insert
  with check (auth.uid() = follower_id and follower_id <> followee_id);

drop policy if exists "Users can unfollow others" on public.user_follows;
create policy "Users can unfollow others"
  on public.user_follows
  for delete
  using (auth.uid() = follower_id);

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
    from public.user_follows f1
    join public.user_follows f2
      on f1.follower_id = f2.followee_id
     and f1.followee_id = f2.follower_id
    where f1.follower_id = user_a
      and f1.followee_id = user_b
  );
end;
$$;

create or replace function public.can_view_entry(
  viewer_id uuid,
  owner_id uuid,
  privacy public.privacy_level
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if viewer_id is null or owner_id is null then
    return false;
  end if;

  if viewer_id = owner_id then
    return true;
  end if;

  if privacy = 'public' then
    return true;
  end if;

  if privacy = 'friends' then
    return public.are_friends(viewer_id, owner_id);
  end if;

  return false;
end;
$$;

create or replace function public.can_view_wine_photo(
  object_name text,
  viewer_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner_text text;
  entry_text text;
  file_name text;
  owner_uuid uuid;
  entry_uuid uuid;
  entry_row public.wine_entries%rowtype;
  effective_privacy public.privacy_level;
begin
  if viewer_id is null or object_name is null then
    return false;
  end if;

  owner_text := split_part(object_name, '/', 1);
  entry_text := split_part(object_name, '/', 2);
  file_name := split_part(object_name, '/', 3);

  if owner_text = '' or entry_text = '' then
    return false;
  end if;

  begin
    owner_uuid := owner_text::uuid;
    entry_uuid := entry_text::uuid;
  exception
    when others then
      return false;
  end;

  select *
    into entry_row
    from public.wine_entries
   where id = entry_uuid
     and user_id = owner_uuid;

  if not found then
    return false;
  end if;

  if file_name like 'label.%' then
    effective_privacy := coalesce(entry_row.label_photo_privacy, entry_row.entry_privacy);
  elsif file_name like 'place.%' then
    effective_privacy := coalesce(entry_row.place_photo_privacy, entry_row.entry_privacy);
  else
    effective_privacy := entry_row.entry_privacy;
  end if;

  return public.can_view_entry(viewer_id, owner_uuid, effective_privacy);
end;
$$;

drop policy if exists "Users can view own wine entries" on public.wine_entries;
drop policy if exists "Authenticated users can view wine entries" on public.wine_entries;
drop policy if exists "Users can view allowed wine entries" on public.wine_entries;
create policy "Users can view allowed wine entries"
  on public.wine_entries
  for select
  using (public.can_view_entry(auth.uid(), user_id, entry_privacy));

drop policy if exists "Users can update own wine entries" on public.wine_entries;
create policy "Users can update own wine entries"
  on public.wine_entries
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Authenticated users can read wine photos" on storage.objects;
drop policy if exists "Users can read allowed wine photos" on storage.objects;
create policy "Users can read allowed wine photos"
  on storage.objects
  for select
  using (
    bucket_id = 'wine-photos'
    and auth.uid() is not null
    and public.can_view_wine_photo(name, auth.uid())
  );
