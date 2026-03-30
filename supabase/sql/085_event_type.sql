-- Add event_type column to entry_groups
-- Stores the predefined event type (tasting, dinner, etc.)
-- The existing title column becomes a private custom name visible only to the author

alter table public.entry_groups
  add column if not exists event_type text;

comment on column public.entry_groups.event_type is
  'Predefined event type slug (tasting, dinner, blind_tasting, etc.). Shown on feed instead of title.';
