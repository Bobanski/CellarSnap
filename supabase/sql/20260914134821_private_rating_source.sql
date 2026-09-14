-- B02v / QC-01: staged owner-only source. Installation does NOT activate cutoff.
begin;
create table private.rating_source_state (
  singleton boolean primary key default true check(singleton),
  isolated boolean not null default false,
  activated_at timestamptz
);
insert into private.rating_source_state(singleton) values(true);
alter table private.rating_source_state enable row level security;
revoke all on private.rating_source_state from public,anon,authenticated,service_role;

create table public.wine_entry_ratings (
  entry_id uuid primary key references public.wine_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating integer check(rating between 1 and 100)
);
create index wine_entry_ratings_user_id on public.wine_entry_ratings(user_id);
alter table public.wine_entry_ratings enable row level security;
revoke all on public.wine_entry_ratings from public,anon,authenticated,service_role;
grant select on public.wine_entry_ratings to anon,authenticated,service_role;
create policy "Owners read private entry ratings" on public.wine_entry_ratings
  for select to authenticated using(user_id=(select auth.uid()));
-- anon SELECT is deliberate for the invoker LEFT JOIN; RLS supplies zero rows.

alter table public.wine_entries add column public_rating_label text
  check(public_rating_label in ('Loved it','Really liked it','Liked it','Tried it'));
create function private.rating_band(value integer) returns text
language sql immutable security invoker set search_path='' as $$
 select case when value is null then null when value>=90 then 'Loved it'
 when value>=75 then 'Really liked it' when value>=60 then 'Liked it' else 'Tried it' end
$$;
revoke all on function private.rating_band(integer) from public,anon,authenticated,service_role;

insert into public.wine_entry_ratings(entry_id,user_id,rating)
 select id,user_id,rating from public.wine_entries;
-- The derived band is excluded from knowledge fingerprints. Installing it must
-- not empty valid personal knowledge; ALTER holds the writer exclusion lock.
alter table public.wine_entries disable trigger invalidate_entry_knowledge;
update public.wine_entries set public_rating_label=private.rating_band(rating);
alter table public.wine_entries enable trigger invalidate_entry_knowledge;

-- This trigger is the sole rating writer. It runs only after successful row
-- writes (ON CONFLICT DO NOTHING cannot alter an existing private value).
-- In isolated mode the second, internal update erases the transient input.
-- The null transition from a non-null OLD input identifies that internal erase;
-- an explicit null write to a committed null row still clears the private value.
create function private.capture_entry_rating() returns trigger
language plpgsql security definer set search_path='' as $$
declare isolated boolean;
begin
  if current_setting('role',true)='authenticated' and
     (auth.uid() is null or new.user_id<>auth.uid()) then
    raise exception 'Entry owner required' using errcode='42501';
  end if;
  -- Trigger selection is catalog state, not a transaction snapshot of a flag.
  -- Transactions opened before cutoff cannot observe a stale non-isolated mode.
  isolated := TG_NAME='isolate_entry_rating';
  if isolated and TG_OP='UPDATE' and old.rating is not null and new.rating is null then
    return new;
  end if;
  insert into public.wine_entry_ratings(entry_id,user_id,rating)
    values(new.id,new.user_id,new.rating)
    on conflict(entry_id) do update set user_id=excluded.user_id,rating=excluded.rating;
  if isolated and new.rating is not null then
    update public.wine_entries set rating=null,public_rating_label=private.rating_band(new.rating) where id=new.id;
  else
    update public.wine_entries set public_rating_label=private.rating_band(new.rating) where id=new.id;
  end if;
  return new;
end $$;
revoke all on function private.capture_entry_rating() from public,anon,authenticated,service_role;
create trigger capture_entry_rating after insert or update of rating on public.wine_entries
 for each row execute function private.capture_entry_rating();
create trigger isolate_entry_rating after insert or update of rating on public.wine_entries
 for each row execute function private.capture_entry_rating();
alter table public.wine_entries disable trigger isolate_entry_rating;

-- Ownership is immutable once an entry exists, including privileged accidental
-- reparenting; delete/recreate is an explicit lifecycle operation.
create function private.guard_entry_rating_owner() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.user_id is distinct from old.user_id then
  raise exception 'Entry ownership cannot change' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function private.guard_entry_rating_owner() from public,anon,authenticated,service_role;
create trigger guard_entry_rating_owner before update of user_id on public.wine_entries
 for each row execute function private.guard_entry_rating_owner();

