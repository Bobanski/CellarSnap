alter table public.wine_entries
  add column if not exists location_place_id text;
