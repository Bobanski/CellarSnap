-- Taste survey responses — stores onboarding quiz answers.
-- One row per user. Upserted on completion and on edits.
-- The algorithm reads this to seed cold-start preference vectors.

create table if not exists taste_survey_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  wine_types text[] not null default '{}',
  varietals text[] not null default '{}',
  regions text[] not null default '{}',
  countries text[] not null default '{}',
  sensory_loves text[] not null default '{}',
  sensory_avoids text[] not null default '{}',
  budget_restaurant text,
  budget_retail text,
  adventurousness int not null default 5,
  free_text text,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint taste_survey_responses_user_id_key unique (user_id)
);

-- RLS: users can only read/write their own row.
alter table taste_survey_responses enable row level security;

create policy "Users can read own survey"
  on taste_survey_responses for select
  using (auth.uid() = user_id);

create policy "Users can insert own survey"
  on taste_survey_responses for insert
  with check (auth.uid() = user_id);

create policy "Users can update own survey"
  on taste_survey_responses for update
  using (auth.uid() = user_id);

comment on table taste_survey_responses is
  'Onboarding taste quiz answers. One row per user. Algorithm reads this to seed cold-start preferences.';
