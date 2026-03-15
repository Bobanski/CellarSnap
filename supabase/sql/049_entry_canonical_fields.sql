-- WS2: Entry Normalization
-- Adds wine_type column and canonical resolution fields to wine_entries.
-- Raw fields preserve original extracted values; canonical fields are populated
-- by the resolution middleware (src/server/algorithm/resolver.ts).
-- Depends on: none (schema-only, no WS1 data required)

do $$
begin
  create type public.wine_type as enum ('red', 'white', 'rose', 'sparkling', 'sweet', 'orange');
exception
  when duplicate_object then null;
end
$$;

-- Primary wine type — required by algorithm per-type preference vectors (D9)
alter table public.wine_entries
  add column if not exists wine_type public.wine_type;

-- Raw values: preserved verbatim from label scan / manual entry (pre-alias-resolution)
alter table public.wine_entries
  add column if not exists raw_region text;

alter table public.wine_entries
  add column if not exists raw_producer text;

alter table public.wine_entries
  add column if not exists raw_classification text;

alter table public.wine_entries
  add column if not exists raw_wine_type text;

-- Canonical values: resolved via alias maps (populated by resolution middleware)
alter table public.wine_entries
  add column if not exists canonical_region text;

alter table public.wine_entries
  add column if not exists canonical_producer text;

alter table public.wine_entries
  add column if not exists canonical_classification text;

-- Resolution metadata
alter table public.wine_entries
  add column if not exists resolution_confidence numeric(4,3)
    constraint wine_entries_resolution_confidence_check
    check (resolution_confidence is null or (resolution_confidence >= 0 and resolution_confidence <= 1));

alter table public.wine_entries
  add column if not exists fallback_level smallint
    constraint wine_entries_fallback_level_check
    check (fallback_level is null or (fallback_level >= 1 and fallback_level <= 6));

-- Index for algorithm queries (wine_type is primary filter for per-type preference vectors)
create index if not exists wine_entries_user_wine_type_idx
  on public.wine_entries (user_id, wine_type)
  where wine_type is not null;

-- Index for canonical region lookups
create index if not exists wine_entries_canonical_region_idx
  on public.wine_entries (canonical_region)
  where canonical_region is not null;
