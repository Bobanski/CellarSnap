with ranked_entry_reports as (
  select
    id,
    row_number() over (
      partition by reporter_id, entry_id
      order by created_at desc, id desc
    ) as duplicate_rank
  from public.content_reports
  where target_type = 'entry'
    and entry_id is not null
    and status in ('open', 'reviewing')
)
update public.content_reports reports
set status = 'dismissed'
from ranked_entry_reports ranked
where reports.id = ranked.id
  and ranked.duplicate_rank > 1;

with ranked_comment_reports as (
  select
    id,
    row_number() over (
      partition by reporter_id, comment_id
      order by created_at desc, id desc
    ) as duplicate_rank
  from public.content_reports
  where target_type = 'comment'
    and comment_id is not null
    and status in ('open', 'reviewing')
)
update public.content_reports reports
set status = 'dismissed'
from ranked_comment_reports ranked
where reports.id = ranked.id
  and ranked.duplicate_rank > 1;

create unique index if not exists content_reports_unique_active_entry_per_reporter_idx
  on public.content_reports (reporter_id, entry_id)
  where target_type = 'entry'
    and entry_id is not null
    and status in ('open', 'reviewing');

create unique index if not exists content_reports_unique_active_comment_per_reporter_idx
  on public.content_reports (reporter_id, comment_id)
  where target_type = 'comment'
    and comment_id is not null
    and status in ('open', 'reviewing');
