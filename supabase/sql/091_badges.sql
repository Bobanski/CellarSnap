-- ── User Badges ─────────────────────────────────────────────────────────────
-- Stores which badges each user has earned. Badge definitions live in
-- TypeScript (packages/shared/src/badges.ts); the DB only tracks awards.

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id text not null,
  earned_at timestamptz not null default now(),
  constraint user_badges_user_badge_unique unique (user_id, badge_id)
);

create index if not exists user_badges_user_earned_at_idx
  on public.user_badges (user_id, earned_at desc);

create index if not exists user_badges_badge_id_idx
  on public.user_badges (badge_id);

-- ── Featured Badge on Profile ───────────────────────────────────────────────

alter table public.profiles
  add column if not exists featured_badge_id text;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.user_badges enable row level security;

drop policy if exists "Authenticated users can view badges" on public.user_badges;
create policy "Authenticated users can view badges"
  on public.user_badges
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "Users can insert own badges" on public.user_badges;
create policy "Users can insert own badges"
  on public.user_badges
  for insert
  with check (auth.uid() = user_id);