-- Prevent ordinary clients forging the derived public band. Preserve every
-- existing writable field and keep SELECT/DELETE/RLS semantics unchanged.
revoke insert,update on public.wine_entries from public,anon,authenticated;
do $$ declare cols text; begin
 select string_agg(quote_ident(attname),',' order by attnum) into cols
 from pg_attribute where attrelid='public.wine_entries'::regclass and attnum>0 and not attisdropped
 and attname<>'public_rating_label';
 execute 'grant insert('||cols||'),update('||cols||') on public.wine_entries to authenticated';
end $$;

-- Current row visibility remains wine_entries RLS; the second relation adds an
-- independent owner-only numeric boundary. Service readers retain their source.
do $$ declare cols text; begin
 select string_agg(case when attname='rating' then 'r.rating as rating' else 'e.'||quote_ident(attname) end,',' order by attnum)
 into cols from pg_attribute where attrelid='public.wine_entries'::regclass and attnum>0 and not attisdropped;
 execute 'create view public.wine_entries_with_ratings with (security_invoker=true) as select '||cols||
 ' from public.wine_entries e left join public.wine_entry_ratings r on r.entry_id=e.id and r.user_id=e.user_id';
end $$;
revoke all on public.wine_entries_with_ratings from public,anon,authenticated,service_role;
grant select on public.wine_entries_with_ratings to anon,authenticated,service_role;

-- Explicit operator-only activation, after consumer deployment/native acceptance.
-- Never run as a migration side effect. A short table lock drains in-flight writes.
-- Refuse realtime publication of the input table: AFTER triggers erase committed
-- tuples but intermediate WAL must not be distributed as public change events.
create function private.activate_rating_isolation() returns jsonb
language plpgsql security invoker set search_path='' set lock_timeout='2s' as $$
declare n bigint;
begin
 lock table public.wine_entries in access exclusive mode;
 perform 1 from private.rating_source_state for update;
 if exists(select from pg_publication_tables where schemaname='public' and tablename in ('wine_entries','wine_entry_ratings')) then
  raise exception 'Review realtime publication before rating cutoff' using errcode='22023';
 end if;
 if (select isolated from private.rating_source_state) then
  return jsonb_build_object('isolated',true,'replayed',true);
 end if;
 if exists(select from public.wine_entries e left join public.wine_entry_ratings r on r.entry_id=e.id
 where r.entry_id is null or r.user_id<>e.user_id or r.rating is distinct from e.rating
 or e.public_rating_label is distinct from private.rating_band(e.rating)) then
  raise exception 'Rating source parity failed' using errcode='PT409';
 end if;
 alter table public.wine_entries disable trigger capture_entry_rating;
 alter table public.wine_entries disable trigger invalidate_entry_knowledge;
 update public.wine_entries set rating=null where rating is not null;
 get diagnostics n=row_count;
 update private.rating_source_state set isolated=true,activated_at=clock_timestamp();
 alter table public.wine_entries enable trigger isolate_entry_rating;
 alter table public.wine_entries enable trigger invalidate_entry_knowledge;
 return jsonb_build_object('isolated',true,'replayed',false,'transferred',n);
