-- WS2: Scan Resolution Log
-- Records normalization outcomes for every entry creation.
-- Used for debugging, accuracy monitoring, and alias map tuning.
-- Design constraint: "Log fallback level and normalization outcomes for every scoreable scan."
-- See docs/palate_profiles_design_decisions.md (Implementation Constraints)

create table if not exists public.scan_resolution_log (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references public.wine_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Raw values (from label scan or manual entry, pre-resolution)
  raw_region text,
  raw_producer text,
  raw_classification text,
  raw_wine_type text,

  -- Canonical resolved values
  canonical_region text,
  canonical_country text,
  canonical_sub_region text,
  canonical_producer text,
  canonical_classification text,

  -- Resolution metadata
  resolution_confidence numeric(4,3)
    constraint scan_resolution_log_confidence_check
    check (resolution_confidence is null or (resolution_confidence >= 0 and resolution_confidence <= 1)),
  fallback_level smallint
    constraint scan_resolution_log_fallback_level_check
    check (fallback_level is null or (fallback_level >= 1 and fallback_level <= 6)),
  resolution_source text not null default 'stub'
    constraint scan_resolution_log_source_check
    check (resolution_source in ('stub', 'alias_map', 'exact')),

  -- Alias match indicators
  region_alias_matched boolean not null default false,
  producer_alias_matched boolean not null default false,

  created_at timestamptz not null default now()
);

create index if not exists scan_resolution_log_entry_id_idx
  on public.scan_resolution_log (entry_id);

create index if not exists scan_resolution_log_user_created_at_idx
  on public.scan_resolution_log (user_id, created_at desc);

alter table public.scan_resolution_log enable row level security;

drop policy if exists "Owners can view their resolution logs" on public.scan_resolution_log;
create policy "Owners can view their resolution logs"
  on public.scan_resolution_log
  for select
  using (auth.uid() = user_id);

drop policy if exists "Owners can insert resolution logs" on public.scan_resolution_log;
create policy "Owners can insert resolution logs"
  on public.scan_resolution_log
  for insert
  with check (auth.uid() = user_id);
