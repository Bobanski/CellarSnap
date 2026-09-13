-- B02l / AUD-01: private operator machinery only. No scheduled work, reference
-- rewrite, Storage mutation, native cutoff or production retirement on install.
begin;
create table private.photo_rekey_operations (
  id uuid primary key,
  source_path text not null,
  mapping jsonb not null,
  expected jsonb not null,
  state text not null default 'planned' check (state in ('planned','pending_revocation','abandoned')),
  proof jsonb,
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  check (jsonb_array_length(mapping)=2),
  check ((state='pending_revocation')=(committed_at is not null))
);
alter table private.photo_rekey_operations enable row level security;
revoke all on private.photo_rekey_operations from public, anon, authenticated, service_role;
create unique index photo_rekey_active_source on private.photo_rekey_operations(source_path) where state <> 'abandoned';

-- Fingerprint complete referenced/source rows so concurrent edits abort a stale
-- plan without retaining notes, ratings or identity fields in the operator ledger.
-- Bound the reference set; never silently truncate a migration.
create function private.photo_rekey_snapshot(paths text[]) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare refs jsonb; objects jsonb; sources jsonb;
begin
  if cardinality(paths) <> 2 or paths is null then raise exception 'Invalid photo cohort' using errcode='22023'; end if;
  with r as (
    select 'entry_photos'::text t,id::text id,'path'::text c,path,encode(sha256(convert_to(to_jsonb(p)::text,'UTF8')),'hex') fingerprint from public.entry_photos p where path=any(paths)
    union all select 'wine_entries',id::text,v.c,v.path,encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex') from public.wine_entries e
      cross join lateral(values('label_image_path',e.label_image_path),('place_image_path',e.place_image_path),('pairing_image_path',e.pairing_image_path)) v(c,path) where v.path=any(paths)
    union all select 'entry_group_slides',id::text,'path',path,encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') from public.entry_group_slides s where path=any(paths)
    union all select 'profiles',id::text,'avatar_path',avatar_path,encode(sha256(convert_to(to_jsonb(p)::text,'UTF8')),'hex') from public.profiles p where avatar_path=any(paths)
    union all select 'user_collection_items',id::text,v.c,v.path,encode(sha256(convert_to(to_jsonb(i)::text,'UTF8')),'hex') from public.user_collection_items i
      cross join lateral(values('snapshot_label_image_path',i.snapshot_label_image_path),('snapshot_preview_image_path',i.snapshot_preview_image_path)) v(c,path) where v.path=any(paths)
    union all select 'user_collections',id::text,'cover_image_path',cover_image_path,encode(sha256(convert_to(to_jsonb(c)::text,'UTF8')),'hex') from public.user_collections c where cover_image_path=any(paths)
  ) select coalesce(jsonb_agg(to_jsonb(b) order by t,id,c),'[]') into refs from (select * from r order by t,id,c limit 1001) b;
  if jsonb_array_length(refs)>1000 then raise exception 'Photo reference bound exceeded' using errcode='54000'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('path',p,'object',case when o.id is null then null else
    jsonb_build_object('id',o.id,'version',o.version,'updated_at',o.updated_at,'metadata',o.metadata) end) order by p),'[]') into objects
    from unnest(paths) p left join storage.objects o on o.bucket_id='wine-photos' and o.name=p;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'fingerprint',encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex')) order by e.id),'[]') into sources from public.wine_entries e
    where e.id::text=split_part(paths[1],'/',2) and e.user_id::text=split_part(paths[1],'/',1);
  return jsonb_build_object('refs',refs,'objects',objects,'sources',sources);
end $$;

create function private.plan_photo_rekey(operation_id uuid, old_path text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare op private.photo_rekey_operations; base text; sibling text; dest text; original_dest text; snap jsonb; r jsonb;
begin
  -- Entry-owned three/four-segment keys only. Fixed-name avatar/cover and opaque
  -- external URL migration needs its own reviewed authority contract.
  if operation_id is null or old_path is null or length(old_path)>1024 or old_path !~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/([^/]+/)?[^/]+$'
    or old_path ~ '[\\[:cntrl:]]' or old_path ~ '(^|/)\.{1,2}(/|$)' or old_path ~ '__original(\.[a-zA-Z0-9]+)?$'
    then raise exception 'Unsupported source path' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(old_path, 9281));
  select * into op from private.photo_rekey_operations where id=operation_id;
  if found then
    if op.source_path<>old_path then raise exception 'Operation identity mismatch' using errcode='22023'; end if;
    return to_jsonb(op);
  end if;
  base:=old_path;
  sibling:=case when base ~ '\.[a-zA-Z0-9]+$' then regexp_replace(base,'(\.[a-zA-Z0-9]+)$','__original\1') else base||'__original' end;
  dest:=regexp_replace(base,'[^/]+$',operation_id::text||coalesce(substring(base from '(\.[a-zA-Z0-9]+)$'),''));
  original_dest:=case when dest ~ '\.[a-zA-Z0-9]+$' then regexp_replace(dest,'(\.[a-zA-Z0-9]+)$','__original\1') else dest||'__original' end;
  snap:=private.photo_rekey_snapshot(array[base,sibling]);
  if jsonb_array_length(snap->'sources')<>1 or jsonb_array_length(snap->'refs')=0 or
    exists(select from jsonb_array_elements(snap->'objects') o where o->>'path'=base and o->'object'='null'::jsonb)
    then raise exception 'Missing source object, entry or references' using errcode='22023'; end if;
  for r in select * from jsonb_array_elements(snap->'refs') loop
    if exists(select from jsonb_array_elements(snap->'objects') o where o->>'path'=r->>'path' and o->'object'='null'::jsonb) then
      raise exception 'Referenced original is missing' using errcode='22023'; end if;
  end loop;
  if exists(select from jsonb_array_elements(private.photo_rekey_snapshot(array[dest,original_dest])->'objects') o where o->'object'<>'null'::jsonb)
    or jsonb_array_length(private.photo_rekey_snapshot(array[dest,original_dest])->'refs')>0 then
    raise exception 'Destination already exists' using errcode='23505'; end if;
  insert into private.photo_rekey_operations(id,source_path,mapping,expected) values(operation_id,base,
    jsonb_build_array(jsonb_build_object('old',base,'new',dest),jsonb_build_object('old',sibling,'new',original_dest)),snap) returning * into op;
  return to_jsonb(op);
