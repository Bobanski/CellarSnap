do $$
begin
  create type public.entry_comparison_response as enum (
    'more',
    'less',
    'same_or_not_sure'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.entry_comparison_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  new_entry_id uuid not null references public.wine_entries(id) on delete cascade,
  comparison_entry_id uuid not null references public.wine_entries(id) on delete cascade,
  response public.entry_comparison_response not null,
  created_at timestamptz not null default now(),
  check (new_entry_id <> comparison_entry_id),
  unique (new_entry_id)
);

create index if not exists entry_comparison_feedback_user_created_idx
  on public.entry_comparison_feedback (user_id, created_at desc);

create index if not exists entry_comparison_feedback_comparison_idx
  on public.entry_comparison_feedback (comparison_entry_id);

alter table public.entry_comparison_feedback enable row level security;

drop policy if exists "Users can view own comparison feedback" on public.entry_comparison_feedback;
create policy "Users can view own comparison feedback"
  on public.entry_comparison_feedback
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own comparison feedback" on public.entry_comparison_feedback;
create policy "Users can insert own comparison feedback"
  on public.entry_comparison_feedback
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.wine_entries new_entry
      where new_entry.id = new_entry_id
        and new_entry.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.wine_entries comparison_entry
      where comparison_entry.id = comparison_entry_id
        and comparison_entry.user_id = auth.uid()
    )
  );

comment on table public.entry_comparison_feedback is
  'Pairwise preference signal captured after logging a new wine entry.';
