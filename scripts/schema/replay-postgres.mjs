// Starts and destroys its own loopback-only PostgreSQL cluster. Never connects to
// a supplied URL or reads project credentials. Requires PG17 binaries + vector 0.8.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { baselineFile, canonical, differences, expectedCatalog, forwardSql } from './contract.mjs';

const bin=resolve(process.argv[2] ?? '');
assert(process.argv[2], 'Pass a PostgreSQL 17 bin directory with pgvector installed');
const scratch=await mkdtemp(join(tmpdir(),'cellarsnap-schema-pg17-'));
const env={PATH:process.env.PATH,LC_ALL:'C',DYLD_LIBRARY_PATH:resolve(bin,'../lib'),PGHOST:'127.0.0.1',PGUSER:'postgres',PGDATABASE:'postgres'};
const run=(name,args,input)=>{
  const r=spawnSync(join(bin,name),args,{env,input,encoding:'utf8',maxBuffer:10*1024*1024});
  assert.equal(r.status,0,`${name}: ${r.stderr || r.error || r.stdout}`);return r.stdout;
};
const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');
env.PGPORT=String(server.address().port);await new Promise(r=>server.close(r));
let started=false;
const sql=input=>run('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1'],input);
try {
  assert.match(run('postgres',['--version']), /PostgreSQL\) 17\./);
  const configuredShare=run('pg_config',['--sharedir']).trim();
  const sharedir=existsSync(join(configuredShare,'postgres.bki')) ? configuredShare : resolve(bin,'../share/postgresql');
  run('initdb',['-D',join(scratch,'data'),'-U','postgres','--auth=trust','--locale=C','--encoding=UTF8','-L',sharedir]);
  run('pg_ctl',['-D',join(scratch,'data'),'-l',join(scratch,'server.log'),'-o',`-h 127.0.0.1 -p ${env.PGPORT} -k ${scratch}`,'-w','start']);started=true;
  sql(await baselineFile('auth.fixture.sql'));
  sql('create extension vector;');
  sql((await baselineFile('app.sql')).replace('CREATE SCHEMA public;',''));
  sql('set search_path=public;'+await baselineFile('auth-hooks.sql'));
  sql(await baselineFile('managed-storage.fixture.sql'));
  for (const migration of await forwardSql()) sql(migration);
  const query=await readFile(new URL('./catalog.sql',import.meta.url),'utf8');
  const got=canonical(JSON.parse(sql('set search_path=public;'+query).split('\n').find(l=>l.startsWith('{'))));
  assert.deepEqual(differences(await expectedCatalog(),got),[]);
  sql(`insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000001','owner@example.invalid');
    insert into wine_entries(user_id,wine_name,entry_privacy) values ('00000000-0000-4000-8000-000000000001','Disposable','private');
    set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
    do $$ begin if (select count(*) from wine_entries) <> 0 then raise exception 'Stranger privacy failed'; end if; end $$;
    select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
    do $$ begin if (select count(*) from wine_entries) <> 1 then raise exception 'Owner access failed'; end if; end $$;`);
  console.log(JSON.stringify({postgres:run('postgres',['--version']).trim(),catalogMatches:true,ownerAndStrangerAccess:true,productionWrites:0}));
} finally {
  if(started) run('pg_ctl',['-D',join(scratch,'data'),'-m','immediate','-w','stop']);
  await rm(scratch,{recursive:true,force:true});
}
