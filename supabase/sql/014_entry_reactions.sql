-- Emoji reactions on feed entries (mutual friends can react).
create table if not exists public.entry_reactions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.wine_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique(entry_id, user_id, emoji)
);

create index if not exists entry_reactions_entry_id on public.entry_reactions(entry_id);
create index if not exists entry_reactions_entry_emoji on public.entry_reactions(entry_id, emoji);

alter table public.entry_reactions enable row level security;

-- Anyone who can see the entry can read its reactions.
create policy "Users can read entry reactions for visible entries"
  on public.entry_reactions
  for select
  using (
    exists (
      select 1 from public.wine_entries e
      where e.id = entry_reactions.entry_id
      and (
        e.entry_privacy = 'public'
        or (e.entry_privacy = 'friends' and exists (
          select 1 from public.friend_requests fr
          where fr.status = 'accepted'
          and (fr.requester_id = auth.uid() and fr.recipient_id = e.user_id
            or fr.recipient_id = auth.uid() and fr.requester_id = e.user_id)
        ))
        or e.user_id = auth.uid()
      )
    )
  );

-- Only the reaction author can delete their own reaction.
create policy "Users can delete own reaction"
  on public.entry_reactions
  for delete
  using (user_id = auth.uid());

-- Insert allowed only if user is friends with entry author (mutual).
create policy "Friends can add reactions to friend entries"
  on public.entry_reactions
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.wine_entries e
      where e.id = entry_reactions.entry_id
      and e.user_id != auth.uid()
      and exists (
        select 1 from public.friend_requests fr
        where fr.status = 'accepted'
        and (
          (fr.requester_id = auth.uid() and fr.recipient_id = e.user_id)
          or (fr.recipient_id = auth.uid() and fr.requester_id = e.user_id)
        )
      )
    )
  );
