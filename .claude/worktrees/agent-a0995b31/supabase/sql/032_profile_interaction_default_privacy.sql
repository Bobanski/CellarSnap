-- Global default preferences for new posts/interactions.
-- Request: post = public, reactions = public, comments = friends_of_friends.

alter table public.profiles
  add column if not exists default_reaction_privacy public.privacy_level not null default 'public',
  add column if not exists default_comments_privacy public.privacy_level not null default 'friends_of_friends';

-- Apply the new default baseline for all users.
update public.profiles
set default_entry_privacy = 'public'::public.privacy_level;

update public.profiles
set default_reaction_privacy = 'public'::public.privacy_level;

update public.profiles
set default_comments_privacy = 'friends_of_friends'::public.privacy_level;
