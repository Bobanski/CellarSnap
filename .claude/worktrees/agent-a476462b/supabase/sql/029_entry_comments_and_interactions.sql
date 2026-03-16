-- Comments + interaction visibility controls.

alter table public.wine_entries
  add column if not exists comments_scope text not null default 'viewers';

alter table public.wine_entries
  drop constraint if exists wine_entries_comments_scope_check;

alter table public.wine_entries
  add constraint wine_entries_comments_scope_check
  check (comments_scope in ('viewers', 'friends'));

create table if not exists public.entry_comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.wine_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_comment_id uuid references public.entry_comments(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.entry_comments
  drop constraint if exists entry_comments_body_not_blank;

alter table public.entry_comments
  add constraint entry_comments_body_not_blank
  check (char_length(trim(body)) > 0);

alter table public.entry_comments
  drop constraint if exists entry_comments_body_max_len;

alter table public.entry_comments
  add constraint entry_comments_body_max_len
  check (char_length(body) <= 1000);

create index if not exists entry_comments_entry_created_idx
  on public.entry_comments (entry_id, created_at);

create index if not exists entry_comments_parent_idx
  on public.entry_comments (parent_comment_id);

create index if not exists entry_comments_user_idx
  on public.entry_comments (user_id, created_at);

create or replace function public.validate_entry_comment_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_entry_id uuid;
  parent_parent_id uuid;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  select entry_id, parent_comment_id
    into parent_entry_id, parent_parent_id
    from public.entry_comments
   where id = new.parent_comment_id;

  if not found then
    raise exception 'Parent comment not found.'
      using errcode = '23503';
  end if;

  if parent_entry_id <> new.entry_id then
    raise exception 'Parent comment must belong to the same entry.'
      using errcode = '23514';
  end if;

  if parent_parent_id is not null then
    raise exception 'Replies can only target top-level comments.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists entry_comments_validate_parent on public.entry_comments;
create trigger entry_comments_validate_parent
  before insert or update of entry_id, parent_comment_id
  on public.entry_comments
  for each row
  execute function public.validate_entry_comment_parent();

alter table public.entry_comments enable row level security;

drop policy if exists "Users can view visible entry comments" on public.entry_comments;
create policy "Users can view visible entry comments"
  on public.entry_comments
  for select
  using (
    exists (
      select 1
      from public.wine_entries e
      where e.id = entry_comments.entry_id
        and public.can_view_entry(auth.uid(), e.user_id, e.entry_privacy)
        and (
          coalesce(e.comments_scope, 'viewers') <> 'friends'
          or auth.uid() = e.user_id
          or public.are_friends(auth.uid(), e.user_id)
        )
    )
  );

drop policy if exists "Users can add comments to visible entries" on public.entry_comments;
create policy "Users can add comments to visible entries"
  on public.entry_comments
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.wine_entries e
      where e.id = entry_comments.entry_id
        and public.can_view_entry(auth.uid(), e.user_id, e.entry_privacy)
        and (
          coalesce(e.comments_scope, 'viewers') <> 'friends'
          or auth.uid() = e.user_id
          or public.are_friends(auth.uid(), e.user_id)
        )
    )
  );

drop policy if exists "Users can delete own comments" on public.entry_comments;
create policy "Users can delete own comments"
  on public.entry_comments
  for delete
  using (user_id = auth.uid());

grant select, insert, delete on table public.entry_comments to authenticated;

drop policy if exists "Friends can add reactions to friend entries" on public.entry_reactions;
drop policy if exists "Viewers can add reactions to visible entries" on public.entry_reactions;
create policy "Viewers can add reactions to visible entries"
  on public.entry_reactions
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.wine_entries e
      where e.id = entry_reactions.entry_id
        and public.can_view_entry(auth.uid(), e.user_id, e.entry_privacy)
    )
  );
