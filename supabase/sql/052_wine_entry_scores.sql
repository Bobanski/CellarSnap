-- WS3: Wine Entry Score Cache
-- Stores per-user palate match results for entry cards, best-match shelves,
-- and background refresh workflows.

create table if not exists public.wine_entry_scores (
  id uuid primary key default gen_random_uuid(),
  wine_entry_id uuid not null references public.wine_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  match_score integer not null
    constraint wine_entry_scores_match_score_check
    check (match_score >= 0 and match_score <= 100),
  match_band text not null
    constraint wine_entry_scores_match_band_check
    check (match_band in ('excellent', 'strong', 'decent', 'not_your_style')),
  confidence numeric(4,3)
    constraint wine_entry_scores_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  display_score boolean not null default false,
  axis_breakdown jsonb not null default '{}'::jsonb,
  effective_profile jsonb not null default '{}'::jsonb,
  modifiers_applied jsonb not null default '[]'::jsonb,
  preference_event_count integer not null default 0
    constraint wine_entry_scores_preference_event_count_check
    check (preference_event_count >= 0),
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wine_entry_scores_user_entry_unique unique (wine_entry_id, user_id)
);

create index if not exists wine_entry_scores_user_computed_at_idx
  on public.wine_entry_scores (user_id, computed_at desc);

create index if not exists wine_entry_scores_user_match_score_idx
  on public.wine_entry_scores (user_id, match_score desc)
  where display_score = true;

alter table public.wine_entry_scores enable row level security;

drop policy if exists "Owners can view their cached entry scores" on public.wine_entry_scores;
create policy "Owners can view their cached entry scores"
  on public.wine_entry_scores
  for select
  using (auth.uid() = user_id);

drop policy if exists "Owners can insert their cached entry scores" on public.wine_entry_scores;
create policy "Owners can insert their cached entry scores"
  on public.wine_entry_scores
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Owners can update their cached entry scores" on public.wine_entry_scores;
create policy "Owners can update their cached entry scores"
  on public.wine_entry_scores
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Owners can delete their cached entry scores" on public.wine_entry_scores;
create policy "Owners can delete their cached entry scores"
  on public.wine_entry_scores
  for delete
  using (auth.uid() = user_id);
