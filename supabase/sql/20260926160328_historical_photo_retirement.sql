-- B02z / AUD-01. Retire already-preserved historical sources only after an
-- explicit durable fence, exact-object CAS, deletion confirmation, and
-- independently observed raw/transformed CDN denial.
begin;

alter table private.photo_retired_paths alter column operation_id drop not null;
alter table private.photo_retired_paths add column archive_operation_id uuid
 references private.photo_archive_operations(id);
alter table private.photo_retired_paths add constraint photo_retired_paths_one_operation
 check ((operation_id is not null)::integer + (archive_operation_id is not null)::integer = 1);
create index photo_retired_paths_rekey_operation_idx on private.photo_retired_paths(operation_id)
 where operation_id is not null;
create index photo_retired_paths_archive_operation_idx on private.photo_retired_paths(archive_operation_id)
 where archive_operation_id is not null;

alter table private.photo_archive_operations add column retirement_phase text
 check(retirement_phase in ('fenced','deleting','deleted_pending_cdn','verified'));
alter table private.photo_archive_operations add column retirement_evidence jsonb;
alter table private.photo_archive_operations add column deleted_at timestamptz;
alter table private.photo_archive_operations add constraint photo_archive_retirement_state
 check(retirement_phase is null or state='copied');
alter table private.photo_archive_operations add constraint photo_archive_deleted_timestamp
 check(coalesce(retirement_phase in ('deleted_pending_cdn','verified'),false) = (deleted_at is not null));
alter table private.photo_archive_operations add constraint photo_archive_evidence_state
 check(coalesce(retirement_phase='verified',false) = (retirement_evidence is not null));

create function private.photo_archive_source_snapshot_valid(current_snapshot jsonb, expected_snapshot jsonb,
 source_path text, require_source boolean) returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare current_object jsonb; expected_object jsonb; object_path text;
begin
 if current_snapshot is null or expected_snapshot is null
  or current_snapshot->'refs'<>'[]'::jsonb
  or current_snapshot->'sources' is distinct from expected_snapshot->'sources'
  or jsonb_array_length(current_snapshot->'objects')<>jsonb_array_length(expected_snapshot->'objects') then return false; end if;
 for current_object in select * from jsonb_array_elements(current_snapshot->'objects') loop
  object_path:=current_object->>'path';
  select value into expected_object from jsonb_array_elements(expected_snapshot->'objects') where value->>'path'=object_path;
  if expected_object is null then return false; end if;
  if object_path=source_path then
   if require_source<>(current_object->'object'<>'null'::jsonb)
    or (require_source and current_object is distinct from expected_object) then return false; end if;
  elsif current_object is distinct from expected_object then
   if current_object->'object'<>'null'::jsonb or not exists(
    select from private.photo_retired_paths retired join private.photo_archive_operations sibling
     on sibling.id=retired.archive_operation_id
    where retired.path=object_path and sibling.source_path=object_path and sibling.state='copied'
     and sibling.retirement_phase in ('deleting','deleted_pending_cdn','verified')) then return false; end if;
  end if;
 end loop;
 return true;
end $$;
revoke all on function private.photo_archive_source_snapshot_valid(jsonb,jsonb,text,boolean) from public,anon,authenticated,service_role;

create function private.prepare_photo_archive_retirement(operation_id uuid) returns jsonb
language plpgsql security invoker set search_path='' set lock_timeout='2s' as $$
declare op private.photo_archive_operations; snap jsonb; retired private.photo_retired_paths;
begin
 update private.photo_delivery_state set fence_epoch=fence_epoch+1;
 if not (select legacy_disabled from private.photo_delivery_state) then
  raise exception 'Legacy signing cutoff required' using errcode='22023';
 end if;
 select * into strict op from private.photo_archive_operations where id=operation_id for update;
 if op.state<>'copied' then raise exception 'Verified archive copy required' using errcode='22023'; end if;
 if op.retirement_phase is not null then
  if not exists(select from private.photo_retired_paths where path=op.source_path and archive_operation_id=op.id) then
   raise exception 'Durable archive fence required' using errcode='22023'; end if;
  return to_jsonb(op);
 end if;
 lock table public.wine_entries,public.entry_photos,public.entry_group_slides,
  public.profiles,public.user_collection_items,public.user_collections in share mode;
 lock table storage.buckets,storage.objects in share mode;
 snap:=private.photo_archive_snapshot(op.source_path,op.archive_path);
 if not private.photo_archive_source_snapshot_valid(snap->'source',op.expected,op.source_path,true) then
  raise exception 'Historical source changed or gained references' using errcode='PT409'; end if;
 if not coalesce((snap->>'protected')::boolean and snap->'archive'=op.proof->'object'
  and op.proof->>'sha256'=op.receipt->>'sha256' and op.proof->'size'=op.receipt->'size',false) then
  raise exception 'Protected archive proof changed' using errcode='PT409'; end if;
 select * into retired from private.photo_retired_paths where path=op.source_path;
 if found and retired.archive_operation_id is distinct from op.id then
  raise exception 'Source path is fenced by another operation' using errcode='PT409'; end if;
 insert into private.photo_retired_paths(path,archive_operation_id) values(op.source_path,op.id)
 on conflict(path) do nothing;
 update private.photo_archive_operations set retirement_phase='fenced' where id=op.id returning * into op;
 return to_jsonb(op);
end $$;
revoke all on function private.prepare_photo_archive_retirement(uuid) from public,anon,authenticated,service_role;

