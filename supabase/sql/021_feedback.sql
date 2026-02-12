create table if not exists public.launch_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  category text not null check (category in ('bug', 'idea', 'ux', 'other')),
  message text not null,
  page_path text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists launch_feedback_created_at_idx
  on public.launch_feedback (created_at desc);

create index if not exists launch_feedback_user_id_idx
  on public.launch_feedback (user_id);

alter table public.launch_feedback enable row level security;

drop policy if exists "Anyone can submit launch feedback" on public.launch_feedback;
create policy "Anyone can submit launch feedback"
  on public.launch_feedback
  for insert
  with check (
    auth.role() in ('anon', 'authenticated')
    and char_length(trim(message)) >= 10
  );

drop policy if exists "Users can read own launch feedback" on public.launch_feedback;
create policy "Users can read own launch feedback"
  on public.launch_feedback
  for select
  using (auth.uid() = user_id);

comment on table public.launch_feedback is
  'Friends-and-family launch feedback submitted in-app.';
