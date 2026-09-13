-- AUD-13/15 / B08b. One owner-only mobile details/grapes command.
-- Existing web/group/lifecycle mutations are not silently routed here.
begin;
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
    'advanced_notes','is_feed_visible'
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
  if (p_grape_ids is null) <> (p_expected_grape_ids is null)
    or cardinality(p_grape_ids) > 3 or cardinality(p_expected_grape_ids) > 3
    or array_position(p_grape_ids,null) is not null
    or array_position(p_expected_grape_ids,null) is not null
    or (p_grape_ids is not null and cardinality(p_grape_ids) <> (select count(distinct id) from unnest(p_grape_ids) id)) then
    raise exception 'Invalid ordered grape selection' using errcode='22023';
  end if;

  -- Serializes adopting editors. The predicate is mandatory even for trusted
  -- test viewers who may SELECT foreign entries through their read policies.
  select * into current_entry from public.wine_entries e
    where e.id=p_entry_id and e.user_id=viewer for update;
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
    raise exception 'Entry changed elsewhere. Close the editor and refresh before saving again.' using errcode='40001';
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
  select * into current_entry from public.wine_entries where id=p_entry_id and user_id=viewer;
  return jsonb_build_object('entry',to_jsonb(current_entry),'replayed',false);
end;
$$;
revoke all on function public.save_entry_details(uuid,jsonb,jsonb,uuid[],uuid[]) from public, anon;
grant execute on function public.save_entry_details(uuid,jsonb,jsonb,uuid[],uuid[]) to authenticated;
commit;
