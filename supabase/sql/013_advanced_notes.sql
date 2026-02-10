alter table public.wine_entries
  add column if not exists advanced_notes jsonb;

update public.wine_entries
set advanced_notes = null
where advanced_notes is not null
  and jsonb_typeof(advanced_notes) <> 'object';

alter table public.wine_entries
  drop constraint if exists wine_entries_advanced_notes_object_check;

alter table public.wine_entries
  add constraint wine_entries_advanced_notes_object_check
  check (advanced_notes is null or jsonb_typeof(advanced_notes) = 'object');

comment on column public.wine_entries.advanced_notes is
  'Optional structured tasting notes. Keys: acidity, tannin, alcohol, sweetness, body, intensity, length.';
