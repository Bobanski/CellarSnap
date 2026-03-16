alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

comment on column public.profiles.first_name is
  'Optional first name shown on profile surfaces intended for friends.';

comment on column public.profiles.last_name is
  'Optional last name shown on profile surfaces intended for friends.';
