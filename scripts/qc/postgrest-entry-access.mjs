// Local-only integration test: starts its own disposable PostgreSQL + PostgREST.
// Never accepts a database URL or reads the project's environment/credentials.
// Runtime setup/version notes: docs/remediation/handovers/merge-readiness.md.
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const runtime = process.argv[2];
assert(runtime, 'Pass the directory containing embedded-postgres and the PostgREST executable');
const { default: EmbeddedPostgres } = await import(pathToFileURL(resolve(runtime, 'node_modules/embedded-postgres/dist/index.js')));
const scratch = await mkdtemp(join(tmpdir(), 'cellarsnap-http-qc-'));
const freePort = async () => {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise(r => server.close(r)); return port;
};
const pgPort = await freePort(); const apiPort = await freePort();
const password = randomBytes(24).toString('hex'); const secret = randomBytes(32).toString('hex');
const db = new EmbeddedPostgres({ databaseDir: join(scratch, 'data'), user: 'postgres', password,
  port: pgPort, persistent: false, postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
  initdbFlags: ['--locale=C', '--encoding=UTF8'],
  onLog: () => {}, onError: () => {} });
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const entryId = n => uid(100 + n);
const migrations = ['20260912185640_protect_profile_capabilities_and_public_assets.sql', '20260912200417_enforce_entry_read_privacy.sql'];
let client; let api; let passed = 0;
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); passed++; console.log(`PASS ${label}`); };
const token = (viewer, role = 'authenticated') => {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify({ role, sub: viewer ? uid(viewer) : undefined, exp: Math.floor(Date.now()/1000)+1800 })).toString('base64url');
  return `${h}.${p}.${createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`;
};
const request = async (path, viewer, { method='GET', body, schema='public', role='authenticated', jwt }={}) => {
  const response = await fetch(`http://127.0.0.1:${apiPort}/${path}`, {
    method, headers: { ...(viewer !== null ? { Authorization: `Bearer ${jwt ?? token(viewer,role)}` } : {}),
      'Content-Type':'application/json', 'Accept-Profile':schema, 'Content-Profile':schema, Prefer:'return=representation' },
    body:body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(10000),
  });
  const text=await response.text(); return {status:response.status,body:text ? JSON.parse(text) : null};
};
const ids = async (viewer, options) => {
  const r=await request('wine_entries?select=id&order=id',viewer,options); assert.equal(r.status,200); return r.body.map(r=>r.id);
};
try {
  await db.initialise(); await db.start(); client=db.getPgClient('postgres','127.0.0.1'); await client.connect();
  for (const file of ['entry-access-schema.sql','entry-access-functions.sql','entry-access-seed.sql']) {
    await client.query(await readFile(`e2e/fixtures/${file}`,'utf8'));
  }
  // Random password contains only hex; no user/project input enters SQL identifiers.
  await client.query(`create role authenticator noinherit login password '${password}'; grant anon,authenticated,service_role to authenticator;`);
  api=spawn(resolve(runtime,'postgrest'),[],{env:{PATH:process.env.PATH, LANG:'C',
    DYLD_LIBRARY_PATH:resolve(runtime,'node_modules/@embedded-postgres/darwin-arm64/native/lib'),
    PGRST_DB_URI:`postgresql://authenticator:${password}@127.0.0.1:${pgPort}/postgres`,
    PGRST_DB_SCHEMAS:'public,storage', PGRST_DB_ANON_ROLE:'anon', PGRST_JWT_SECRET:secret,
    PGRST_SERVER_HOST:'127.0.0.1', PGRST_SERVER_PORT:String(apiPort), PGRST_DB_POOL:'2', PGRST_LOG_LEVEL:'crit'},stdio:['ignore','pipe','pipe']});
  let startupError=''; api.stderr.on('data',d=>{startupError+=d.toString()});
  let ready=false;
  for (let i=0;i<50;i++) {
    if (api.exitCode !== null) throw new Error(`PostgREST exited during startup: ${startupError}`);
    try { const r=await request('wine_entries?select=id&limit=1',null); if(r.status===200){ready=true;break;} } catch {}
    await new Promise(r=>setTimeout(r,100));
  }
  assert(ready,'PostgREST did not become ready');
  check('pre-migration ordinary viewer sees private entry (synthetic reproduction)', (await ids(4)).includes(entryId(3)), true);
  for (const file of migrations) await client.query(await readFile(`supabase/sql/${file}`,'utf8'));
  for (const file of migrations) await client.query(await readFile(`supabase/sql/${file}`,'utf8'));
  for (const [viewer,allowed] of [[1,[0,1,2,3]],[2,[0,1,2]],[3,[0,2]],[4,[0]],[7,[0]],[5,[0,1,2,3,10,11,12,13]],[6,[0,1,2,3,10,11,12,13]],[null,[]]]) {
    check(`migrated Data API viewer ${viewer ?? 'anon'}`,await ids(viewer),allowed.map(entryId));
  }
  check('service role retains all entries',(await ids(0,{role:'service_role'})).length,8);
  check('authenticated JWT without subject gets no rows',await ids(0),[]);
  const invalid=token(4).slice(0,-8)+'00000000';
  check('invalid JWT rejected',(await request('wine_entries',4,{jwt:invalid})).status,401);
  const pooled=await Promise.all(Array.from({length:20},(_,i)=>ids(i%2 ? 1:4)));
  check('pooled concurrent identities do not inherit another viewer’s access',pooled.every((x,i)=>JSON.stringify(x)===JSON.stringify((i%2 ? [0,1,2,3]:[0]).map(entryId))),true);
  for(const viewer of [2,5]) for(const reverse of [false,true]) {
    await client.query('insert into user_blocks values ($1,$2)',reverse?[uid(viewer),uid(1)]:[uid(1),uid(viewer)]);
    check(`block ${reverse?'viewer→owner':'owner→viewer'} denies viewer ${viewer}`,(await ids(viewer)).filter(id=>[0,1,2,3].map(entryId).includes(id)),[]);
    await client.query('delete from user_blocks');
  }
  check('owner retains raw 1–100 private rating',(await request(`wine_entries?id=eq.${entryId(3)}&select=rating`,1)).body,[{rating:92}]);
  check('ordinary viewer cannot retrieve private rating',(await request(`wine_entries?id=eq.${entryId(3)}&select=rating`,4)).body,[]);
  check('photo join is filtered by parent visibility',(await request('entry_photos?select=path&order=path',4)).body,[{path:'synthetic/photo-0.jpg'}]);
  await client.query('insert into wine_entries (id,user_id,entry_privacy,root_entry_id) values ($1,$2,\'private\',$3)',[entryId(20),uid(4),entryId(3)]);
  check('copy owner sees copy without gaining access to private original',await ids(4),[entryId(0),entryId(20)]);
  check('owner can edit profile',(await request(`profiles?id=eq.${uid(1)}`,1,{method:'PATCH',body:{display_name:'Edited fixture'}})).status,200);
  check('client capability escalation denied',(await request(`profiles?id=eq.${uid(1)}`,1,{method:'PATCH',body:{is_test_account:true}})).status,403);
  check('trusted tester cannot revoke protected flag',(await request(`profiles?id=eq.${uid(5)}`,5,{method:'PATCH',body:{is_test_account:false}})).status,403);
  check('client cannot insert a privileged profile',(await request('profiles',8,{method:'POST',body:{id:uid(8),is_test_account:true}})).status,403);
  check('ordinary profile insert allowed',(await request('profiles',8,{method:'POST',body:{id:uid(8),display_name:'New fixture'}})).status,201);
  check('service role can maintain capability',(await request(`profiles?id=eq.${uid(8)}`,0,{role:'service_role',method:'PATCH',body:{is_test_account:true}})).status,200);
  check('owner can create private entry',(await request('wine_entries',1,{method:'POST',body:{id:entryId(30),user_id:uid(1),entry_privacy:'private',rating:100}})).status,201);
  check('owner can edit rating',(await request(`wine_entries?id=eq.${entryId(30)}`,1,{method:'PATCH',body:{rating:1}})).body[0].rating,1);
  check('owner cannot transfer ownership',(await request(`wine_entries?id=eq.${entryId(30)}`,1,{method:'PATCH',body:{user_id:uid(4)}})).status,403);
  check('viewer cannot update public entry',(await request(`wine_entries?id=eq.${entryId(0)}`,4,{method:'PATCH',body:{rating:1}})).body,[]);
  check('tester cannot delete someone else’s private entry',(await request(`wine_entries?id=eq.${entryId(30)}`,5,{method:'DELETE'})).body,[]);
  check('owner can delete entry',(await request(`wine_entries?id=eq.${entryId(30)}`,1,{method:'DELETE'})).body.length,1);
  for(const viewer of [null,1]) {
    check(`public asset read retained for ${viewer??'anon'}`,(await request('objects?select=name',viewer,{schema:'storage'})).body,[{name:'original.svg'}]);
    check(`public asset insert denied for ${viewer??'anon'}`,[401,403].includes((await request('objects',viewer,{schema:'storage',method:'POST',body:{name:'forbidden.svg',bucket_id:'public-assets'}})).status),true);
    check(`public asset update denied for ${viewer??'anon'}`,(await request('objects?name=eq.original.svg',viewer,{schema:'storage',method:'PATCH',body:{name:'forbidden.svg'}})).body,[]);
  }
  check('backend public asset insert retained',(await request('objects',0,{schema:'storage',role:'service_role',method:'POST',body:{name:'admin.svg',bucket_id:'public-assets'}})).status,201);
  check('backend public asset update retained',(await request('objects?name=eq.admin.svg',0,{schema:'storage',role:'service_role',method:'PATCH',body:{name:'updated.svg'}})).status,200);
  console.log(`PASS ${passed} HTTP integration assertions; PostgreSQL ${(await client.query('show server_version')).rows[0].server_version}; both real migrations replayed. Production untouched.`);
} finally {
  if(api && api.exitCode===null){api.kill('SIGTERM');await once(api,'exit');}
  if(client)await client.end();
  await db.stop();
  await rm(scratch,{recursive:true,force:true});
}
