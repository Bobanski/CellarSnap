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
const migrations = ['20260912214315_enforce_photo_and_group_metadata_privacy.sql'];
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
try {
  await db.initialise(); await db.start(); client=db.getPgClient('postgres','127.0.0.1'); await client.connect();
  for (const file of ['entry-access-schema.sql','entry-access-functions.sql','entry-access-seed.sql']) {
    await client.query(await readFile(`e2e/fixtures/${file}`,'utf8'));
  }
  for (const file of ['20260912185640_protect_profile_capabilities_and_public_assets.sql','20260912200417_enforce_entry_read_privacy.sql']) {
    await client.query(await readFile(`supabase/sql/${file}`,'utf8'));
  }
  await client.query(await readFile('e2e/fixtures/photo-group-schema.sql','utf8'));
  const policies=JSON.parse(await readFile('docs/remediation/evidence/b02b1-live-policies.json','utf8'));
  const quote=v=>'"'+v.replaceAll('"','""')+'"';
  for(const p of policies.filter(p=>p.tablename!=='wine_entries')) {
    const roles=Array.isArray(p.roles)?p.roles:p.roles.slice(1,-1).split(',');
    await client.query(`drop policy if exists ${quote(p.policyname)} on public.${quote(p.tablename)};
      create policy ${quote(p.policyname)} on public.${quote(p.tablename)} for ${p.cmd} to ${roles.map(quote).join(',')}
      ${p.qual?`using (${p.qual})`:''} ${p.with_check?`with check (${p.with_check})`:''}`);
  }
  await client.query(await readFile('e2e/fixtures/photo-group-seed.sql','utf8'));
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
  const visible = async(table, viewer, options) => {
    const r=await request(`${table}?select=id&order=id`,viewer,options);assert.equal(r.status,200,JSON.stringify(r.body));
    return r.body.map(r=>Number(r.id.slice(-12)));
  };
  check('pre-fix HTTP exposes private group', (await visible('entry_groups',4)).includes(301),true);
  check('pre-fix HTTP exposes private slide', (await visible('entry_group_slides',4)).includes(402),true);
  check('pre-fix HTTP exposes private photo override',(await visible('entry_photos',4)).includes(210),true);
  for(const file of migrations) await client.query(await readFile(`supabase/sql/${file}`,'utf8'));
  for(const file of migrations) await client.query(await readFile(`supabase/sql/${file}`,'utf8'));
  for(const [viewer,photos,groups,slides] of [
    [1,[200,201,202,203,210,211,212],[300,301,303],[400,401,402,403,404,405,406,408]],
    [2,[200,201,202,211],[300],[400,401,403,405]],
    [3,[202,211],[300],[403,405]], [4,[211],[300],[403,405]], [7,[211],[300],[403,405]],
    [5,[200,201,202,203,210,211,212],[300,301,302],[400,401,402,403,404,405,406,407]],
    [null,[],[],[]], [0,[],[],[]]
  ]) {
    check(`HTTP photo metadata viewer ${viewer}`,await visible('entry_photos',viewer),photos);
    check(`HTTP group metadata viewer ${viewer}`,await visible('entry_groups',viewer),groups);
    check(`HTTP slide metadata viewer ${viewer}`,await visible('entry_group_slides',viewer),slides);
  }
  check('service-role access preserved',(await visible('entry_group_slides',0,{role:'service_role'})).length,9);
  for(const viewer of [2,5]) for(const reverse of [true,false]) {
    await client.query('insert into user_blocks values ($1,$2)',reverse?[uid(viewer),uid(1)]:[uid(1),uid(viewer)]);
    check(`HTTP blocked photos ${viewer}/${reverse}`,await visible('entry_photos',viewer),[]);
    check(`HTTP blocked groups ${viewer}/${reverse}`,(await visible('entry_groups',viewer)).filter(id=>id!==302),[]);
    check(`HTTP blocked slides ${viewer}/${reverse}`,(await visible('entry_group_slides',viewer)).filter(id=>id!==407),[]);
    await client.query('delete from user_blocks');
  }
  check('owner edits private photo',(await request(`entry_photos?id=eq.${uid(210)}`,1,{method:'PATCH',body:{path:'edited-private'}})).body.length,1);
  check('viewer cannot edit photo',(await request(`entry_photos?id=eq.${uid(211)}`,4,{method:'PATCH',body:{path:'attack'}})).body,[]);
  check('owner creates unanchored draft',(await request('entry_groups',1,{method:'POST',body:{id:uid(305),user_id:uid(1),title:'Draft'}})).status,201);
  check('owner creates draft slide',(await request('entry_group_slides',1,{method:'POST',body:{id:uid(412),group_id:uid(305),entry_id:null,photo_type:'place',path:'pending'}})).status,201);
  check('owner edits draft slide',(await request(`entry_group_slides?id=eq.${uid(412)}`,1,{method:'PATCH',body:{path:'uploaded'}})).body.length,1);
  check('foreign group ownership transfer denied',(await request(`entry_groups?id=eq.${uid(305)}`,1,{method:'PATCH',body:{user_id:uid(4)}})).status,403);
  check('foreign slide insert denied',(await request('entry_group_slides',4,{method:'POST',body:{id:uid(413),group_id:uid(300),entry_id:null,photo_type:'place',path:'attack'}})).status,403);
  check('foreign slide delete denied',(await request('entry_group_slides',4,{method:'DELETE'})).body,[]);
  check('owner deletes draft slide',(await request(`entry_group_slides?id=eq.${uid(412)}`,1,{method:'DELETE'})).body.length,1);
  check('owner deletes draft group',(await request(`entry_groups?id=eq.${uid(305)}`,1,{method:'DELETE'})).body.length,1);
  check('anchor privacy update succeeds',(await request(`wine_entries?id=eq.${uid(100)}`,1,{method:'PATCH',body:{entry_privacy:'private'}})).body.length,1);
  check('anchor update revokes group on next HTTP request',await visible('entry_groups',2),[]);
  check('anchor update revokes context and wine slides',await visible('entry_group_slides',2),[]);
  const pooled=await Promise.all(Array.from({length:20},(_,i)=>visible('entry_group_slides',i%2?1:4)));
  check('pooled concurrent HTTP identities stay isolated',pooled.every((v,i)=>v.length===(i%2?8:0)),true);
  console.log(`PASS ${passed} HTTP assertions; PostgreSQL ${(await client.query('show server_version')).rows[0].server_version}. Actual B02b1 migration replayed. Production untouched.`);
} finally {
  if(api && api.exitCode===null){api.kill('SIGTERM');await once(api,'exit');}
  if(client)await client.end();
  await db.stop();
  await rm(scratch,{recursive:true,force:true});
}
