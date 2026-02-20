-- User blocking + lightweight moderation reports.
-- Blocking hides content in both directions and report rows capture post/comment flags.

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_created_idx
  on public.user_blocks (blocked_id, created_at desc);

alter table public.user_blocks enable row level security;

drop policy if exists "Users can read own blocks" on public.user_blocks;
create policy "Users can read own blocks"
  on public.user_blocks
  for select
  using (auth.uid() = blocker_id);

drop policy if exists "Users can create own blocks" on public.user_blocks;
create policy "Users can create own blocks"
  on public.user_blocks
  for insert
  with check (auth.uid() = blocker_id and blocker_id <> blocked_id);

drop policy if exists "Users can delete own blocks" on public.user_blocks;
create policy "Users can delete own blocks"
  on public.user_blocks
  for delete
  using (auth.uid() = blocker_id);

grant select, insert, delete on table public.user_blocks to authenticated;

create or replace function public.is_user_blocked(
  viewer_id uuid,
  target_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
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
$$;

create or replace function public.can_view_entry(
  viewer_id uuid,
  owner_id uuid,
  privacy text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_privacy text;
begin
  if viewer_id is null or owner_id is null then
    return false;
  end if;

  if public.is_user_blocked(viewer_id, owner_id) then
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
$$;

drop policy if exists "Users can view entry comments for allowed audience" on public.entry_comments;
create policy "Users can view entry comments for allowed audience"
  on public.entry_comments
  for select
  using (
    not public.is_user_blocked(auth.uid(), entry_comments.user_id)
    and exists (
      select 1
      from public.wine_entries e
      where e.id = entry_comments.entry_id
        and public.can_view_entry(auth.uid(), e.user_id, e.entry_privacy::text)
        and public.can_view_entry(
          auth.uid(),
          e.user_id,
          coalesce(
            e.comments_privacy::text,
            case
              when coalesce(e.comments_scope, 'viewers') = 'friends'
                   and coalesce(e.entry_privacy::text, 'public') <> 'private'
                then 'friends'
              else coalesce(e.entry_privacy::text, 'public')
            end
          )
        )
    )
  );

drop policy if exists "Users can add comments for allowed audience" on public.entry_comments;
create policy "Users can add comments for allowed audience"
  on public.entry_comments
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.wine_entries e
      where e.id = entry_comments.entry_id
        and public.can_view_entry(auth.uid(), e.user_id, e.entry_privacy::text)
        and public.can_view_entry(
          auth.uid(),
          e.user_id,
          coalesce(
            e.comments_privacy::text,
            case
              when coalesce(e.comments_scope, 'viewers') = 'friends'
                   and coalesce(e.entry_privacy::text, 'public') <> 'private'
                then 'friends'
              else coalesce(e.entry_privacy::text, 'public')
            end
          )
        )
    )
  );

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('entry', 'comment')),
  entry_id uuid references public.wine_entries(id) on delete set null,
  comment_id uuid references public.entry_comments(id) on delete set null,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  details text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  check (reporter_id <> target_user_id),
  check (
    (target_type = 'entry' and entry_id is not null and comment_id is null)
    or (target_type = 'comment' and comment_id is not null)
  ),
  check (reason is null or char_length(reason) <= 200),
  check (details is null or char_length(details) <= 2000)
);

create index if not exists content_reports_reporter_created_idx
  on public.content_reports (reporter_id, created_at desc);

create index if not exists content_reports_target_idx
  on public.content_reports (target_type, entry_id, comment_id, created_at desc);

alter table public.content_reports enable row level security;

drop policy if exists "Users can insert own content reports" on public.content_reports;
create policy "Users can insert own content reports"
  on public.content_reports
  for insert
  with check (auth.uid() = reporter_id);

drop policy if exists "Users can read own content reports" on public.content_reports;
create policy "Users can read own content reports"
  on public.content_reports
  for select
  using (auth.uid() = reporter_id);

grant select, insert on table public.content_reports to authenticated;
