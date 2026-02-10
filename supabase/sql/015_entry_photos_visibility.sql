-- Tighten entry_photos read access to match entry-level privacy.
-- This prevents authenticated users from reading photo metadata for
-- entries they cannot view.

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
