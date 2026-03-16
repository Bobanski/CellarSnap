create table if not exists public.entry_photos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.wine_entries(id) on delete cascade,
  type text not null,
  path text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists entry_photos_entry_type
  on public.entry_photos (entry_id, type);

create index if not exists entry_photos_entry_type_position
  on public.entry_photos (entry_id, type, position);

alter table public.entry_photos enable row level security;

drop policy if exists "Users can view entry photos" on public.entry_photos;
create policy "Users can view entry photos"
  on public.entry_photos
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "Owners can manage entry photos" on public.entry_photos;
create policy "Owners can manage entry photos"
  on public.entry_photos
  for all
  using (
    auth.uid() = (
      select user_id from public.wine_entries
      where id = entry_id
    )
  )
  with check (
    auth.uid() = (
      select user_id from public.wine_entries
      where id = entry_id
    )
  );

alter table public.entry_photos
  drop constraint if exists entry_photos_type_check;

alter table public.entry_photos
  add constraint entry_photos_type_check
  check (type in ('label', 'place', 'pairing'));
