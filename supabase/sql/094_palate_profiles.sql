-- Distilled palate profiles — cached output of the LLM palate distillation
-- step (src/server/algorithm/palateDistillation.ts). One row per user.
-- Written only by the service role; users can read their own profile.

create table if not exists public.palate_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null,
  signal_hash text not null,
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.palate_profiles enable row level security;

drop policy if exists "Users can view own palate profile" on public.palate_profiles;
create policy "Users can view own palate profile"
  on public.palate_profiles
  for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies: writes go through the service role only.
