-- Run after 030 to restore friends_of_friends interaction defaults
-- once the enum value is committed.

update public.wine_entries
set reaction_privacy = 'friends_of_friends'::public.privacy_level
where lower(coalesce(entry_privacy::text, '')) = 'friends_of_friends'
  and reaction_privacy = 'friends'::public.privacy_level;

update public.wine_entries
set comments_privacy = 'friends_of_friends'::public.privacy_level
where lower(coalesce(entry_privacy::text, '')) = 'friends_of_friends'
  and coalesce(comments_scope, 'viewers') <> 'friends'
  and comments_privacy = 'friends'::public.privacy_level;
