-- B05e / QC-14. Repair only the reviewed historical uppercase-loss encoding.
-- Preserve canonical variety/entry IDs. Equivalent spellings share one lookup
-- key; fail rather than silently choose between different canonical varieties.
begin;
lock table public.grape_aliases in share row exclusive mode;
create temporary table b05e_alias_targets on commit drop as
select a.id, a.variety_id, a.alias, a.alias_normalized,
  trim(regexp_replace(lower(a.alias collate "C"), '[^a-z0-9]+', ' ', 'g')) as target,
  a.alias = v.name as canonical_spelling
from public.grape_aliases a join public.grape_varieties v on v.id=a.variety_id;
do $$
begin
  if exists (select from b05e_alias_targets where octet_length(alias) <> length(alias)
      or target = '' or alias_normalized not in (target,
        lower(trim(regexp_replace(alias, '[^a-z0-9]+', ' ', 'g'))))) then
    raise exception 'B05e requires review of non-ASCII, empty or unexpected alias keys';
  end if;
  if exists (select from b05e_alias_targets group by target having count(distinct variety_id)>1) then
    raise exception 'B05e cross-variety alias collision requires review';
  end if;
  if exists (select from public.grape_aliases where alias_normalized like '\_\_b05e\_\_%') then
    raise exception 'B05e temporary key namespace already in use';
  end if;
  if exists (select from pg_catalog.pg_constraint where contype='f' and confrelid='public.grape_aliases'::regclass) then
    raise exception 'Review alias-row consumers before consolidating equivalent keys';
  end if;
end;
$$;
-- Only discard duplicate spellings with the SAME owner and SAME normalized key.
-- Prefer the canonical display spelling, then a deterministic lexical choice.
delete from public.grape_aliases a using (
  select id,row_number() over (partition by target order by canonical_spelling desc, alias collate "C", id) as position
  from b05e_alias_targets
) duplicate where a.id=duplicate.id and duplicate.position>1;
-- Avoid transient UNIQUE collisions when a corrected key equals another old
-- damaged key. Intermediate keys are never visible outside this transaction.
update public.grape_aliases a set alias_normalized='__b05e__'||a.id::text
from b05e_alias_targets t where a.id=t.id and a.alias_normalized<>t.target;
update public.grape_aliases a set alias_normalized=t.target
from b05e_alias_targets t where a.id=t.id and a.alias_normalized<>t.target;
commit;
