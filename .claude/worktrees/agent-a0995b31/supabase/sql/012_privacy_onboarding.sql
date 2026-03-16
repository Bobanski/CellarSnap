alter table public.profiles
  add column if not exists privacy_confirmed_at timestamptz;

update public.profiles
set privacy_confirmed_at = coalesce(privacy_confirmed_at, now());

comment on column public.profiles.privacy_confirmed_at is
  'Timestamp when the user explicitly confirmed their default entry privacy during onboarding.';