end $$;
revoke all on function private.activate_rating_isolation() from public,anon,authenticated,service_role;
create or replace function public.save_entry_details(
  p_entry_id uuid, p_updates jsonb, p_expected jsonb,
  p_grape_ids uuid[] default null, p_expected_grape_ids uuid[] default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  viewer uuid := auth.uid();
  current_entry public.wine_entries%rowtype;
  current_fields jsonb;
  current_grapes uuid[];
  update_keys text[];
  expected_keys text[];
  assignments text;
  allowed_keys constant text[] := array[
    'wine_name','producer','vintage','country','region','appellation','classification',
    'rating','price_paid','price_paid_currency','price_paid_source','qpr_level',
    'location_text','location_place_id','consumed_at','notes','tasted_with_user_ids',
    'advanced_notes','is_feed_visible',
    'wine_type','entry_privacy','reaction_privacy','comments_privacy'
  ];
begin
  if viewer is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_updates is null or p_expected is null
    or jsonb_typeof(p_updates) <> 'object' or jsonb_typeof(p_expected) <> 'object'
    or octet_length(p_updates::text) > 65536 or octet_length(p_expected::text) > 65536 then
    raise exception 'Invalid entry edit payload' using errcode='22023';
  end if;
  select coalesce(array_agg(k order by k),'{}') into update_keys from jsonb_object_keys(p_updates) k;
  select coalesce(array_agg(k order by k),'{}') into expected_keys from jsonb_object_keys(p_expected) k;
  if update_keys is distinct from expected_keys or not update_keys <@ allowed_keys then
    raise exception 'Unsupported entry edit fields' using errcode='22023';
  end if;
  -- These hosted columns are text, so the new command must enforce the
  -- web domain contract itself (including direct Data API callers).
  if exists(select 1 from jsonb_each(p_updates) field
    where field.key in ('entry_privacy','reaction_privacy','comments_privacy')
      and field.value not in ('"public"'::jsonb,'"friends_of_friends"'::jsonb,'"friends"'::jsonb,'"private"'::jsonb))
    or (p_updates ? 'wine_type' and p_updates->'wine_type' not in
      ('null'::jsonb,'"red"'::jsonb,'"white"'::jsonb,'"rose"'::jsonb,'"sparkling"'::jsonb,'"sweet"'::jsonb,'"orange"'::jsonb)) then
    raise exception 'Invalid wine type or privacy' using errcode='22023';
  end if;
  if (p_grape_ids is null) <> (p_expected_grape_ids is null)
    or cardinality(p_grape_ids) > 3 or cardinality(p_expected_grape_ids) > 3
    or array_position(p_grape_ids,null) is not null
    or array_position(p_expected_grape_ids,null) is not null
    or (p_grape_ids is not null and cardinality(p_grape_ids) <> (select count(distinct id) from unnest(p_grape_ids) id)) then
    raise exception 'Invalid ordered grape selection' using errcode='22023';
  end if;

  -- Serializes adopting editors. The predicate is mandatory even for trusted
  -- test viewers who may SELECT foreign entries through their read policies.
  perform 1 from public.wine_entries where id=p_entry_id and user_id=viewer for update;
  select e.* into current_entry from public.wine_entries_with_ratings e
    where e.id=p_entry_id and e.user_id=viewer;
  if not found then raise exception 'Entry unavailable' using errcode='42501'; end if;
  select coalesce(jsonb_object_agg(k,to_jsonb(current_entry)->k),'{}') into current_fields
    from unnest(update_keys) k;
  if p_grape_ids is not null then
    perform 1 from public.entry_primary_grapes where entry_id=p_entry_id order by position for update;
    select coalesce(array_agg(variety_id order by position),'{}') into current_grapes
      from public.entry_primary_grapes where entry_id=p_entry_id;
    if (select count(*) from public.grape_varieties where id=any(p_grape_ids)) <> cardinality(p_grape_ids) then
      raise exception 'Invalid grape variety' using errcode='22023';
    end if;
  end if;

  -- A lost success response can be retried without deleting/reinserting links
  -- or repeating writes/triggers when the requested state is already present.
  if current_fields = p_updates and (p_grape_ids is null or current_grapes = p_grape_ids) then
    return jsonb_build_object('entry',to_jsonb(current_entry),'replayed',true);
  end if;
  if current_fields is distinct from p_expected
    or (p_grape_ids is not null and current_grapes is distinct from p_expected_grape_ids) then
    raise exception 'Entry changed elsewhere. Close the editor and refresh before saving again.' using errcode='PT409';
  end if;

  if current_fields is distinct from p_updates then
    select string_agg(format('%1$I = incoming.%1$I',k),', ' order by k) into assignments from unnest(update_keys) k;
    execute format('update public.wine_entries e set %s from jsonb_populate_record(null::public.wine_entries,$1) incoming where e.id=$2 and e.user_id=$3',assignments)
      using p_updates,p_entry_id,viewer;
  end if;
  if p_grape_ids is not null and current_grapes is distinct from p_grape_ids then
    delete from public.entry_primary_grapes where entry_id=p_entry_id;
    insert into public.entry_primary_grapes(entry_id,variety_id,position)
      select p_entry_id,id,ordinality::smallint from unnest(p_grape_ids) with ordinality as grapes(id,ordinality);
  end if;
  select * into current_entry from public.wine_entries_with_ratings where id=p_entry_id and user_id=viewer;
  return jsonb_build_object('entry',to_jsonb(current_entry),'replayed',false);
end;
$$;
CREATE OR REPLACE FUNCTION public.entry_knowledge_snapshot(target_entry_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'extensions'
    AS $$
  select jsonb_build_object('entry', to_jsonb(e)-'public_rating_label', 'primary_grapes', coalesce((
    select jsonb_agg(jsonb_build_object('id', g.variety_id, 'name', v.name, 'position', g.position)
      order by g.position, g.id)
    from public.entry_primary_grapes g
    join public.grape_varieties v on v.id = g.variety_id
    where g.entry_id = e.id
  ), '[]'::jsonb))
  from public.wine_entries_with_ratings e where e.id = target_entry_id;
$$;


commit;
