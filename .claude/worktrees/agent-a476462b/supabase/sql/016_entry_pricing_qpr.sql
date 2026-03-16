do $$
begin
  create type public.price_paid_source as enum ('retail', 'restaurant');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.qpr_level as enum ('extortion', 'pricey', 'mid', 'good_value', 'absolute_steal');
exception
  when duplicate_object then null;
end $$;

alter table public.wine_entries
  add column if not exists price_paid numeric(10,2),
  add column if not exists price_paid_source public.price_paid_source,
  add column if not exists qpr_level public.qpr_level;

alter table public.wine_entries
  drop constraint if exists wine_entries_price_paid_non_negative_check;
alter table public.wine_entries
  add constraint wine_entries_price_paid_non_negative_check
  check (price_paid is null or price_paid >= 0);

alter table public.wine_entries
  drop constraint if exists wine_entries_price_source_requires_price_check;
alter table public.wine_entries
  add constraint wine_entries_price_source_requires_price_check
  check (
    (price_paid is null and price_paid_source is null)
    or
    (price_paid is not null and price_paid_source is not null)
  );

comment on column public.wine_entries.price_paid is
  'Price paid for the wine entry.';
comment on column public.wine_entries.price_paid_source is
  'Context for the logged price paid: retail or restaurant.';
comment on column public.wine_entries.qpr_level is
  'Optional quality-to-price ratio assessment.';
