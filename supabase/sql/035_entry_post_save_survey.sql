do $$
begin
  create type public.entry_survey_how_was_it as enum (
    'awful',
    'bad',
    'okay',
    'good',
    'exceptional'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.entry_survey_expectation_match as enum (
    'below_expectations',
    'met_expectations',
    'above_expectations'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.entry_survey_drink_again as enum (
    'yes',
    'no'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.wine_entries
  add column if not exists survey_how_was_it public.entry_survey_how_was_it,
  add column if not exists survey_expectation_match public.entry_survey_expectation_match,
  add column if not exists survey_drink_again public.entry_survey_drink_again;

comment on column public.wine_entries.survey_how_was_it is
  'Required post-save answer: How was the wine overall?';

comment on column public.wine_entries.survey_expectation_match is
  'Required post-save answer: How the wine compared to expectations.';

comment on column public.wine_entries.survey_drink_again is
  'Required post-save answer: Whether the user would drink the wine again.';
