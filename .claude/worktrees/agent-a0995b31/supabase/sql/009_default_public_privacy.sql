-- Set all existing wine entries to public visibility (if the column exists)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wine_entries' and column_name = 'entry_privacy'
  ) then
    execute $q$ update public.wine_entries set entry_privacy = 'public' where entry_privacy <> 'public' $q$;
  end if;
end $$;

-- Set all existing profile default_entry_privacy to public (if the column exists)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'default_entry_privacy'
  ) then
    execute $q$ update public.profiles set default_entry_privacy = 'public' where default_entry_privacy <> 'public' $q$;
    execute $q$ alter table public.profiles alter column default_entry_privacy set default 'public' $q$;
  end if;
end $$;
