-- B02y / AUD-01, AUD-22. Preservation only: no source deletion, reference
-- changes, new tombstones or capability-retirement authorization.
begin;
do $$ begin
 if not exists(select from pg_class where oid='storage.objects'::regclass and relrowsecurity)
  or not exists(select from pg_class where oid='storage.buckets'::regclass and relrowsecurity) then
  raise exception 'Managed Storage RLS must be enabled before archival';
 end if;
end $$;
-- Refuse to adopt an existing bucket of unknown provenance/configuration.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('photo-recovery-archive','photo-recovery-archive',false,26214400,
 array['image/jpeg','image/png','image/webp','image/gif','image/avif','image/heic','image/heif']);
create policy "Recovery archive denies client objects" on storage.objects
 as restrictive for all to anon,authenticated
 using(bucket_id<>'photo-recovery-archive') with check(bucket_id<>'photo-recovery-archive');
create policy "Recovery archive denies client bucket" on storage.buckets
 as restrictive for all to anon,authenticated
 using(id<>'photo-recovery-archive') with check(id<>'photo-recovery-archive');

create table private.photo_archive_operations (
 id uuid primary key,
 source_path text not null,
 archive_path text not null unique,
 receipt jsonb not null,
 expected jsonb not null,
 state text not null default 'planned' check(state in ('planned','copied','abandoned')),
 proof jsonb,
 created_at timestamptz not null default now(),
 verified_at timestamptz,
 check((state='copied') = (verified_at is not null and proof is not null))
);
create unique index photo_archive_active_source on private.photo_archive_operations(source_path) where state<>'abandoned';
alter table private.photo_archive_operations enable row level security;
revoke all on private.photo_archive_operations from public,anon,authenticated,service_role;

-- Reuse the canonical nine-column reference snapshot for both base/original.
-- An original belonging to a missing referenced crop must remain held.
create function private.photo_archive_snapshot(source_path text, archive_path text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare base text; sibling text; archive_object jsonb;
begin
 if source_path is null or length(source_path) not between 1 and 1024
  or source_path ~ '[\\[:cntrl:]]' or source_path ~ '(^|/)\.{1,2}(/|$)'
  or source_path ~ '(^/|/$|//)' then raise exception 'Invalid archive source path' using errcode='22023'; end if;
 base:=regexp_replace(source_path,'__original(\.[a-zA-Z0-9]+)?$','\1');
 sibling:=case when base ~ '\.[a-zA-Z0-9]+$' then regexp_replace(base,'(\.[a-zA-Z0-9]+)$','__original\1') else base||'__original' end;
 select jsonb_build_object('id',id,'version',version,'updated_at',updated_at,'metadata',metadata) into archive_object
 from storage.objects where bucket_id='photo-recovery-archive' and name=archive_path;
 return jsonb_build_object('source',private.photo_rekey_snapshot(array[base,sibling]),'archive',archive_object,
  'protected',exists(select from storage.buckets where id='photo-recovery-archive' and public=false));
end $$;
revoke all on function private.photo_archive_snapshot(text,text) from public,anon,authenticated,service_role;

create function private.plan_photo_archive(operation_id uuid, old_path text, recovery_receipt jsonb) returns jsonb
language plpgsql security invoker set search_path='' set lock_timeout='2s' as $$
declare op private.photo_archive_operations; snap jsonb; source_object jsonb; dest text;
begin
 if operation_id is null or not coalesce(jsonb_typeof(recovery_receipt)='object'
  and recovery_receipt ?& array['backup_id','size','sha256','inventory_sha256','backup_index_sha256']
  and recovery_receipt->>'backup_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and recovery_receipt->>'sha256' ~ '^[a-f0-9]{64}$'
  and recovery_receipt->>'inventory_sha256' ~ '^[a-f0-9]{64}$'
  and recovery_receipt->>'backup_index_sha256' ~ '^[a-f0-9]{64}$'
  and jsonb_typeof(recovery_receipt->'size')='number'
  and recovery_receipt->>'size' ~ '^[0-9]+$'
  and (recovery_receipt->>'size')::numeric between 1 and 26214400
  and octet_length(recovery_receipt::text)<2048,false)
 then raise exception 'Invalid verified recovery receipt' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(old_path,9282));
 select * into op from private.photo_archive_operations where id=operation_id;
 if found then
  if op.source_path is distinct from old_path or op.receipt is distinct from recovery_receipt then
   raise exception 'Archive operation identity mismatch' using errcode='22023'; end if;
  return to_jsonb(op);
 end if;
 dest:=operation_id::text||'/preserved';
 snap:=private.photo_archive_snapshot(old_path,dest);
 select o->'object' into source_object from jsonb_array_elements(snap->'source'->'objects') o where o->>'path'=old_path;
 if jsonb_array_length(snap->'source'->'refs')<>0 then raise exception 'Referenced cohort requires recovery review' using errcode='PT409'; end if;
 if source_object is null or source_object='null'::jsonb
  or source_object->>'id' is distinct from recovery_receipt->>'backup_id'
  or source_object->'metadata'->>'size' is distinct from recovery_receipt->>'size'
 then raise exception 'Historical source changed or missing' using errcode='PT409'; end if;
 if not (snap->>'protected')::boolean then raise exception 'Archive bucket protection changed' using errcode='PT409'; end if;
 if snap->'archive'<>'null'::jsonb then raise exception 'Archive destination already exists' using errcode='23505'; end if;
 insert into private.photo_archive_operations(id,source_path,archive_path,receipt,expected)
 values(operation_id,old_path,dest,recovery_receipt,snap->'source') returning * into op;
 return to_jsonb(op);
