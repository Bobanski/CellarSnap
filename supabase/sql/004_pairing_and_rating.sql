alter table public.wine_entries
  alter column rating drop not null,
  add column if not exists pairing_image_path text;

alter table public.wine_entries
  drop constraint if exists wine_entries_rating_check;

alter table public.wine_entries
  add constraint wine_entries_rating_check
  check (rating is null or rating between 1 and 100);
