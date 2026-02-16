create table if not exists public.post_shares (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.wine_entries(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  mode text not null default 'unlisted'
);

alter table public.post_shares
  drop constraint if exists post_shares_mode_check;

alter table public.post_shares
  add constraint post_shares_mode_check
  check (mode in ('unlisted'));

create index if not exists post_shares_post_created_by_created_at_idx
  on public.post_shares (post_id, created_by, created_at desc);

create index if not exists post_shares_created_by_created_at_idx
  on public.post_shares (created_by, created_at desc);

create index if not exists post_shares_active_post_created_by_idx
  on public.post_shares (post_id, created_by)
  where revoked_at is null;

alter table public.post_shares enable row level security;

drop policy if exists "Owners can create share rows" on public.post_shares;
create policy "Owners can create share rows"
  on public.post_shares
  for insert
  to authenticated
  with check (
    auth.uid() = created_by
    and exists (
      select 1
      from public.wine_entries entries
      where entries.id = post_id
        and public.can_view_entry(
          auth.uid(),
          entries.user_id,
          entries.entry_privacy::text
        )
    )
  );

drop policy if exists "Owners can read own share rows" on public.post_shares;
create policy "Owners can read own share rows"
  on public.post_shares
  for select
  to authenticated
  using (auth.uid() = created_by);

drop policy if exists "Public can read active share rows" on public.post_shares;
create policy "Public can read active share rows"
  on public.post_shares
  for select
  to anon, authenticated
  using (
    revoked_at is null
    and (expires_at is null or expires_at > now())
  );

revoke all on table public.post_shares from anon;
revoke all on table public.post_shares from authenticated;

grant select (id, post_id, created_at, expires_at, mode)
  on table public.post_shares
  to anon;

grant select (id, post_id, created_at, expires_at, revoked_at, mode)
  on table public.post_shares
  to authenticated;

grant insert (post_id, created_by, expires_at, mode)
  on table public.post_shares
  to authenticated;
