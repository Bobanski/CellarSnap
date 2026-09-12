-- Overhaul engagement, eng-audit M5 + S9.
--
-- M5: wine_notifications' unread-count query (`user_id = ? AND seen_at IS
-- NULL`, src/app/api/notifications/route.ts) has no supporting index and is
-- polled every 25s per open tab (src/components/AlertsMenu.tsx). Confirmed
-- via pg_stat_statements as ~264,600 calls already against a 57-row table —
-- cheap only because the table is still tiny. Add a partial index scoped to
-- the unseen rows, matching the existing partial-index pattern already used
-- elsewhere in this schema (e.g. idx_wine_entries_cellar).
--
-- S9: 7 tables have an `updated_at` column but no trigger keeping it fresh
-- on UPDATE — `wine_entry_scores` happens to be fine today because
-- scoreCache.ts sets it manually on every write, but that's fragile (any
-- other write path, e.g. an admin backfill, silently skips it). The other 6
-- have no such app-level discipline at all. `public.set_updated_at()`
-- already exists (introduced in 053_pocket_sommelier.sql) — reuse it here
-- via `create or replace` so this migration is self-contained regardless of
-- run order.

-- ---------------------------------------------------------------------------
-- M5: partial index for the unread-notifications poll
-- ---------------------------------------------------------------------------

create index if not exists wine_notifications_user_unseen_idx
  on public.wine_notifications (user_id)
  where seen_at is null;

-- ---------------------------------------------------------------------------
-- S9: missing updated_at triggers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists api_rate_limits_set_updated_at on public.api_rate_limits;
create trigger api_rate_limits_set_updated_at
before update on public.api_rate_limits
for each row
execute function public.set_updated_at();

drop trigger if exists entry_comments_set_updated_at on public.entry_comments;
create trigger entry_comments_set_updated_at
before update on public.entry_comments
for each row
execute function public.set_updated_at();

drop trigger if exists entry_groups_set_updated_at on public.entry_groups;
create trigger entry_groups_set_updated_at
before update on public.entry_groups
for each row
execute function public.set_updated_at();

drop trigger if exists palate_profiles_set_updated_at on public.palate_profiles;
create trigger palate_profiles_set_updated_at
before update on public.palate_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists taste_survey_responses_set_updated_at on public.taste_survey_responses;
create trigger taste_survey_responses_set_updated_at
before update on public.taste_survey_responses
for each row
execute function public.set_updated_at();

drop trigger if exists user_collections_set_updated_at on public.user_collections;
create trigger user_collections_set_updated_at
before update on public.user_collections
for each row
execute function public.set_updated_at();

drop trigger if exists wine_entry_scores_set_updated_at on public.wine_entry_scores;
create trigger wine_entry_scores_set_updated_at
before update on public.wine_entry_scores
for each row
execute function public.set_updated_at();
