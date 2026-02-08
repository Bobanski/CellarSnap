alter table public.wine_entries
  add column if not exists tasted_with_user_ids uuid[] not null default '{}'::uuid[];

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Authenticated users can view profiles" on public.profiles;

create policy "Authenticated users can view profiles"
  on public.profiles
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "Users can update their profile" on public.profiles;

create policy "Users can update their profile"
  on public.profiles
  for update
  using (auth.uid() = id);

drop policy if exists "Users can insert their profile" on public.profiles;

create policy "Users can insert their profile"
  on public.profiles
  for insert
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.profiles (id, email)
select id, email
from auth.users
on conflict (id) do nothing;

drop policy if exists "Authenticated users can view wine entries" on public.wine_entries;

create policy "Authenticated users can view wine entries"
  on public.wine_entries
  for select
  using (auth.role() = 'authenticated');
