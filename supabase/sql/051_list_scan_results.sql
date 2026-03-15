-- WS3: Persisted wine-list scan results
-- Stores the full parsed result plus a queryable wine row projection for history,
-- future analytics, and revisiting scans across devices.

create table if not exists public.list_scan_results (
  scan_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null
    constraint list_scan_results_source_type_check
    check (source_type in ('image', 'pdf', 'url')),
  source_label text,
  venue_name text,
  list_title text,
  overall_confidence integer
    constraint list_scan_results_confidence_check
    check (overall_confidence is null or (overall_confidence >= 0 and overall_confidence <= 100)),
  scanned_at timestamptz not null default now(),
  raw_result jsonb not null
    constraint list_scan_results_raw_result_check
    check (jsonb_typeof(raw_result) = 'object')
);

create index if not exists list_scan_results_user_scanned_at_idx
  on public.list_scan_results (user_id, scanned_at desc);

create table if not exists public.list_scan_wines (
  id text primary key,
  scan_id text not null references public.list_scan_results(scan_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_order integer not null,
  menu_label text not null,
  producer text,
  wine_name text,
  vintage text,
  wine_type text not null
    constraint list_scan_wines_wine_type_check
    check (wine_type in ('sparkling', 'white', 'rose', 'orange', 'red', 'dessert_fortified', 'unknown')),
  price_display text,
  price_value numeric(10,2),
  varietals text[] not null default '{}',
  regions text[] not null default '{}',
  match_percent integer not null
    constraint list_scan_wines_match_percent_check
    check (match_percent >= 0 and match_percent <= 100),
  parse_confidence integer not null
    constraint list_scan_wines_parse_confidence_check
    check (parse_confidence >= 0 and parse_confidence <= 100),
  rationale text not null,
  created_at timestamptz not null default now()
);

create index if not exists list_scan_wines_scan_id_idx
  on public.list_scan_wines (scan_id, source_order);

create index if not exists list_scan_wines_user_created_at_idx
  on public.list_scan_wines (user_id, created_at desc);

alter table public.list_scan_results enable row level security;
alter table public.list_scan_wines enable row level security;

drop policy if exists "Owners can view their list scan results" on public.list_scan_results;
create policy "Owners can view their list scan results"
  on public.list_scan_results
  for select
  using (auth.uid() = user_id);

drop policy if exists "Owners can insert their list scan results" on public.list_scan_results;
create policy "Owners can insert their list scan results"
  on public.list_scan_results
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Owners can update their list scan results" on public.list_scan_results;
create policy "Owners can update their list scan results"
  on public.list_scan_results
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Owners can delete their list scan results" on public.list_scan_results;
create policy "Owners can delete their list scan results"
  on public.list_scan_results
  for delete
  using (auth.uid() = user_id);

drop policy if exists "Owners can view their list scan wines" on public.list_scan_wines;
create policy "Owners can view their list scan wines"
  on public.list_scan_wines
  for select
  using (auth.uid() = user_id);

drop policy if exists "Owners can insert their list scan wines" on public.list_scan_wines;
create policy "Owners can insert their list scan wines"
  on public.list_scan_wines
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Owners can update their list scan wines" on public.list_scan_wines;
create policy "Owners can update their list scan wines"
  on public.list_scan_wines
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Owners can delete their list scan wines" on public.list_scan_wines;
create policy "Owners can delete their list scan wines"
  on public.list_scan_wines
  for delete
  using (auth.uid() = user_id);
