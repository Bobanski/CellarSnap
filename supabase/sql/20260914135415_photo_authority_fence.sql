-- B02w / AUD-01. Additive fences and explicit operator activation/retirement.
-- Installing does not revoke clients, rekey objects or delete production bytes.
begin;
create table private.photo_delivery_state (
 singleton boolean primary key default true check(singleton),
 legacy_disabled boolean not null default false,
 fence_epoch bigint not null default 0
);
insert into private.photo_delivery_state(singleton) values(true);
alter table private.photo_delivery_state enable row level security;
revoke all on private.photo_delivery_state from public,anon,authenticated,service_role;
create table private.photo_retired_paths (
 path text primary key,
 operation_id uuid not null references private.photo_rekey_operations(id),
 fenced_at timestamptz not null default now()
);
alter table private.photo_retired_paths enable row level security;
revoke all on private.photo_retired_paths from public,anon,authenticated,service_role;

-- Writers hold a shared epoch lock through commit. A retiring cohort takes the
-- exclusive lock before reference locks. Old repeatable-read snapshots fail
-- serialization on the changed epoch instead of ignoring a new tombstone.
create function private.photo_path_writable(object_name text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
begin
 if current_setting('role',true)='authenticated' and auth.uid() is null then return false; end if;
 perform 1 from private.photo_delivery_state for share;
 return not exists(select from private.photo_retired_paths where path=object_name);
end $$;
revoke all on function private.photo_path_writable(text) from public,anon,authenticated,service_role;
grant execute on function private.photo_path_writable(text) to authenticated;
create function private.guard_photo_reference() returns trigger
language plpgsql security definer set search_path='' as $$
declare col text; path text;
begin
 foreach col in array TG_ARGV loop
  path:=to_jsonb(new)->>col;
  if path is not null and not private.photo_path_writable(path) then
   raise exception 'Photo moved; reload before saving' using errcode='PT409';
  end if;
 end loop;
 return new;
end $$;
revoke all on function private.guard_photo_reference() from public,anon,authenticated,service_role;
create trigger guard_photo_reference before insert or update of label_image_path,place_image_path,pairing_image_path on public.wine_entries
 for each row execute function private.guard_photo_reference('label_image_path','place_image_path','pairing_image_path');
create trigger guard_photo_reference before insert or update of path on public.entry_photos
 for each row execute function private.guard_photo_reference('path');
create trigger guard_photo_reference before insert or update of path on public.entry_group_slides
 for each row execute function private.guard_photo_reference('path');
create trigger guard_photo_reference before insert or update of avatar_path on public.profiles
 for each row execute function private.guard_photo_reference('avatar_path');
create trigger guard_photo_reference before insert or update of snapshot_label_image_path,snapshot_preview_image_path on public.user_collection_items
 for each row execute function private.guard_photo_reference('snapshot_label_image_path','snapshot_preview_image_path');
create trigger guard_photo_reference before insert or update of cover_image_path on public.user_collections
 for each row execute function private.guard_photo_reference('cover_image_path');

-- Restrictive policies compose with the existing ownership/access policies.
-- Operation-aware SELECT preserves crop/upsert/delete and authorized shared copy;
-- after activation, raw/transformed signatures and direct downloads fail closed.
create function private.photo_storage_select_allowed(object_name text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare cutoff boolean;
begin
 if auth.uid() is null then return false; end if;
 select legacy_disabled into strict cutoff from private.photo_delivery_state for share;
 if exists(select from private.photo_retired_paths where path=object_name) then return false; end if;
 if not cutoff then return true; end if;
 return storage.allow_any_operation(array['object.upload','object.upload_update','object.upload_signed',
   'object.copy','object.delete','object.delete_many']);
end $$;
revoke all on function private.photo_storage_select_allowed(text) from public,anon,authenticated,service_role;
grant execute on function private.photo_storage_select_allowed(text) to authenticated;
create policy "Wine photo capability cutoff" on storage.objects as restrictive for select to authenticated
 using(bucket_id<>'wine-photos' or private.photo_storage_select_allowed(name));
create policy "Wine photo retired upload fence" on storage.objects as restrictive for insert to authenticated
 with check(bucket_id<>'wine-photos' or private.photo_path_writable(name));
create policy "Wine photo retired overwrite fence" on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'wine-photos' or private.photo_path_writable(name))
 with check(bucket_id<>'wine-photos' or private.photo_path_writable(name));

-- Metadata needs authorized existence independently of direct Storage SELECT.
-- Private definer is narrowly bounded; public facade remains invoker-only.
create function private.readable_wine_photo_paths(object_names text[]) returns setof text
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if object_names is null or cardinality(object_names)>100 or exists(select from unnest(object_names) p where p is null or octet_length(p)>2048) then
  raise exception 'Invalid photo batch' using errcode='22023';
 end if;
 return query select o.name from storage.objects o where o.bucket_id='wine-photos' and o.name=any(object_names)
 and private.can_access_wine_photo(o.name) and not exists(select from private.photo_retired_paths r where r.path=o.name);
end $$;
revoke all on function private.readable_wine_photo_paths(text[]) from public,anon,authenticated,service_role;
grant execute on function private.readable_wine_photo_paths(text[]) to authenticated;
create or replace function public.readable_wine_photo_paths(object_names text[]) returns setof text
language sql stable security invoker set search_path='' as $$ select private.readable_wine_photo_paths(object_names) $$;

create function private.activate_photo_cutoff() returns jsonb
language plpgsql security invoker set search_path='' set lock_timeout='2s' as $$
begin
 update private.photo_delivery_state set legacy_disabled=true,fence_epoch=fence_epoch+1;
 return jsonb_build_object('legacy_signing_disabled',true);
end $$;
revoke all on function private.activate_photo_cutoff() from public,anon,authenticated,service_role;

-- Atomically fence both the base and even a previously absent original sibling.
-- The existing proof/CAS implementation remains intact beneath this wrapper.
alter function private.commit_photo_rekey(uuid,jsonb) rename to commit_photo_rekey_unfenced;
create function private.commit_photo_rekey(operation_id uuid,copy_proof jsonb) returns jsonb
language plpgsql security invoker set search_path='' set lock_timeout='2s' as $$
declare result jsonb;
begin
 update private.photo_delivery_state set fence_epoch=fence_epoch+1;
 result:=private.commit_photo_rekey_unfenced(operation_id,copy_proof);
 insert into private.photo_retired_paths(path,operation_id)
 select m->>'old',operation_id from jsonb_array_elements(result->'mapping') m
 on conflict(path) do nothing;
 return result;
end $$;
revoke all on function private.commit_photo_rekey(uuid,jsonb) from public,anon,authenticated,service_role;

alter table private.photo_rekey_operations add column retirement_phase text
 check(retirement_phase in ('deleting','deleted_pending_cdn','verified'));
alter table private.photo_rekey_operations add column retirement_evidence jsonb;
alter table private.photo_rekey_operations add column deleted_at timestamptz;
create function private.prepare_photo_retirement(operation_id uuid) returns jsonb
language plpgsql security invoker set search_path='' set lock_timeout='2s' as $$
declare op private.photo_rekey_operations; old_paths text[]; new_paths text[]; snap jsonb;
begin
 update private.photo_delivery_state set fence_epoch=fence_epoch+1;
 if not (select legacy_disabled from private.photo_delivery_state) then
  raise exception 'Legacy signing cutoff required' using errcode='22023';
 end if;
 select * into strict op from private.photo_rekey_operations where id=operation_id for update;
 if op.state<>'pending_revocation' then raise exception 'References not committed' using errcode='22023'; end if;
 select array_agg(m->>'old'),array_agg(m->>'new') into old_paths,new_paths from jsonb_array_elements(op.mapping) m;
 if exists(select from unnest(old_paths) p where not exists(select from private.photo_retired_paths r where r.path=p and r.operation_id=op.id)) then
  raise exception 'Durable fence required' using errcode='22023';
 end if;
 snap:=private.photo_rekey_snapshot(old_paths);
 if exists(select from jsonb_array_elements(snap->'objects') current_object
  where current_object->'object'<>'null'::jsonb and not exists(
   select from jsonb_array_elements(op.expected->'objects') expected_object
   where current_object=expected_object)) then
  raise exception 'Old object changed; investigate before retirement' using errcode='PT409';
 end if;
 if jsonb_array_length(snap->'refs')<>0 then raise exception 'Old references remain' using errcode='PT409'; end if;
 if (private.photo_rekey_snapshot(new_paths)->'objects') is distinct from (op.proof->'objects') then
  raise exception 'Replacement objects changed; reverify access and bytes' using errcode='PT409';
 end if;
 if op.retirement_phase is null then
  update private.photo_rekey_operations set retirement_phase='deleting' where id=op.id returning * into op;
 end if;
 return to_jsonb(op);
end $$;
revoke all on function private.prepare_photo_retirement(uuid) from public,anon,authenticated,service_role;
create function private.confirm_photo_deletion(operation_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare op private.photo_rekey_operations; old_paths text[];
begin
 select * into strict op from private.photo_rekey_operations where id=operation_id for update;
 if op.retirement_phase is null then raise exception 'Retirement not prepared' using errcode='22023'; end if;
 select array_agg(m->>'old') into old_paths from jsonb_array_elements(op.mapping) m;
 if exists(select from jsonb_array_elements(private.photo_rekey_snapshot(old_paths)->'objects') o where o->'object'<>'null'::jsonb) then
  raise exception 'Old objects still exist' using errcode='PT409';
 end if;
 if op.retirement_phase='deleting' then
  update private.photo_rekey_operations set retirement_phase='deleted_pending_cdn',deleted_at=clock_timestamp() where id=op.id returning * into op;
 end if;
 return to_jsonb(op);
end $$;
revoke all on function private.confirm_photo_deletion(uuid) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.can_access_wine_photo(object_name text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  viewer uuid := auth.uid();
  public_only boolean := coalesce(auth.role() = 'service_role', false);
  parts text[] := string_to_array(object_name, '/');
  source public.wine_entries%rowtype;
  base_path text := regexp_replace(object_name, '__original(\.[a-zA-Z0-9]+)?$', '\1');
  kinds text[];
  kind text;
  photo_privacy text;
begin
  if exists(select from private.photo_retired_paths where path=object_name) then return false; end if;
  if not public_only and viewer is null then return false; end if;
  -- Preserves uploads before metadata exists, upserts, avatar/cover changes,
  -- originals, drafts and cleanup of orphaned objects within one's own prefix.
  if not public_only and parts[1] = viewer::text then return true; end if;
  if parts[1] is null or parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  if not public_only and array_length(parts,1)=2 then
    return parts[2] ~ '^avatar(-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\.(jpg|png|webp|gif)$'
      and public.can_view_entry(viewer, parts[1]::uuid, 'public')
      and exists (select 1 from public.profiles p
        where p.id=parts[1]::uuid and p.avatar_path=object_name);
  end if;
  if array_length(parts,1) not in (3,4) or parts[2] is null
    or parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  select * into source from public.wine_entries e
    where e.id=parts[2]::uuid and e.user_id=parts[1]::uuid;
  if not found then return false; end if;
  if public_only then
    if source.entry_privacy::text is distinct from 'public'
      or public.is_test_account(source.user_id) then return false; end if;
  elsif not public.can_view_entry(viewer,source.user_id,source.entry_privacy::text) then
    return false;
  end if;

  -- Photo reclassification updates metadata without moving the object. Exact
  -- ordered metadata wins over legacy columns and group references. ALL current
  -- types must permit access if duplicate rows point at the same source object.
  select array_agg(distinct p.type::text) into kinds from public.entry_photos p
    where p.entry_id=source.id and p.path=base_path;
  if kinds is null then
    select array_agg(v.kind) into kinds from (values
      ('label',source.label_image_path),('place',source.place_image_path),
      ('pairing',source.pairing_image_path)) v(kind,path) where v.path=base_path;
  end if;
  if kinds is null then
    -- Some legacy group photos exist only in slides. Validate the source member
    -- and the group's owned, readable anchor. Entry-less context is anchored.
    -- A private ordered/legacy source above always wins over a slide reference.
    select array_agg(distinct s.photo_type::text) into kinds
    from public.entry_groups g join public.entry_group_slides s on s.group_id=g.id
    join public.wine_entries anchor on anchor.id=g.anchor_entry_id
      and anchor.user_id=g.user_id and anchor.entry_group_id=g.id
    where g.user_id=source.user_id and source.entry_group_id=g.id
      and coalesce(s.entry_id,g.anchor_entry_id)=source.id and s.path=base_path
      and case when public_only then anchor.entry_privacy::text='public'
        else public.can_view_entry(viewer,anchor.user_id,anchor.entry_privacy::text) end;
  end if;
  if kinds is null then return false; end if;
  foreach kind in array kinds loop
    if kind is null or kind not in ('label','place','pairing','lineup','people','other_bottles') then return false; end if;
    photo_privacy := case kind
      when 'label' then coalesce(source.label_photo_privacy,source.entry_privacy)::text
      when 'place' then coalesce(source.place_photo_privacy,source.entry_privacy)::text
      else source.entry_privacy::text end;
    if public_only then
      if photo_privacy is distinct from 'public' then return false; end if;
    elsif not public.can_view_entry(viewer,source.user_id,photo_privacy) then return false; end if;
  end loop;
  return true;
end;
$_$;


create or replace function private.photo_rekey_snapshot(paths text[]) returns jsonb
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
  if array_length(string_to_array(paths[1],'/'),1)=2 then
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'fingerprint',encode(sha256(convert_to(to_jsonb(p)::text,'UTF8')),'hex'))),'[]') into sources
    from public.profiles p where p.id::text=split_part(paths[1],'/',1) and p.avatar_path=paths[1];
  end if;
  return jsonb_build_object('refs',refs,'objects',objects,'sources',sources);
