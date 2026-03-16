-- Shared tastings: allow users to keep a personal copy of a tagged entry
-- without creating duplicate feed items.

alter table public.wine_entries
  add column if not exists root_entry_id uuid references public.wine_entries(id) on delete set null,
  add column if not exists is_feed_visible boolean not null default true;

alter table public.wine_entries
  drop constraint if exists wine_entries_root_entry_id_check;

alter table public.wine_entries
  add constraint wine_entries_root_entry_id_check
  check (root_entry_id is null or root_entry_id <> id);

create index if not exists wine_entries_root_entry_id_idx
  on public.wine_entries (root_entry_id);

create index if not exists wine_entries_is_feed_visible_created_at_idx
  on public.wine_entries (is_feed_visible, created_at desc);

create unique index if not exists wine_entries_user_root_unique
  on public.wine_entries (user_id, root_entry_id)
  where root_entry_id is not null;

-- Speeds up overlap/contains queries for tasting tags.
create index if not exists wine_entries_tasted_with_user_ids_gin
  on public.wine_entries using gin (tasted_with_user_ids);

