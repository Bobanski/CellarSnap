-- Server-authoritative UGC screening and an owned report-review clock.
-- The pattern source is private so clients cannot enumerate or modify it.

create table if not exists private.content_moderation_patterns (
  key text primary key,
  category text not null check (category in ('credible_threat', 'hate', 'sexual_exploitation')),
  normalized_pattern text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on private.content_moderation_patterns from public, anon, authenticated, service_role;

insert into private.content_moderation_patterns (key, category, normalized_pattern)
values
  ('credible_direct_threat', 'credible_threat', '(^| )(i|we) (will|am going to|are going to) (kill|shoot|stab|rape) (you|him|her|them)($| )'),
  ('direct_self_harm_instruction', 'credible_threat', '(^| )(go )?kill yourself($| )'),
  ('racial_slur', 'hate', '(^| )(nigger|niggers|nigga|niggas)($| )'),
  ('homophobic_slur', 'hate', '(^| )(faggot|faggots)($| )'),
  ('child_sexual_material', 'sexual_exploitation', '(^| )(child|kid|minor) (porn|pornography|sex video|nude|nudes)($| )')
on conflict (key) do nothing;

create or replace function private.normalize_moderation_text(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(regexp_replace(
    translate(replace(replace(lower(coalesce(value, '')), '@', 'a'), '$', 's'), '013457', 'oieast'),
    '[^a-z0-9]+',
    ' ',
    'g'
  ));
$$;

revoke all on function private.normalize_moderation_text(text) from public, anon, authenticated, service_role;

create or replace function private.assert_shareable_text(value text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized text := private.normalize_moderation_text(value);
begin
  if normalized = '' then
    return;
  end if;

  if exists (
    select 1
    from private.content_moderation_patterns p
    where p.active
      and normalized ~ p.normalized_pattern
  ) then
    raise exception 'This content cannot be shared because it may violate the community guidelines.'
      using errcode = 'PT422';
  end if;
end;
$$;

revoke all on function private.assert_shareable_text(text) from public, anon, authenticated, service_role;

create or replace function private.moderate_entry_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from private.content_moderation_enforcements enforcement
    where enforcement.active
      and enforcement.target_type = 'comment'
      and enforcement.comment_id = new.id
  ) and (new.body is distinct from '[deleted]' or new.deleted_at is null) then
    raise exception 'Content removed for a community-guidelines violation cannot be restored.'
      using errcode = 'PT422';
  end if;
  if new.body is distinct from '[deleted]' then
    perform private.assert_shareable_text(new.body);
  end if;
  return new;
end;
$$;

revoke all on function private.moderate_entry_comment() from public, anon, authenticated, service_role;

drop trigger if exists moderate_entry_comment on public.entry_comments;
create trigger moderate_entry_comment
  before insert or update of body, deleted_at
  on public.entry_comments
  for each row
  execute function private.moderate_entry_comment();

create or replace function private.moderate_shared_wine_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  group_is_shared boolean := false;
  group_is_enforced boolean := false;
  group_text text;
  is_enforced boolean := false;
begin
  if new.entry_group_id is not null then
    select exists (
      select 1
      from public.entry_groups g
      join public.wine_entries anchor on anchor.id = g.anchor_entry_id
      where g.id = new.entry_group_id
        and anchor.entry_group_id = g.id
        and coalesce(anchor.is_feed_visible, false)
        and coalesce(anchor.entry_privacy::text, 'public') <> 'private'
    ) into group_is_shared;
    select exists (
      select 1
      from private.content_moderation_enforcements enforcement
      where enforcement.active and enforcement.group_id = new.entry_group_id
    ) into group_is_enforced;
  end if;

  if group_is_enforced and coalesce(new.is_feed_visible, false) then
    raise exception 'Content removed for a community-guidelines violation cannot be restored.'
      using errcode = 'PT422';
  end if;

  select exists (
    select 1
    from private.content_moderation_enforcements enforcement
    where enforcement.active
      and enforcement.target_type = 'entry'
      and enforcement.entry_id = new.id
  ) into is_enforced;

  if is_enforced and (
    coalesce(new.is_feed_visible, false)
    or coalesce(new.entry_privacy::text, 'public') <> 'private'
  ) then
    raise exception 'Content removed for a community-guidelines violation cannot be restored.'
      using errcode = 'PT422';
  end if;
  if is_enforced then
    return new;
  end if;

  -- Private cellar records remain private working notes. The same row is checked
  -- if it is later made feed-visible to any audience. A non-anchor group member
  -- is also screened whenever its anchor is already shared.
  if (
    coalesce(new.is_feed_visible, false)
    and coalesce(new.entry_privacy::text, 'public') <> 'private'
  ) or group_is_shared then
    perform private.assert_shareable_text(concat_ws(
      ' ',
      new.wine_name,
      new.producer,
      new.vintage,
      new.country,
      new.region,
      new.appellation,
      new.classification,
      new.notes,
      new.location_text,
      new.advanced_notes::text
    ));
  end if;

  -- Publishing an anchor screens the group title and every member rendered on
  -- the grouped feed card, even though non-anchor members remain individually hidden.
  if coalesce(new.is_feed_visible, false)
     and coalesce(new.entry_privacy::text, 'public') <> 'private'
     and new.entry_group_id is not null then
    select concat_ws(' ',
      g.title,
      string_agg(concat_ws(' ',
        member.wine_name,
        member.producer,
        member.vintage,
        member.country,
        member.region,
        member.appellation,
        member.classification,
        member.notes,
        member.location_text,
        member.advanced_notes::text
      ), ' ')
    ) into group_text
    from public.entry_groups g
    left join public.wine_entries member on member.entry_group_id = g.id
    where g.id = new.entry_group_id
    group by g.id, g.title;
    perform private.assert_shareable_text(group_text);
  end if;
  return new;
end;
$$;

revoke all on function private.moderate_shared_wine_entry() from public, anon, authenticated, service_role;

drop trigger if exists moderate_shared_wine_entry on public.wine_entries;
create trigger moderate_shared_wine_entry
  before insert or update of wine_name, producer, vintage, country, region, appellation,
    classification, notes, location_text, advanced_notes, entry_privacy, is_feed_visible,
    entry_group_id
  on public.wine_entries
  for each row
  execute function private.moderate_shared_wine_entry();

create or replace function private.moderate_entry_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from private.content_moderation_enforcements enforcement
    where enforcement.active and enforcement.group_id = new.id
  ) then
    raise exception 'Content removed for a community-guidelines violation cannot be restored.'
      using errcode = 'PT422';
  end if;
  if exists (
    select 1
    from public.wine_entries anchor
    where anchor.id = new.anchor_entry_id
      and anchor.entry_group_id = new.id
      and coalesce(anchor.is_feed_visible, false)
      and coalesce(anchor.entry_privacy::text, 'public') <> 'private'
  ) then
    perform private.assert_shareable_text(new.title);
  end if;
  return new;
end;
$$;

revoke all on function private.moderate_entry_group() from public, anon, authenticated, service_role;

drop trigger if exists moderate_entry_group on public.entry_groups;
create trigger moderate_entry_group
  before insert or update of title, anchor_entry_id
  on public.entry_groups
  for each row
  execute function private.moderate_entry_group();

create table if not exists private.content_report_reviews (
  id uuid primary key default gen_random_uuid(),
  report_id uuid unique references public.content_reports(id) on delete set null,
  reporter_id uuid not null,
  target_type text not null check (target_type in ('entry', 'comment')),
  entry_id uuid,
  comment_id uuid,
  target_user_id uuid not null,
  reason text,
  details text,
  content_snapshot jsonb not null,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  priority text not null check (priority in ('urgent', 'standard')),
  review_due_at timestamptz not null,
  assigned_to text,
  review_started_at timestamptz,
  reviewed_at timestamptz,
  resolution_notes text check (resolution_notes is null or char_length(resolution_notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (target_type = 'entry' and entry_id is not null and comment_id is null)
    or (target_type = 'comment' and entry_id is not null and comment_id is not null)
  )
);

create index if not exists content_report_reviews_open_due_idx
  on private.content_report_reviews (review_due_at, created_at);

create index if not exists content_report_reviews_target_idx
  on private.content_report_reviews (target_type, entry_id, comment_id, created_at desc);

revoke all on private.content_report_reviews from public, anon, authenticated, service_role;

-- This server-owned state keeps confirmed removals from being reversed through
-- ordinary author update privileges. An appeal can lift every active row for a
-- target only through a reviewed database-owner operation.
create table if not exists private.content_moderation_enforcements (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references private.content_report_reviews(id) on delete restrict,
  target_type text not null check (target_type in ('entry', 'comment')),
  entry_id uuid,
  comment_id uuid,
  group_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_reason text check (lifted_reason is null or char_length(lifted_reason) <= 2000),
  check (
    (target_type = 'entry' and entry_id is not null and comment_id is null)
    or (target_type = 'comment' and entry_id is not null and comment_id is not null)
  )
);

create index if not exists content_moderation_enforcements_entry_idx
  on private.content_moderation_enforcements (entry_id) where active;

create index if not exists content_moderation_enforcements_comment_idx
  on private.content_moderation_enforcements (comment_id) where active;

create index if not exists content_moderation_enforcements_group_idx
  on private.content_moderation_enforcements (group_id) where active and group_id is not null;

revoke all on private.content_moderation_enforcements from public, anon, authenticated, service_role;

create or replace function private.content_report_snapshot(
  report_target_type text,
  report_entry_id uuid,
  report_comment_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
begin
  if report_target_type = 'entry' then
    select jsonb_strip_nulls(jsonb_build_object(
      'wineName',e.wine_name,
      'producer',e.producer,
      'vintage',e.vintage,
      'country',e.country,
      'region',e.region,
      'appellation',e.appellation,
      'classification',e.classification,
      'notes',e.notes,
      'locationText',e.location_text,
      'advancedNotes',e.advanced_notes,
      'groupTitle',(
        select g.title from public.entry_groups g where g.id=e.entry_group_id
      ),
      'groupEntries',(
        select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id',member.id,
          'wineName',member.wine_name,
          'producer',member.producer,
          'vintage',member.vintage,
          'country',member.country,
          'region',member.region,
          'appellation',member.appellation,
          'classification',member.classification,
          'notes',member.notes,
          'locationText',member.location_text,
          'advancedNotes',member.advanced_notes
        )) order by member.id),'[]'::jsonb)
        from public.wine_entries member where member.entry_group_id=e.entry_group_id
      ),
      'labelImagePath',e.label_image_path,
      'placeImagePath',e.place_image_path,
      'pairingImagePath',e.pairing_image_path,
      'orderedPhotos',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'path',p.path,'type',p.type,'position',p.position
        ) order by p.position,p.id),'[]'::jsonb)
        from public.entry_photos p where p.entry_id=e.id
      ),
      'groupPhotos',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'path',s.path,'type',s.photo_type,'position',s.position
        ) order by s.position,s.id),'[]'::jsonb)
        from public.entry_group_slides s where s.group_id=e.entry_group_id
      )
    )) into strict snapshot
    from public.wine_entries e where e.id=report_entry_id;
  elsif report_target_type = 'comment' then
    select jsonb_strip_nulls(jsonb_build_object(
      'body',c.body,
      'parentCommentId',c.parent_comment_id
    )) into strict snapshot
    from public.entry_comments c where c.id=report_comment_id;
  else
    raise exception 'Invalid report target.' using errcode = '22023';
  end if;
  return snapshot;
