alter table public.profiles
  add column if not exists is_test_account boolean not null default false;

comment on column public.profiles.is_test_account is
  'Marks internal test users. Test-authored content is only visible to other test users.';

update public.profiles profiles
set is_test_account = coalesce(
  nullif(users.raw_user_meta_data ->> 'test_account', '')::boolean,
  false
)
from auth.users users
where users.id = profiles.id
  and profiles.is_test_account is distinct from coalesce(
    nullif(users.raw_user_meta_data ->> 'test_account', '')::boolean,
    false
  );

create or replace function public.is_test_account(user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
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
$$;

create or replace function public.can_view_test_authored_content(
  viewer_id uuid,
  owner_id uuid
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

  if not public.is_test_account(owner_id) then
    return true;
  end if;

  return public.is_test_account(viewer_id);
end;
$$;

create or replace function public.can_view_entry_standard(
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

drop policy if exists "Users can read entry reactions for allowed audience" on public.entry_reactions;
create policy "Users can read entry reactions for allowed audience"
  on public.entry_reactions
  for select
  using (
    public.can_view_test_authored_content(auth.uid(), entry_reactions.user_id)
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
        and public.can_view_entry_standard(auth.uid(), e.user_id, e.entry_privacy::text)
        and public.can_view_entry_standard(
          auth.uid(),
          e.user_id,
          coalesce(e.reaction_privacy::text, e.entry_privacy::text)
        )
        and public.can_view_test_authored_content(e.user_id, auth.uid())
    )
  );

drop policy if exists "Users can view entry comments for allowed audience" on public.entry_comments;
create policy "Users can view entry comments for allowed audience"
  on public.entry_comments
  for select
  using (
    not public.is_user_blocked(auth.uid(), entry_comments.user_id)
    and public.can_view_test_authored_content(auth.uid(), entry_comments.user_id)
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
        and public.can_view_entry_standard(auth.uid(), e.user_id, e.entry_privacy::text)
        and public.can_view_entry_standard(
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
        and public.can_view_test_authored_content(e.user_id, auth.uid())
    )
  );

drop view if exists public.public_profiles;

create view public.public_profiles as
select
  id,
  display_name,
  is_test_account,
  first_name,
  last_name,
  avatar_path,
  created_at,
  null::text as email
from public.profiles
where public.can_view_test_authored_content(auth.uid(), id);

grant select on public.public_profiles to authenticated;
revoke all on public.public_profiles from anon;
