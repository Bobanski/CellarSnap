alter table public.wine_entries
  add column if not exists ai_notes_summary text;

comment on column public.wine_entries.ai_notes_summary is
  'Short AI-generated caption summary derived from tasting notes for feed display.';
