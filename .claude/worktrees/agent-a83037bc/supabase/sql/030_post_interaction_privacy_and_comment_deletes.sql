-- Add friends-of-friends privacy and per-post interaction privacy controls.
-- Also support soft-deleting top-level comments that have replies.

alter type public.privacy_level add value if not exists 'friends_of_friends';

alter table public.wine_entries
  add column if not exists reaction_privacy public.privacy_level,
  add column if not exists comments_privacy public.privacy_level;

update public.wine_entries
set reaction_privacy = coalesce(
  reaction_privacy,
  case lower(coalesce(entry_privacy::text, 'public'))
    when 'public' then 'public'::public.privacy_level
    when 'friends' then 'friends'::public.privacy_level
    when 'private' then 'private'::public.privacy_level
    else 'friends'::public.privacy_level
  end
);

update public.wine_entries
set comments_privacy = coalesce(
  comments_privacy,
  case
    when coalesce(comments_scope, 'viewers') = 'friends'
         and lower(coalesce(entry_privacy::text, 'public')) <> 'private'
      then 'friends'::public.privacy_level
    else case lower(coalesce(entry_privacy::text, 'public'))
      when 'public' then 'public'::public.privacy_level
      when 'friends' then 'friends'::public.privacy_level
      when 'private' then 'private'::public.privacy_level
      else 'friends'::public.privacy_level
    end
  end
);

alter table public.wine_entries
  alter column reaction_privacy set default 'public',
  alter column comments_privacy set default 'public';

alter table public.wine_entries
  alter column reaction_privacy set not null,
  alter column comments_privacy set not null;

alter table public.entry_comments
  add column if not exists deleted_at timestamptz;

create index if not exists entry_comments_deleted_at_idx
  on public.entry_comments (deleted_at);

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
  return public.can_view_entry(viewer_id, owner_id, privacy::text);
end;
$$;

-- Reactions now respect reaction_privacy for both visibility and engagement.
drop policy if exists "Users can read entry reactions for visible entries" on public.entry_reactions;
drop policy if exists "Users can read entry reactions for allowed audience" on public.entry_reactions;
create policy "Users can read entry reactions for allowed audience"
  on public.entry_reactions
  for select
  using (
    exists (
      select 1
      from public.wine_entries e
      where e.id = entry_reactions.entry_id
        and public.can_view_entry(auth.uid(), e.user_id, e.entry_privacy::text)
        and public.can_view_entry(
          auth.uid(),
          e.user_id,
          coalesce(e.reaction_privacy::text, e.entry_privacy::text)
        )
    )
  );

drop policy if exists "Friends can add reactions to friend entries" on public.entry_reactions;
drop policy if exists "Viewers can add reactions to visible entries" on public.entry_reactions;
drop policy if exists "Users can add reactions for allowed audience" on public.entry_reactions;
create policy "Users can add reactions for allowed audience"
  on public.entry_reactions
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.wine_entries e
      where e.id = entry_reactions.entry_id
        and public.can_view_entry(auth.uid(), e.user_id, e.entry_privacy::text)
        and public.can_view_entry(
          auth.uid(),
          e.user_id,
          coalesce(e.reaction_privacy::text, e.entry_privacy::text)
        )
    )
  );

-- Comments now respect comments_privacy for both visibility and engagement.
drop policy if exists "Users can view visible entry comments" on public.entry_comments;
drop policy if exists "Users can view entry comments for allowed audience" on public.entry_comments;
create policy "Users can view entry comments for allowed audience"
  on public.entry_comments
  for select
  using (
    exists (
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

drop policy if exists "Users can add comments to visible entries" on public.entry_comments;
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

drop policy if exists "Users can update own comments" on public.entry_comments;
create policy "Users can update own comments"
  on public.entry_comments
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on table public.entry_comments to authenticated;
