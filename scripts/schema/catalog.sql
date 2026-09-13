-- Read-only, deterministic structural contract. Never selects application rows.
-- Extension-owned objects are versioned platform dependencies, not app DDL.
select jsonb_build_object(
 'relations', (select jsonb_agg(to_jsonb(x) order by x.name) from (
   select n.nspname schema_name,c.relname name,c.relkind kind,pg_get_userbyid(c.relowner) owner,
     c.relrowsecurity rls,c.relforcerowsecurity force_rls,c.relreplident replica_identity,c.reloptions options
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in ('public','private') and c.relkind in ('r','p','v','m','S')
     and not exists(select 1 from pg_depend d where d.objid=c.oid and d.classid='pg_class'::regclass and d.deptype='e')
 ) x),
 'views', (select jsonb_agg(to_jsonb(x) order by x.schema_name,x.name) from (
   select n.nspname schema_name,c.relname name,pg_get_viewdef(c.oid,true) definition
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('v','m')
 ) x),
 'columns', (select jsonb_agg(to_jsonb(x) order by x.table_name,x.position) from (
   select c.relname table_name,a.attnum position,a.attname name,format_type(a.atttypid,a.atttypmod) type,
     a.attnotnull not_null,pg_get_expr(d.adbin,d.adrelid) default_expression,a.attidentity identity,a.attgenerated generated
   from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
   left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
   where n.nspname in ('public','private') and c.relkind in ('r','p','v','m') and a.attnum>0 and not a.attisdropped
 ) x),
 'constraints', (select jsonb_agg(to_jsonb(x) order by x.table_name,x.name) from (
   select c.relname table_name,co.conname name,pg_get_constraintdef(co.oid,true) definition,co.convalidated validated
   from pg_constraint co join pg_class c on c.oid=co.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and co.contype <> 'n'
 ) x),
 'indexes', (select jsonb_agg(to_jsonb(x) order by x.tablename,x.indexname) from (
   select tablename,indexname,indexdef from pg_indexes where schemaname in ('public','private')
 ) x),
 'policies', (select jsonb_agg(to_jsonb(x) order by x.schemaname,x.tablename,x.policyname) from (
   select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','private','storage')
 ) x),
 'functions', (select jsonb_agg(to_jsonb(x) order by x.name,x.args) from (
   select n.nspname schema_name,p.proname name,pg_get_function_identity_arguments(p.oid) args,pg_get_userbyid(p.proowner) owner,pg_get_functiondef(p.oid) definition
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind in ('f','p')
   and not exists(select 1 from pg_depend d where d.objid=p.oid and d.classid='pg_proc'::regclass and d.deptype='e')
 ) x),
 'triggers', (select jsonb_agg(to_jsonb(x) order by x.schema_name,x.table_name,x.name) from (
   select n.nspname schema_name,c.relname table_name,t.tgname name,t.tgenabled enabled,pg_get_triggerdef(t.oid,true) definition
   from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
   join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace
   where not t.tgisinternal and (n.nspname in ('public','private') or pn.nspname in ('public','private'))
 ) x),
 'enums', (select jsonb_agg(to_jsonb(x) order by x.name,x.position) from (
   select t.typname name,e.enumsortorder position,e.enumlabel label from pg_type t join pg_enum e on e.enumtypid=t.oid
   join pg_namespace n on n.oid=t.typnamespace where n.nspname in ('public','private')
 ) x),
 'grants', (select jsonb_agg(to_jsonb(x) order by x.object,x.grantee,x.privilege_type,x.is_grantable) from (
   select c.relname object,case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end grantee,a.privilege_type,a.is_grantable
   from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 's'::"char" else 'r'::"char" end,c.relowner))) a
   where n.nspname in ('public','private') and c.relkind in ('r','p','v','m','S')
 ) x),
 'function_grants', (select jsonb_agg(to_jsonb(x) order by x.name,x.args,x.grantee,x.privilege_type) from (
   select n.nspname schema_name,p.proname name,pg_get_function_identity_arguments(p.oid) args,case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end grantee,a.privilege_type,a.is_grantable
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where n.nspname in ('public','private') and not exists(select 1 from pg_depend d where d.objid=p.oid and d.classid='pg_proc'::regclass and d.deptype='e')
 ) x),
 'default_grants', (select jsonb_agg(to_jsonb(x) order by x.owner,x.kind,x.grantee,x.privilege_type) from (
   select pg_get_userbyid(d.defaclrole) owner,d.defaclobjtype kind,case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end grantee,a.privilege_type,a.is_grantable
   from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace cross join lateral aclexplode(d.defaclacl) a where n.nspname in ('public','private')
 ) x),
 'schema_grants', (select jsonb_agg(to_jsonb(x) order by x.grantee,x.privilege_type) from (
   select n.nspname schema_name,case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end grantee,a.privilege_type,a.is_grantable
   from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname in ('public','private')
 ) x),
 'sequences', (select jsonb_agg(to_jsonb(x) order by x.sequencename) from (
   select sequencename,data_type::text,start_value,min_value,max_value,increment_by,cycle,cache_size from pg_sequences where schemaname in ('public','private')
 ) x)
) as catalog;
