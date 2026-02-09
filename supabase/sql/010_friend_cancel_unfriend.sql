-- Allow either party (requester or recipient) to delete a friend request.
-- This enables: cancelling outgoing pending requests AND unfriending (removing accepted requests).

drop policy if exists "Either party can delete friend requests" on public.friend_requests;
create policy "Either party can delete friend requests"
  on public.friend_requests
  for delete
  using (auth.uid() = requester_id or auth.uid() = recipient_id);
