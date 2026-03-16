alter table public.content_reports
  drop constraint if exists content_reports_entry_id_fkey;

alter table public.content_reports
  add constraint content_reports_entry_id_fkey
  foreign key (entry_id)
  references public.wine_entries(id)
  on delete cascade;

alter table public.content_reports
  drop constraint if exists content_reports_comment_id_fkey;

alter table public.content_reports
  add constraint content_reports_comment_id_fkey
  foreign key (comment_id)
  references public.entry_comments(id)
  on delete cascade;