end $$;

create or replace function private.plan_photo_rekey(operation_id uuid, old_path text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare op private.photo_rekey_operations; base text; sibling text; dest text; original_dest text; snap jsonb; r jsonb;
begin
  -- Entry-owned three/four-segment keys only. Fixed-name avatar/cover and opaque
  -- external URL migration needs its own reviewed authority contract.
  if operation_id is null or old_path is null or length(old_path)>1024 or (old_path !~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/([^/]+/)?[^/]+$' and old_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar(-[0-9a-f-]{36})?\.(jpg|png|webp|gif)$')
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
  if array_length(string_to_array(base,'/'),1)=2 then dest:=split_part(base,'/',1)||'/avatar-'||operation_id::text||substring(base from '(\.[a-zA-Z0-9]+)$'); end if;
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

create function private.record_photo_revocation_evidence(operation_id uuid,observations jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare op private.photo_rekey_operations; h jsonb; region text; regions text[];
begin
 select * into strict op from private.photo_rekey_operations where id=operation_id for update;
 if op.retirement_phase not in ('deleted_pending_cdn','verified') or op.deleted_at is null then
  raise exception 'Storage deletion not confirmed' using errcode='22023';
 end if;
 if observations is null or jsonb_typeof(observations)<>'array' or jsonb_array_length(observations)>40 or octet_length(observations::text)>32768 then
  raise exception 'Invalid denial observations' using errcode='22023';
 end if;
 if exists(select from jsonb_array_elements(observations) o where not coalesce(
  jsonb_typeof(o)='object'
  and o ?& array['region','path','surface','status','observed_at','capability_sha256','source_sha256','warm_sha256','warmed_at','warm_status']
  and o->>'region' ~ '^[a-zA-Z0-9_-]{2,64}$' and o->>'surface' in ('raw','transformed')
  and o->>'status' in ('400','403','404') and o->>'capability_sha256' ~ '^[a-f0-9]{64}$'
  and o->>'warm_sha256' ~ '^[a-f0-9]{64}$' and o->>'warm_status'='200'
  and (o->>'warmed_at')::timestamptz<=op.deleted_at
  and (o->>'observed_at')::timestamptz>=op.deleted_at and (o->>'observed_at')::timestamptz<=clock_timestamp()
  and exists(select from jsonb_array_elements(op.proof->'hashes') proof_hash where proof_hash->>'old'=o->>'path' and proof_hash->>'sha256'=o->>'source_sha256'),false)) then
  raise exception 'Invalid or unrelated denial observation' using errcode='22023';
 end if;
 select array_agg(distinct o->>'region') into regions from jsonb_array_elements(observations) o;
 if coalesce(cardinality(regions),0)<2 then raise exception 'Two independently observed regions required' using errcode='22023'; end if;
 foreach region in array regions loop
  for h in select * from jsonb_array_elements(op.proof->'hashes') where value ? 'sha256' loop
   if (select count(distinct o->>'surface') from jsonb_array_elements(observations) o
     where o->>'region'=region and o->>'path'=h->>'old')<>2 then
    raise exception 'Raw and transformed denials required for every old object' using errcode='22023';
   end if;
  end loop;
 end loop;
 update private.photo_rekey_operations set retirement_phase='verified',retirement_evidence=observations where id=op.id returning * into op;
 return to_jsonb(op);
end $$;
revoke all on function private.record_photo_revocation_evidence(uuid,jsonb) from public,anon,authenticated,service_role;
commit;