end $$;

create function private.commit_photo_rekey(operation_id uuid, copy_proof jsonb) returns jsonb
language plpgsql security invoker set search_path='' set lock_timeout='2s' set statement_timeout='30s' as $$
declare op private.photo_rekey_operations; old_paths text[]; new_paths text[]; current_new jsonb; r jsonb; m jsonb; dest text; n integer;
begin
  select * into strict op from private.photo_rekey_operations where id=operation_id for update;
  if op.state='pending_revocation' then return to_jsonb(op); end if;
  if op.state<>'planned' then raise exception 'Operation abandoned' using errcode='22023'; end if;
  select array_agg(v->>'old' order by ord),array_agg(v->>'new' order by ord) into old_paths,new_paths
    from jsonb_array_elements(op.mapping) with ordinality a(v,ord);
  -- Short operator transaction; table locks also exclude phantom references from
  -- legacy writers which do not participate in advisory/source-row locking.
  lock table public.wine_entries, public.entry_groups, public.entry_photos, public.entry_group_slides,
    public.profiles, public.user_collections, public.user_collection_items in share row exclusive mode;
  perform 1 from storage.objects where bucket_id='wine-photos' and name=any(old_paths||new_paths) order by name for update;
  if private.photo_rekey_snapshot(old_paths)<>op.expected then raise exception 'Photo source changed; abandon and replan' using errcode='PT409'; end if;
  current_new:=private.photo_rekey_snapshot(new_paths);
  if jsonb_array_length(current_new->'refs')<>0 then raise exception 'Destination gained references' using errcode='PT409'; end if;
  if copy_proof is null or jsonb_typeof(copy_proof)<>'object' or copy_proof->'objects' is distinct from current_new->'objects'
    or jsonb_typeof(copy_proof->'hashes') is distinct from 'array' or jsonb_array_length(copy_proof->'hashes')<>2 then
    raise exception 'Copy proof changed or incomplete' using errcode='PT409'; end if;
  for m in select * from jsonb_array_elements(op.mapping) loop
    if (select o->'object' from jsonb_array_elements(op.expected->'objects') o where o->>'path'=m->>'old')='null'::jsonb then
      if (select o->'object' from jsonb_array_elements(current_new->'objects') o where o->>'path'=m->>'new')<>'null'::jsonb then
        raise exception 'Unexpected original destination' using errcode='PT409'; end if;
    else
      if not exists(select from jsonb_array_elements(copy_proof->'hashes') h where h->>'old'=m->>'old' and h->>'new'=m->>'new'
        and h->>'sha256' ~ '^[0-9a-f]{64}$' and (h->>'size')::bigint between 1 and 26214400
        and h->>'mimetype' ~ '^image/(jpeg|png|webp|gif|avif|heic|heif)$')
        or (select o->'object' from jsonb_array_elements(current_new->'objects') o where o->>'path'=m->>'new')='null'::jsonb then
        raise exception 'Missing verified copy' using errcode='PT409'; end if;
    end if;
  end loop;
  -- Exactly the captured canonical cells, without replacing entire rows or IDs.
  for r in select * from jsonb_array_elements(op.expected->'refs') loop
    select v->>'new' into strict dest from jsonb_array_elements(op.mapping) v where v->>'old'=r->>'path';
    execute format('update public.%I set %I=$1 where id=$2::uuid and %I=$3',r->>'t',r->>'c',r->>'c') using dest,r->>'id',r->>'path';
    get diagnostics n=row_count;
    if n<>1 then raise exception 'Photo reference changed' using errcode='PT409'; end if;
  end loop;
  if jsonb_array_length(private.photo_rekey_snapshot(old_paths)->'refs')<>0 then raise exception 'References remain' using errcode='PT409'; end if;
  update private.photo_rekey_operations set state='pending_revocation',proof=copy_proof,committed_at=clock_timestamp() where id=operation_id returning * into op;
  return to_jsonb(op);
end $$;

create function private.abandon_photo_rekey(operation_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare op private.photo_rekey_operations;
begin
  select * into strict op from private.photo_rekey_operations where id=operation_id for update;
  if op.state='pending_revocation' then raise exception 'Committed operations cannot be abandoned' using errcode='22023'; end if;
  update private.photo_rekey_operations set state='abandoned' where id=operation_id returning * into op;
  return to_jsonb(op);
end $$;
revoke all on function private.photo_rekey_snapshot(text[]) from public,anon,authenticated,service_role;
revoke all on function private.plan_photo_rekey(uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.commit_photo_rekey(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.abandon_photo_rekey(uuid) from public,anon,authenticated,service_role;
commit;