end;
$$;

revoke all on function private.content_report_snapshot(text,uuid,uuid) from public, anon, authenticated, service_role;

create or replace function private.prepare_content_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_owner uuid;
  target_entry uuid;
  entry_privacy text;
begin
  if new.target_type = 'entry' then
    if new.entry_id is null or new.comment_id is not null then
      raise exception 'Invalid report target.' using errcode = '22023';
    end if;
    select e.user_id, e.id, e.entry_privacy::text
      into target_owner, target_entry, entry_privacy
      from public.wine_entries e
      where e.id = new.entry_id;
  elsif new.target_type = 'comment' then
    if new.comment_id is null then
      raise exception 'Invalid report target.' using errcode = '22023';
    end if;
    select c.user_id, c.entry_id, e.entry_privacy::text
      into target_owner, target_entry, entry_privacy
      from public.entry_comments c
      join public.wine_entries e on e.id = c.entry_id
      where c.id = new.comment_id;
  else
    raise exception 'Invalid report target.' using errcode = '22023';
  end if;

  if target_owner is null then
    raise exception 'Report target not found.' using errcode = '22023';
  end if;
  if not public.can_view_entry(new.reporter_id, (
    select e.user_id from public.wine_entries e where e.id = target_entry
  ), entry_privacy) then
    raise exception 'Report target is unavailable.' using errcode = '42501';
  end if;

  new.entry_id := target_entry;
  new.target_user_id := target_owner;
  new.status := 'open';
  new.created_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function private.prepare_content_report() from public, anon, authenticated, service_role;

