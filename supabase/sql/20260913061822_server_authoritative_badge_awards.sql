-- AUD-09 / B06b: awards are backend-controlled; preserve existing reads/rows.
-- Deploy with the server award writer. Historical awards are not reclassified.
begin;
alter table public.user_badges enable row level security;
drop policy if exists "Users can insert own badges" on public.user_badges;
revoke all on public.user_badges from public, anon, authenticated;
grant select on public.user_badges to authenticated;
-- Existing service_role grants and the authenticated read policy are retained.
commit;
