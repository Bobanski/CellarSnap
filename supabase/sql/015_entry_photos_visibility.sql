-- Tighten entry_photos read access to match entry-level privacy.
-- This prevents authenticated users from reading photo metadata for
-- entries they cannot view.

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

  return false;
end;
$$;

drop policy if exists "Users can view entry photos" on public.entry_photos;
create policy "Users can view entry photos"
  on public.entry_photos
  for select
  using (
    exists (
      select 1
      from public.wine_entries e
      where e.id = entry_id
        and public.can_view_entry(auth.uid(), e.user_id, e.entry_privacy)
    )
  );
