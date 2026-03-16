alter table public.wine_entries
  add column if not exists drinking_now boolean not null default false;

comment on column public.wine_entries.drinking_now is
  'Marks an entry as actively being consumed; direct friends see a light-blue highlight for 2.5 hours from the original entry creation time.';
