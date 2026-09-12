-- Synthetic extension of entry-access-schema.sql; never production DDL.
alter table wine_entries add column label_photo_privacy text, add column place_photo_privacy text;
alter table entry_photos add column type text not null default 'label';
create table entry_groups (id uuid primary key, user_id uuid not null, anchor_entry_id uuid references wine_entries(id), title text);
create table entry_group_slides (id uuid primary key, group_id uuid references entry_groups(id), entry_id uuid references wine_entries(id), photo_type text not null, path text not null);
alter table entry_groups enable row level security;
alter table entry_group_slides enable row level security;
grant all on entry_groups, entry_group_slides to anon, authenticated, service_role;
-- Install exact captured policies in the test harness, not guessed permissive mocks.
