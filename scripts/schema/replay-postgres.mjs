// Starts and destroys its own loopback-only PostgreSQL cluster. Never connects to
// a supplied URL or reads project credentials. Requires PG17 binaries + vector 0.8.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
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
  // Real independent backends exercise both serializations of feature versus
  // revocation. Keep the first transaction open until the second is demonstrably
  // waiting on its lock, instead of relying on timing/sleeps to create a race.
  const session = () => {
    const child = spawn(join(bin,'psql'), ['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'], {env});
    let output='', error='';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { error += chunk; });
    const done = once(child,'close').then(([code]) => ({code, output, error}));
    return {child, done};
  };
  const waitForLock = async name => {
    const deadline = Date.now()+5000;
    while(Date.now()<deadline) {
      if(sql(`select count(*) from pg_stat_activity where application_name='${name}' and wait_event_type='Lock'`).trim()==='1') return;
      await new Promise(resolve => setTimeout(resolve,20));
    }
    throw new Error(`Concurrent backend ${name} did not wait on the expected lock`);
  };
  const owner='00000000-0000-4000-8000-000000000001';
  const feature=`set local role authenticated; select set_config('request.jwt.claim.sub','${owner}',true); update profiles set featured_badge_ids=array['race'] where id='${owner}';`;
  let concurrencyChecks=0;
  for(const revoke of [`delete from user_badges where user_id='${owner}' and badge_id='race';`, `update user_badges set badge_id='renamed' where user_id='${owner}' and badge_id='race';`]) {
    for(const featureFirst of [true,false]) {
      sql(`update profiles set featured_badge_ids='{}', featured_badge_id=null where id='${owner}'; delete from user_badges where user_id='${owner}'; insert into user_badges(user_id,badge_id) values('${owner}','race');`);
      const first=session(), second=session();
      try {
        first.child.stdin.write(`begin; ${featureFirst?feature:revoke} select 'ready';\n`);
        // psql emits one row only after the first write (and its triggers) finish.
        let ready='';
        await new Promise((resolve,reject) => {
          const timer=setTimeout(()=>reject(new Error('First transaction did not become ready')),5000);
          first.child.stdout.on('data', chunk => {ready+=chunk; if(ready.includes('ready')) {clearTimeout(timer);resolve();}});
        });
        second.child.stdin.end(`set application_name='featured-race-waiter'; begin; ${featureFirst?revoke:feature} commit;`);
        await waitForLock('featured-race-waiter');
        first.child.stdin.end('commit;');
        assert.equal((await first.done).code,0);
        const result=await second.done;
        if(featureFirst) assert.equal(result.code,0,result.error);
        else { assert.notEqual(result.code,0); assert.match(result.error,/Badge not earned/); }
        assert.equal(sql(`select count(*) from profiles p, unnest(p.featured_badge_ids) f where not exists(select from user_badges b where b.user_id=p.id and b.badge_id=f)`).trim(),'0');
        assert.equal(sql(`select cardinality(featured_badge_ids) from profiles where id='${owner}'`).trim(),'0');
        concurrencyChecks++;
      } finally { first.child.kill(); second.child.kill(); }
    }
  }
  console.log(JSON.stringify({postgres:run('postgres',['--version']).trim(),catalogMatches:true,ownerAndStrangerAccess:true,concurrencyChecks,productionWrites:0}));
} finally {
  if(started) run('pg_ctl',['-D',join(scratch,'data'),'-m','immediate','-w','stop']);
  await rm(scratch,{recursive:true,force:true});
}
