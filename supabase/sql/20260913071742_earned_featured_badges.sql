-- B06e / AUD-09. Both profile representations must reference stored awards.
-- No award backfill or historical reclassification. Fail on unexpected legacy
-- selections so they can be reviewed rather than silently rewritten.
begin;
lock table public.profiles, public.user_badges in share row exclusive mode;
do $$
begin
  if exists (
    select from public.profiles p
    where p.featured_badge_id is distinct from p.featured_badge_ids[1]
      or exists (select from unnest(p.featured_badge_ids) f
        where f is null or not exists (select from public.user_badges b
          where b.user_id = p.id and b.badge_id = f))
  ) then
    raise exception 'Review existing featured selections before applying B06e';
  end if;
end;
$$;

create or replace function private.enforce_earned_featured_badges()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  selected text[];
  badge text;
begin
  -- Only a trigger can call this private function. Definer rights are needed
  -- to lock awards without giving clients UPDATE privileges on user_badges.
  -- Profile RLS still controls the outer write; bind client calls to auth.uid().
  if current_setting('role') in ('anon', 'authenticated')
     and new.id is distinct from auth.uid() then
    raise exception 'Cannot feature badges for another user' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and new.featured_badge_id is distinct from old.featured_badge_id
     and new.featured_badge_ids is not distinct from old.featured_badge_ids then
    -- Legacy single-column feature/clear replaces the complete selection.
    selected := case when new.featured_badge_id is null then '{}'::text[]
      else array[new.featured_badge_id] end;
  else
    selected := new.featured_badge_ids;
    if tg_op = 'INSERT' and cardinality(selected) = 0 and new.featured_badge_id is not null then
      selected := array[new.featured_badge_id];
    elsif new.featured_badge_id is distinct from selected[1]
      and ((tg_op = 'INSERT' and new.featured_badge_id is not null)
        or (tg_op = 'UPDATE' and new.featured_badge_id is distinct from old.featured_badge_id)) then
      raise exception 'Conflicting featured badge selections' using errcode = '23514';
    end if;
  end if;

  if selected is null or cardinality(selected) > 5
     or coalesce(array_ndims(selected), 1) <> 1
     or coalesce(array_lower(selected, 1), 1) <> 1
     or exists (select from unnest(selected) f where f is null)
     or (select count(distinct f) from unnest(selected) f) <> cardinality(selected) then
    raise exception 'Select up to five distinct earned badges' using errcode = '23514';
  end if;
  -- Stable order and key locks protect the check against concurrent revocation.
  for badge in select f from unnest(selected) f order by f loop
    perform 1 from public.user_badges b
      where b.user_id = new.id and b.badge_id = badge for key share;
    if not found then
      raise exception 'Badge not earned' using errcode = '42501';
    end if;
  end loop;
  new.featured_badge_ids := selected;
  new.featured_badge_id := selected[1];
  return new;
end;
$$;
revoke all on function private.enforce_earned_featured_badges() from public, anon, authenticated, service_role;
create trigger profiles_earned_featured_badges
before insert or update on public.profiles
for each row execute function private.enforce_earned_featured_badges();

-- Only privileged award writers reach this trigger. Retain remaining order;
-- award deletion/key reassignment must never leave an unearned feature behind.
create or replace function private.remove_revoked_featured_badge()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  remaining text[];
begin
  if tg_op = 'DELETE' or old.user_id is distinct from new.user_id
      or old.badge_id is distinct from new.badge_id then
    -- A single statement may revoke multiple awards; remove all missing rows
    -- before revalidating the profile, while holding its row lock.
    select p.featured_badge_ids into remaining from public.profiles p
      where p.id = old.user_id and old.badge_id = any(p.featured_badge_ids)
      for update;
    if found then
      select coalesce(array_agg(f order by ordinal), '{}'::text[]) into remaining
      from unnest(remaining) with ordinality as selected(f, ordinal)
      where exists (select from public.user_badges b where b.user_id = old.user_id and b.badge_id = f);
      update public.profiles set featured_badge_ids = remaining,
        featured_badge_id = remaining[1] where id = old.user_id;
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.remove_revoked_featured_badge() from public, anon, authenticated, service_role;
create trigger user_badges_remove_revoked_feature
after delete or update of user_id, badge_id on public.user_badges
for each row execute function private.remove_revoked_featured_badge();
commit;