drop trigger if exists prepare_content_report on public.content_reports;
create trigger prepare_content_report
  before insert
  on public.content_reports
  for each row
  execute function private.prepare_content_report();

create or replace function private.enqueue_content_report_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  report_priority text := case
    when new.reason in ('harassment', 'hate', 'violence', 'child_safety', 'nudity') then 'urgent'
    else 'standard'
  end;
  snapshot jsonb;
begin
  snapshot := private.content_report_snapshot(new.target_type,new.entry_id,new.comment_id);

  insert into private.content_report_reviews (
    report_id,
    reporter_id,
    target_type,
    entry_id,
    comment_id,
    target_user_id,
    reason,
    details,
    content_snapshot,
    status,
    priority,
    review_due_at,
    created_at,
    updated_at
  ) values (
    new.id,
    new.reporter_id,
    new.target_type,
    new.entry_id,
    new.comment_id,
    new.target_user_id,
    new.reason,
    new.details,
    snapshot,
    'open',
    report_priority,
    new.created_at + case
      when report_priority = 'urgent' then interval '4 hours'
      else interval '24 hours'
    end,
    new.created_at,
    new.created_at
  );
  return new;
end;
$$;

revoke all on function private.enqueue_content_report_review() from public, anon, authenticated, service_role;

drop trigger if exists enqueue_content_report_review on public.content_reports;
create trigger enqueue_content_report_review
  after insert
  on public.content_reports
  for each row
  execute function private.enqueue_content_report_review();

