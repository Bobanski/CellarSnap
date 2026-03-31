create table if not exists public.user_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  cover_image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_collections_name_not_blank
    check (char_length(btrim(name)) between 1 and 80)
);

create unique index if not exists user_collections_user_name_unique
  on public.user_collections (user_id, lower(btrim(name)));

create index if not exists user_collections_user_updated_at_idx
  on public.user_collections (user_id, updated_at desc, created_at desc);

create table if not exists public.user_collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.user_collections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references public.wine_entries(id) on delete cascade,
  snapshot_entry_group_id uuid references public.entry_groups(id) on delete set null,
  snapshot_wine_name text,
  snapshot_producer text,
  snapshot_vintage text,
  snapshot_consumed_at date,
  snapshot_preview_image_path text,
  snapshot_label_image_path text,
  created_at timestamptz not null default now()
);

create unique index if not exists user_collection_items_collection_entry_unique
  on public.user_collection_items (collection_id, entry_id);

create index if not exists user_collection_items_user_entry_idx
  on public.user_collection_items (user_id, entry_id, created_at desc);

create index if not exists user_collection_items_collection_created_at_idx
  on public.user_collection_items (collection_id, created_at desc);

alter table public.user_collections enable row level security;
alter table public.user_collection_items enable row level security;

drop policy if exists "Owners can view collections" on public.user_collections;
create policy "Owners can view collections"
  on public.user_collections
  for select
  using (auth.uid() = user_id);

drop policy if exists "Owners can manage collections" on public.user_collections;
create policy "Owners can manage collections"
  on public.user_collections
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Owners can view collection items" on public.user_collection_items;
create policy "Owners can view collection items"
  on public.user_collection_items
  for select
  using (auth.uid() = user_id);

drop policy if exists "Owners can manage collection items" on public.user_collection_items;
create policy "Owners can manage collection items"
  on public.user_collection_items
  for all
  using (
    auth.uid() = user_id
    and auth.uid() = (
      select user_id
      from public.user_collections
      where id = collection_id
    )
  )
  with check (
    auth.uid() = user_id
    and auth.uid() = (
      select user_id
      from public.user_collections
      where id = collection_id
    )
  );
