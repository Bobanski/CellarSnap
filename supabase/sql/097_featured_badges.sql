-- ── Featured Badges (multi) on Profile ──────────────────────────────────────
-- Extends the single `featured_badge_id` (091_badges.sql) so a profile can
-- showcase up to five featured badges, in order (Dani feedback — profiles
-- currently cap out at one).
--
-- `featured_badge_id` stays as-is for mobile back-compat: older mobile
-- builds read it directly, so the web API mirrors element 0 of
-- `featured_badge_ids` into it on every write (app-layer, not a DB trigger —
-- simplest option since there's exactly one write path today,
-- PUT /api/badges/featured).

alter table public.profiles
  add column if not exists featured_badge_ids text[] not null default '{}';

alter table public.profiles
  drop constraint if exists profiles_featured_badge_ids_max_five;

alter table public.profiles
  add constraint profiles_featured_badge_ids_max_five
  check (
    featured_badge_ids is null
    or array_length(featured_badge_ids, 1) is null
    or array_length(featured_badge_ids, 1) <= 5
  );

-- Backfill: seed the new array from the existing single-badge column so
-- profiles that already featured a badge don't lose it.
update public.profiles
set featured_badge_ids = array[featured_badge_id]
where featured_badge_id is not null
  and coalesce(array_length(featured_badge_ids, 1), 0) = 0;