-- Canonicalize active historical receipts before queueing them. Prior clients
-- supplied target_user_id and could also supply the wrong entry for a comment.
update public.content_reports r
set status='dismissed'
where r.status in ('open','reviewing')
  and (
    (r.target_type='entry' and (
      r.entry_id is null
      or not exists (select 1 from public.wine_entries e where e.id=r.entry_id)
    ))
    or (r.target_type='comment' and (
      r.comment_id is null
      or not exists (select 1 from public.entry_comments c where c.id=r.comment_id)
    ))
  );

update public.content_reports r
set status='dismissed'
from public.wine_entries e
where r.status in ('open','reviewing')
  and r.target_type='entry'
  and r.entry_id=e.id
  and r.reporter_id=e.user_id;

update public.content_reports r
set status='dismissed'
from public.entry_comments c
where r.status in ('open','reviewing')
  and r.target_type='comment'
  and r.comment_id=c.id
  and r.reporter_id=c.user_id;

update public.content_reports r
set target_user_id=e.user_id
from public.wine_entries e
where r.status in ('open','reviewing')
  and r.target_type='entry'
  and r.entry_id=e.id
  and r.target_user_id is distinct from e.user_id;

update public.content_reports r
set entry_id=c.entry_id,target_user_id=c.user_id
from public.entry_comments c
where r.status in ('open','reviewing')
  and r.target_type='comment'
  and r.comment_id=c.id
  and (r.entry_id is distinct from c.entry_id or r.target_user_id is distinct from c.user_id);

insert into private.content_report_reviews (
  report_id,reporter_id,target_type,entry_id,comment_id,target_user_id,
  reason,details,content_snapshot,status,priority,review_due_at,created_at,updated_at
)
select
  r.id,r.reporter_id,r.target_type,r.entry_id,r.comment_id,r.target_user_id,
  r.reason,r.details,private.content_report_snapshot(r.target_type,r.entry_id,r.comment_id),
  r.status,
  case when r.reason in ('harassment','hate','violence','child_safety','nudity') then 'urgent' else 'standard' end,
  r.created_at + case
    when r.reason in ('harassment','hate','violence','child_safety','nudity') then interval '4 hours'
    else interval '24 hours'
  end,
  r.created_at,clock_timestamp()
from public.content_reports r
where r.status in ('open','reviewing')
on conflict (report_id) do nothing;

-- RLS already limits report receipts to their submitter and has no client
-- update/delete policies. Remove unused table privileges as defense in depth.
revoke update, delete on public.content_reports from authenticated;
