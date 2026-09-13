-- Disposable Auth dependency fixture, not a replacement for GoTrue migrations.
create role dashboard_user;
create role anon;
create role authenticated;
create role service_role bypassrls;
create role supabase_admin;
create role supabase_storage_admin;
create schema auth;
create table auth.users(id uuid primary key, email text, phone text, raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
CREATE OR REPLACE FUNCTION auth.role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$function$
;
CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$
;
grant usage on schema auth to anon,authenticated,service_role;
