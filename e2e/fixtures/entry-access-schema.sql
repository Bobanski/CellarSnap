-- Synthetic, disposable test schema only. Never apply to production.
-- auth.uid()/role() match the deployed JWT claim lookup forms.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema storage;
create function auth.uid() returns uuid language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
create function auth.role() returns text language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') $$;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
create table profiles (id uuid primary key, is_test_account boolean not null default false, display_name text);
create table friend_requests (requester_id uuid, recipient_id uuid, status text);
create table user_blocks (blocker_id uuid, blocked_id uuid);
create table wine_entries (
  id uuid primary key, user_id uuid not null, entry_privacy text,
  rating int check (rating between 1 and 100), notes text,
  root_entry_id uuid references wine_entries(id), entry_group_id uuid,
  tasted_with_user_ids uuid[] not null default '{}'
);
create table entry_photos (id uuid primary key, entry_id uuid references wine_entries(id), path text);
create table storage.objects (name text primary key, bucket_id text);
alter table storage.objects enable row level security;
create policy "Public read access for public-assets" on storage.objects for select using (bucket_id = 'public-assets');
create policy "Service role can upload to public-assets" on storage.objects for insert with check (bucket_id = 'public-assets');
create policy "Service role can update public-assets" on storage.objects for update using (bucket_id = 'public-assets');
grant all on all tables in schema public, storage to anon, authenticated, service_role;
alter table profiles enable row level security;
create policy "Users can view their own profile" on profiles for select using (auth.uid() = id);
create policy "Users can insert their profile" on profiles for insert with check (auth.uid() = id);
create policy "Users can update their profile" on profiles for update using (auth.uid() = id);
-- Lookups must work through the captured definer helpers even when relationship
-- rows are not visible to the caller; do not replace helpers with permissive mocks.
alter table friend_requests enable row level security;
alter table user_blocks enable row level security;
alter table wine_entries enable row level security;
create policy "Authenticated users can view wine entries" on wine_entries for select
  using (auth.role() = 'authenticated');
create policy "Users can view own wine entries" on wine_entries for select using (auth.uid() = user_id);
create policy "Users can insert own wine entries" on wine_entries for insert with check (auth.uid() = user_id);
create policy "Users can update own wine entries" on wine_entries for update using (auth.uid() = user_id);
create policy "Users can delete own wine entries" on wine_entries for delete using (auth.uid() = user_id);
alter table entry_photos enable row level security;
