do $$
begin
  create type public.entry_group_mode as enum ('event', 'catch_up');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.entry_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode public.entry_group_mode not null default 'event',
  title text not null,
  anchor_entry_id uuid references public.wine_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entry_groups_title_not_blank check (char_length(btrim(title)) > 0)
);

create index if not exists entry_groups_user_created_at_idx
  on public.entry_groups (user_id, created_at desc);

create unique index if not exists entry_groups_anchor_entry_id_unique
  on public.entry_groups (anchor_entry_id)
  where anchor_entry_id is not null;

alter table public.wine_entries
  add column if not exists entry_group_id uuid references public.entry_groups(id) on delete set null;

create index if not exists wine_entries_entry_group_id_idx
  on public.wine_entries (entry_group_id);

create table if not exists public.entry_group_slides (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.entry_groups(id) on delete cascade,
  entry_id uuid references public.wine_entries(id) on delete cascade,
  photo_type text not null,
  path text not null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  constraint entry_group_slides_type_check
    check (photo_type in ('label', 'place', 'people', 'pairing', 'lineup', 'other_bottles'))
);

create index if not exists entry_group_slides_group_position_idx
  on public.entry_group_slides (group_id, position, created_at);

create index if not exists entry_group_slides_entry_id_idx
  on public.entry_group_slides (entry_id);

create unique index if not exists entry_group_slides_group_position_unique
  on public.entry_group_slides (group_id, position);

alter table public.entry_groups enable row level security;
alter table public.entry_group_slides enable row level security;

drop policy if exists "Authenticated users can view entry groups" on public.entry_groups;
create policy "Authenticated users can view entry groups"
  on public.entry_groups
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "Owners can manage entry groups" on public.entry_groups;
create policy "Owners can manage entry groups"
  on public.entry_groups
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Authenticated users can view entry group slides" on public.entry_group_slides;
create policy "Authenticated users can view entry group slides"
  on public.entry_group_slides
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "Owners can manage entry group slides" on public.entry_group_slides;
create policy "Owners can manage entry group slides"
  on public.entry_group_slides
  for all
  using (
    auth.uid() = (
      select user_id
      from public.entry_groups
      where id = group_id
    )
  )
  with check (
    auth.uid() = (
      select user_id
      from public.entry_groups
      where id = group_id
    )
  );
