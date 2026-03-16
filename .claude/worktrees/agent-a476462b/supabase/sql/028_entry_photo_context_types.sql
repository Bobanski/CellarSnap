alter table public.entry_photos
  drop constraint if exists entry_photos_type_check;

alter table public.entry_photos
  add constraint entry_photos_type_check
  check (type in ('label', 'place', 'people', 'pairing', 'lineup', 'other_bottles'));
