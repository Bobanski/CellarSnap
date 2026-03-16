alter table public.profiles
  add column if not exists bio text;

comment on column public.profiles.bio is
  'Short bio displayed on user profile card (100 chars max).';