end $$;
revoke all on function private.plan_photo_archive(uuid,text,jsonb) from public,anon,authenticated,service_role;

create function private.commit_photo_archive(operation_id uuid, copy_proof jsonb) returns jsonb
language plpgsql security invoker set search_path='' set lock_timeout='2s' as $$
declare op private.photo_archive_operations; snap jsonb; meta jsonb;
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'Archive verification requires READ COMMITTED' using errcode='22023'; end if;
 select * into strict op from private.photo_archive_operations where id=operation_id for update;
 if op.state='abandoned' then raise exception 'Archive operation abandoned' using errcode='22023'; end if;
 -- Network/hash work happens outside this short transaction. Table locks cover
 -- phantom references as well as changed/deleted objects during the final CAS.
 lock table public.wine_entries,public.entry_photos,public.entry_group_slides,
  public.profiles,public.user_collection_items,public.user_collections in share mode;
 lock table storage.buckets,storage.objects in share mode;
 snap:=private.photo_archive_snapshot(op.source_path,op.archive_path);
 if snap->'source' is distinct from op.expected or jsonb_array_length(snap->'source'->'refs')<>0 then
  raise exception 'Archive source changed; abandon and replan' using errcode='PT409'; end if;
 meta:=snap->'archive'->'metadata';
 if not coalesce((snap->>'protected')::boolean and jsonb_typeof(copy_proof)='object' and octet_length(copy_proof::text)<8192
  and copy_proof->'object'=snap->'archive' and snap->'archive'<>'null'::jsonb
  and copy_proof->>'sha256'=op.receipt->>'sha256' and copy_proof->'size'=op.receipt->'size'
  and meta->>'size'=op.receipt->>'size' and meta->>'mimetype'=copy_proof->>'mimetype'
  and copy_proof->>'mimetype' ~ '^image/(jpeg|png|webp|gif|avif|heic|heif)$',false)
 then raise exception 'Archive byte proof or destination changed' using errcode='PT409'; end if;
 update private.photo_archive_operations set state='copied',proof=copy_proof,verified_at=clock_timestamp()
 where id=op.id returning * into op;
 return to_jsonb(op);
end $$;
revoke all on function private.commit_photo_archive(uuid,jsonb) from public,anon,authenticated,service_role;

create function private.abandon_photo_archive(operation_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare op private.photo_archive_operations;
begin
 select * into strict op from private.photo_archive_operations where id=operation_id for update;
 if op.state='copied' then raise exception 'Preserved archive record must remain durable' using errcode='22023'; end if;
 update private.photo_archive_operations set state='abandoned' where id=op.id returning * into op;
 -- Keep any uncommitted destination bytes; no cleanup/deletion authority here.
 return to_jsonb(op);
end $$;
revoke all on function private.abandon_photo_archive(uuid) from public,anon,authenticated,service_role;
commit;
