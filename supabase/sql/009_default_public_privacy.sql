-- Set all existing wine entries to public visibility
update public.wine_entries
  set entry_privacy = 'public'
  where entry_privacy <> 'public';

-- Set all existing profile default_entry_privacy to public
update public.profiles
  set default_entry_privacy = 'public'
  where default_entry_privacy <> 'public';

-- Also update the column default so new profiles get 'public'
alter table public.profiles
  alter column default_entry_privacy set default 'public';
