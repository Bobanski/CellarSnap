-- Profile picture: path in storage (e.g. wine-photos bucket)
alter table public.profiles
  add column if not exists avatar_path text;

comment on column public.profiles.avatar_path is 'Storage path for profile picture (e.g. {user_id}/avatar.jpg in wine-photos bucket)';