create function private.begin_photo_archive_deletion(operation_id uuid) returns jsonb
language plpgsql security invoker set search_path='' set lock_timeout='2s' as $$
declare op private.photo_archive_operations; snap jsonb;
begin
 perform 1 from private.photo_delivery_state for update;
 select * into strict op from private.photo_archive_operations where id=operation_id for update;
 if op.retirement_phase not in ('fenced','deleting') then
  raise exception 'Archive retirement is not fenced' using errcode='22023'; end if;
 lock table public.wine_entries,public.entry_photos,public.entry_group_slides,
  public.profiles,public.user_collection_items,public.user_collections in share mode;
 lock table storage.buckets,storage.objects in share mode;
 if not exists(select from private.photo_retired_paths where path=op.source_path and archive_operation_id=op.id) then
  raise exception 'Durable archive fence required' using errcode='22023'; end if;
 snap:=private.photo_archive_snapshot(op.source_path,op.archive_path);
 if not private.photo_archive_source_snapshot_valid(snap->'source',op.expected,op.source_path,true) then
  raise exception 'Historical source changed or gained references' using errcode='PT409'; end if;
 if not coalesce((snap->>'protected')::boolean and snap->'archive'=op.proof->'object',false) then
  raise exception 'Protected archive proof changed' using errcode='PT409'; end if;
 if op.retirement_phase='fenced' then
  update private.photo_archive_operations set retirement_phase='deleting' where id=op.id returning * into op;
 end if;
 return to_jsonb(op);
end $$;
revoke all on function private.begin_photo_archive_deletion(uuid) from public,anon,authenticated,service_role;

create function private.confirm_photo_archive_deletion(operation_id uuid) returns jsonb
language plpgsql security invoker set search_path='' set lock_timeout='2s' as $$
declare op private.photo_archive_operations; snap jsonb;
begin
 select * into strict op from private.photo_archive_operations where id=operation_id for update;
 if op.retirement_phase in ('deleted_pending_cdn','verified') then return to_jsonb(op); end if;
 if op.retirement_phase<>'deleting' then raise exception 'Archive deletion was not begun' using errcode='22023'; end if;
 lock table public.wine_entries,public.entry_photos,public.entry_group_slides,
  public.profiles,public.user_collection_items,public.user_collections in share mode;
 lock table storage.buckets,storage.objects in share mode;
 if not exists(select from private.photo_retired_paths where path=op.source_path and archive_operation_id=op.id) then
  raise exception 'Durable archive fence required' using errcode='22023'; end if;
 snap:=private.photo_archive_snapshot(op.source_path,op.archive_path);
 if not private.photo_archive_source_snapshot_valid(snap->'source',op.expected,op.source_path,false) then
  raise exception 'Historical source cohort changed or source still exists' using errcode='PT409'; end if;
 if not coalesce((snap->>'protected')::boolean and snap->'archive'=op.proof->'object',false) then
  raise exception 'Protected archive proof changed' using errcode='PT409'; end if;
 update private.photo_archive_operations set retirement_phase='deleted_pending_cdn',deleted_at=clock_timestamp()
 where id=op.id returning * into op;
 return to_jsonb(op);
end $$;
revoke all on function private.confirm_photo_archive_deletion(uuid) from public,anon,authenticated,service_role;

create function private.record_photo_archive_revocation_evidence(operation_id uuid, observations jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare op private.photo_archive_operations; region text; regions text[];
begin
 select * into strict op from private.photo_archive_operations where id=operation_id for update;
 if op.retirement_phase not in ('deleted_pending_cdn','verified') or op.deleted_at is null then
  raise exception 'Archive source deletion not confirmed' using errcode='22023'; end if;
 if observations is null or jsonb_typeof(observations)<>'array' or jsonb_array_length(observations)>40
  or octet_length(observations::text)>32768 then
  raise exception 'Invalid denial observations' using errcode='22023'; end if;
 if exists(select from jsonb_array_elements(observations) o where not coalesce(
  jsonb_typeof(o)='object'
  and o ?& array['region','path','surface','status','observed_at','capability_sha256','source_sha256','warm_sha256','warmed_at','warm_status']
  and o->>'region' ~ '^[a-zA-Z0-9_-]{2,64}$' and o->>'path'=op.source_path
  and o->>'surface' in ('raw','transformed') and o->>'status' in ('400','403','404')
  and o->>'capability_sha256' ~ '^[a-f0-9]{64}$' and o->>'source_sha256'=op.receipt->>'sha256'
  and o->>'warm_sha256' ~ '^[a-f0-9]{64}$' and o->>'warm_status'='200'
  and (o->>'warmed_at')::timestamptz<=op.deleted_at
  and (o->>'observed_at')::timestamptz>=op.deleted_at and (o->>'observed_at')::timestamptz<=clock_timestamp(),false)) then
  raise exception 'Invalid or unrelated denial observation' using errcode='22023'; end if;
 select array_agg(distinct o->>'region') into regions from jsonb_array_elements(observations) o;
 if coalesce(cardinality(regions),0)<2 then raise exception 'Two independently observed regions required' using errcode='22023'; end if;
 foreach region in array regions loop
  if (select count(distinct o->>'surface') from jsonb_array_elements(observations) o
    where o->>'region'=region and o->>'path'=op.source_path)<>2 then
   raise exception 'Raw and transformed denials required in every region' using errcode='22023'; end if;
 end loop;
 update private.photo_archive_operations set retirement_phase='verified',retirement_evidence=observations
 where id=op.id returning * into op;
 return to_jsonb(op);
end $$;
revoke all on function private.record_photo_archive_revocation_evidence(uuid,jsonb) from public,anon,authenticated,service_role;

commit;
