create table if not exists public.wine_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wine_name text,
  producer text,
  vintage text,
  region text,
  rating int not null check (rating between 1 and 100),
  notes text,
  location_text text,
  consumed_at date not null default current_date,
  label_image_path text,
  place_image_path text,
  created_at timestamptz not null default now()
);

alter table public.wine_entries enable row level security;

create policy "Users can view own wine entries"
  on public.wine_entries
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own wine entries"
  on public.wine_entries
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own wine entries"
  on public.wine_entries
  for update
  using (auth.uid() = user_id);

create policy "Users can delete own wine entries"
  on public.wine_entries
  for delete
  using (auth.uid() = user_id);
