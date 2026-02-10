do $$
begin
  create type public.price_paid_currency as enum (
    'usd',
    'eur',
    'gbp',
    'chf',
    'aud',
    'mxn'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.wine_entries
  add column if not exists price_paid_currency public.price_paid_currency;

update public.wine_entries
set price_paid_currency = 'usd'
where price_paid is not null
  and price_paid_currency is null;

alter table public.wine_entries
  drop constraint if exists wine_entries_price_source_requires_price_check;
alter table public.wine_entries
  add constraint wine_entries_price_source_requires_price_check
  check (
    (price_paid is null and price_paid_source is null and price_paid_currency is null)
    or
    (price_paid is not null and price_paid_source is not null and price_paid_currency is not null)
  );

comment on column public.wine_entries.price_paid_currency is
  'Currency used for price_paid (usd, eur, gbp, chf, aud, mxn).';
