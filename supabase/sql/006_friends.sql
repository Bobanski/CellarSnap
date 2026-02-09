create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  seen_at timestamptz
);

create unique index if not exists friend_requests_unique_pair
  on public.friend_requests (requester_id, recipient_id);

create index if not exists friend_requests_recipient_status
  on public.friend_requests (recipient_id, status);

create index if not exists friend_requests_requester_status
  on public.friend_requests (requester_id, status);

alter table public.friend_requests enable row level security;

drop policy if exists "Users can view their friend requests" on public.friend_requests;
create policy "Users can view their friend requests"
  on public.friend_requests
  for select
  using (auth.uid() = requester_id or auth.uid() = recipient_id);

drop policy if exists "Users can create friend requests" on public.friend_requests;
create policy "Users can create friend requests"
  on public.friend_requests
  for insert
  with check (auth.uid() = requester_id);

drop policy if exists "Recipients can update friend requests" on public.friend_requests;
create policy "Recipients can update friend requests"
  on public.friend_requests
  for update
  using (auth.uid() = recipient_id);

alter table public.friend_requests
  drop constraint if exists friend_requests_status_check;

alter table public.friend_requests
  add constraint friend_requests_status_check
  check (status in ('pending', 'accepted', 'declined'));
