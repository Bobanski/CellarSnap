-- B02j / AUD-01: read-only, single-statement snapshot. Never a deletion list.
-- One row per exact reference/object key. The caller must reject >10,000 rows.
with refs as (
  select 'entry_photos'::text source_table, p.id::text row_id, 'path'::text source_column, p.path,
    e.user_id::text owner_id from public.entry_photos p join public.wine_entries e on e.id=p.entry_id
  union all
  select 'wine_entries',e.id::text,v.col,v.path,e.user_id::text from public.wine_entries e
    cross join lateral (values ('label_image_path',e.label_image_path),('place_image_path',e.place_image_path),
      ('pairing_image_path',e.pairing_image_path)) v(col,path)
  union all
  select 'entry_group_slides',s.id::text,'path',s.path,g.user_id::text
    from public.entry_group_slides s join public.entry_groups g on g.id=s.group_id
  union all
  select 'profiles',id::text,'avatar_path',avatar_path,id::text from public.profiles
  union all
  select 'user_collection_items',i.id::text,v.col,v.path,i.user_id::text from public.user_collection_items i
    cross join lateral (values ('snapshot_preview_image_path',i.snapshot_preview_image_path),
      ('snapshot_label_image_path',i.snapshot_label_image_path)) v(col,path)
  union all
  select 'user_collections',id::text,'cover_image_path',cover_image_path,user_id::text from public.user_collections
), grouped_refs as (
  select path,jsonb_agg(jsonb_build_object('table',source_table,'row_id',row_id,'column',source_column,'owner_id',owner_id)
    order by source_table,row_id,source_column) refs from refs where path is not null group by path
), objects as (
  select id,name,updated_at,metadata from storage.objects where bucket_id='wine-photos'
), paths as (
  select path from grouped_refs union select name from objects
)
select jsonb_build_object(
  'path',p.path,
  'object',case when o.id is null then null else jsonb_build_object('id',o.id,'updated_at',o.updated_at,
    'size',o.metadata->'size','mimetype',o.metadata->'mimetype') end,
  'references',coalesce(r.refs,'[]'::jsonb),
  'original_of',case when p.path ~ '__original(\.[a-zA-Z0-9]+)?$'
    then regexp_replace(p.path,'__original(\.[a-zA-Z0-9]+)?$','\1') else null end
) record from paths p left join objects o on o.name=p.path left join grouped_refs r on r.path=p.path
order by p.path collate "C" limit 10001
