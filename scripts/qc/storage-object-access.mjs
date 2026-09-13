// Local-only integration test: disposable PostgreSQL + official Supabase Storage service.
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
assert(runtime && process.argv[3] && process.argv[4], 'Pass embedded-postgres runtime, built official Storage checkout, and Node 24 executable');
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
let client; let api; let passed = 0;
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); passed++; console.log(`PASS ${label}`); };
const token = (viewer, role = 'authenticated') => {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify({ role, sub: viewer ? uid(viewer) : undefined, exp: Math.floor(Date.now()/1000)+1800 })).toString('base64url');
  return `${h}.${p}.${createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`;
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
  await client.query(await readFile('supabase/sql/20260912214315_enforce_photo_and_group_metadata_privacy.sql','utf8'));
  await client.query(await readFile('e2e/fixtures/storage-access-schema.sql','utf8'));
  // Replace the synthetic Storage schema with the official service's migrations.
  await client.query('drop schema storage cascade');
  api=spawn(process.argv[4],['dist/start/server.js'],{cwd:resolve(process.argv[3]),env:{PATH:process.env.PATH,LANG:'C',
    DATABASE_URL:`postgresql://postgres:${password}@127.0.0.1:${pgPort}/postgres`,
    AUTH_JWT_SECRET:secret, SERVER_HOST:'127.0.0.1',SERVER_PORT:String(apiPort),
    STORAGE_BACKEND:'file',STORAGE_FILE_BACKEND_PATH:join(scratch,'objects'),
    UPLOAD_FILE_SIZE_LIMIT:'10485760',PG_QUEUE_ENABLE:'false',S3_PROTOCOL_ENABLED:'false',
    IMAGE_TRANSFORMATION_ENABLED:'false',OTEL_METRICS_ENABLED:'false',PROMETHEUS_METRICS_ENABLED:'false',
    LOG_LEVEL:'error',DB_INSTALL_ROLES:'true',DB_SUPER_USER:'postgres'},stdio:['ignore','pipe','pipe']});
  let startupError=''; api.stderr.on('data',d=>{startupError+=d.toString()}); api.stdout.on('data',d=>{startupError+=d.toString()});
  const base=`http://127.0.0.1:${apiPort}`;
  let ready=false;
  for(let i=0;i<150;i++) {
    if(api.exitCode!==null) throw new Error(`Storage exited: ${startupError}`);
    try{const r=await fetch(`${base}/status`);if(r.ok){ready=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,100));
  }
  assert(ready,`Storage not ready: ${startupError}`);
  const req=async(path,viewer,{method='GET',body,raw,role='authenticated',headers={}}={})=>{
    const r=await fetch(`${base}${path}`,{method,headers:{Authorization:`Bearer ${token(viewer,role)}`,
      'Content-Type':raw?'image/png':'application/json',...headers},body:raw??(body?JSON.stringify(body):undefined),signal:AbortSignal.timeout(10000)});
    const t=await r.text(); let data;try{data=JSON.parse(t)}catch{data=t};return {status:r.status,data};
  };
  for(const [id,isPublic] of [['wine-photos',false],['public-assets',true]]) {
    const r=await req('/bucket',null,{method:'POST',role:'service_role',body:{id,name:id,public:isPublic}});
    assert.equal(r.status,200,JSON.stringify(r.data));
  }
  const storagePolicies=JSON.parse(await readFile('docs/remediation/evidence/b02b2-live-storage-policies.json','utf8'));
  for(const p of storagePolicies){
    await client.query(`create policy ${quote(p.policyname)} on storage.objects for ${p.cmd} to ${p.roles.slice(1,-1).split(',').map(quote).join(',')}
      ${p.qual?`using (${p.qual})`:''} ${p.with_check?`with check (${p.with_check})`:''}`);
  }
  const paths=(await client.query(`select path from entry_photos union select label_image_path from wine_entries
    union select place_image_path from wine_entries union select pairing_image_path from wine_entries
    union select path from entry_group_slides where entry_id is null union select avatar_path from profiles`)).rows.map(r=>r.path);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64');
  for(const path of paths.filter(p=>p&&p!=='pending')) {
    const r=await req(`/object/wine-photos/${path}`,null,{method:'POST',role:'service_role',raw:png});
    assert.equal(r.status,200,JSON.stringify(r.data));
  }
  const hidden=`${uid(1)}/${uid(103)}/label-legacy.jpg`;
  check('pre-fix actual download exposes private photo',(await req(`/object/authenticated/wine-photos/${hidden}`,4)).status,200);
  await client.query(await readFile('supabase/sql/20260912222036_enforce_wine_object_privacy.sql','utf8'));
  await client.query(await readFile('supabase/sql/20260912222036_enforce_wine_object_privacy.sql','utf8'));
  check('post-fix actual download denies private photo',(await req(`/object/authenticated/wine-photos/${hidden}`,4)).status,400);
  const pairing=`${uid(1)}/${uid(100)}/pairing-legacy.jpg`;
  const photoPaths=[`${uid(1)}/${uid(100)}/label-legacy.jpg`,`${uid(1)}/${uid(100)}/place-legacy.jpg`,
    `${uid(1)}/${uid(101)}/label-legacy.jpg`,`${uid(1)}/${uid(102)}/label-legacy.jpg`,hidden,pairing];
  for(const [viewer,expected] of [[1,[true,true,true,true,true,true]],[2,[true,false,true,true,false,true]],
    [3,[false,false,false,true,false,true]],[4,[false,false,false,false,false,true]],
    [7,[false,false,false,false,false,true]],[5,[true,true,true,true,true,true]]]) {
    for(let i=0;i<photoPaths.length;i++) {
      check(`download viewer ${viewer} source ${i}`,(await req(`/object/authenticated/wine-photos/${photoPaths[i]}`,viewer)).status===200,expected[i]);
      const signed=await req(`/object/sign/wine-photos/${photoPaths[i]}`,viewer,{method:'POST',body:{expiresIn:60}});
      check(`single sign viewer ${viewer} source ${i}`,signed.status===200,expected[i]);
      if(expected[i]) check(`signed retrieval viewer ${viewer} source ${i}`,(await fetch(base+signed.data.signedURL)).status,200);
    }
    const batch=await req('/object/sign/wine-photos',viewer,{method:'POST',body:{expiresIn:60,paths:photoPaths}});
    check(`batch sign viewer ${viewer}`,batch.data.map(r=>Boolean(r.signedURL)),expected);
  }
  check('anonymous auth download denied',(await req(`/object/authenticated/wine-photos/${pairing}`,null,{role:'anon'})).status===200,false);
  check('private bucket public endpoint denied',(await req(`/object/public/wine-photos/${pairing}`,null,{role:'anon'})).status===200,false);
  check('forged JWT denied',(await req(`/object/authenticated/wine-photos/${pairing}`,4,{headers:{Authorization:'Bearer invalid'}})).status===200,false);
  const modern=`${uid(1)}/${uid(100)}/label/${uid(200)}.jpg`;
  const original=modern.replace('.jpg','__original.jpg');
  check('owner original upload',(await req(`/object/wine-photos/${original}`,1,{method:'POST',raw:png})).status,200);
  check('friend original download',(await req(`/object/authenticated/wine-photos/${original}`,2)).status,200);
  check('stranger original denied',(await req(`/object/authenticated/wine-photos/${original}`,4)).status===200,false);
  const copy=`${uid(2)}/${uid(130)}/label/copied.jpg`;
  await client.query("insert into wine_entries(id,user_id,entry_privacy,root_entry_id) values ($1,$2,'public',$3)",[uid(130),uid(2),uid(100)]);
  await client.query("insert into entry_photos(id,entry_id,path,type) values ($1,$2,$3,'label')",[uid(230),uid(130),copy]);
  check('allowed physical copy',(await req('/object/copy',2,{method:'POST',body:{bucketId:'wine-photos',sourceKey:pairing,destinationKey:copy}})).status,200);
  check('private source copy denied',(await req('/object/copy',2,{method:'POST',body:{bucketId:'wine-photos',sourceKey:hidden,destinationKey:copy+'-attack'}})).status===200,false);
  check('foreign destination copy denied',(await req('/object/copy',2,{method:'POST',body:{bucketId:'wine-photos',sourceKey:pairing,destinationKey:`${uid(4)}/attack.jpg`}})).status===200,false);
  for(const p of [`${uid(1)}/draft/new.jpg`,`${uid(1)}/collections/${uid(800)}/cover.jpg`,`${uid(1)}/avatar.jpg`]) {
    check('owner upload/upsert '+p.split('/').slice(1).join('/'),(await req(`/object/wine-photos/${p}`,1,{method:'POST',raw:png,headers:{'x-upsert':'true'}})).status,200);
    check('owner repeat upsert '+p.split('/').slice(1).join('/'),(await req(`/object/wine-photos/${p}`,1,{method:'POST',raw:png,headers:{'x-upsert':'true'}})).status,200);
    check('foreign upsert denied '+p.split('/').slice(1).join('/'),(await req(`/object/wine-photos/${p}`,4,{method:'POST',raw:png,headers:{'x-upsert':'true'}})).status===200,false);
    check('foreign read matches avatar visibility '+p.split('/').slice(1).join('/'),(await req(`/object/authenticated/wine-photos/${p}`,4)).status===200,p.endsWith('/avatar.jpg'));
  }
  const signedUploadPath=`${uid(1)}/draft/signed.jpg`;
  const signedUpload=await req(`/object/upload/sign/wine-photos/${signedUploadPath}`,1,{method:'POST',body:{}});
  check('owner signed upload URL',signedUpload.status,200);
  check('owner signed upload transfer',(await req(signedUpload.data.url,1,{method:'PUT',raw:png})).status,200);
  check('foreign signed upload URL denied',(await req(`/object/upload/sign/wine-photos/${uid(1)}/draft/attack.jpg`,4,{method:'POST',body:{}})).status===200,false);
  check('foreign delete returns no objects',(await req('/object/wine-photos',4,{method:'DELETE',body:{prefixes:[signedUploadPath]}})).data,[]);
  check('owner delete returns one object',(await req('/object/wine-photos',1,{method:'DELETE',body:{prefixes:[signedUploadPath]}})).data.length,1);
  check('deleted object cannot download',(await req(`/object/authenticated/wine-photos/${signedUploadPath}`,1)).status===200,false);
  for(const viewer of [2,5]) for(const reverse of [false,true]) {
    await client.query('insert into user_blocks values ($1,$2)',reverse?[uid(viewer),uid(1)]:[uid(1),uid(viewer)]);
    for(const p of [pairing,`${uid(1)}/avatar.jpg`]) check(`blocked ${viewer}/${reverse} download`,(await req(`/object/authenticated/wine-photos/${p}`,viewer)).status===200,false);
    await client.query('delete from user_blocks');
  }
  const issued=await req(`/object/sign/wine-photos/${pairing}`,4,{method:'POST',body:{expiresIn:60}});
  await client.query("update wine_entries set label_photo_privacy='private' where id=$1",[uid(100)]);
  check('photo override change revokes original download',(await req(`/object/authenticated/wine-photos/${original}`,2)).status===200,false);
  await client.query("update entry_photos set type='people' where id=$1",[uid(200)]);
  check('reclassified photo follows metadata, not its old label folder',(await req(`/object/authenticated/wine-photos/${modern}`,4)).status,200);
  check('reclassified original follows its base metadata',(await req(`/object/authenticated/wine-photos/${original}`,4)).status,200);
  // A visible context cannot relabel an ordered private source.
  await client.query("update entry_photos set type='label' where id=$1",[uid(200)]);
  await client.query("insert into entry_group_slides(id,group_id,entry_id,photo_type,path) values ($1,$2,null,'pairing',$3)",[uid(460),uid(300),modern]);
  check('forged context cannot unlock hidden ordered source',(await req(`/object/authenticated/wine-photos/${modern}`,4)).status===200,false);
  await client.query('update profiles set avatar_path=null where id=$1',[uid(1)]);
  check('removed avatar is no longer public to signed-in users',(await req(`/object/authenticated/wine-photos/${uid(1)}/avatar.jpg`,4)).status===200,false);
  await client.query("update wine_entries set entry_privacy='private' where id=$1",[uid(100)]);
  check('source change revokes authenticated download',(await req(`/object/authenticated/wine-photos/${pairing}`,4)).status===200,false);
  check('source change revokes new signature',(await req(`/object/sign/wine-photos/${pairing}`,4,{method:'POST',body:{expiresIn:60}})).status===200,false);
  check('already-issued URL remains valid until expiry',(await fetch(base+issued.data.signedURL)).status,200);
  check('independent copy remains owner-readable',(await req(`/object/authenticated/wine-photos/${copy}`,2)).status,200);
  check('independent public copy remains stranger-readable',(await req(`/object/authenticated/wine-photos/${copy}`,4)).status,200);
  const publicObject='fixture.png';
  check('service uploads public asset',(await req(`/object/public-assets/${publicObject}`,null,{method:'POST',role:'service_role',raw:png})).status,200);
  check('public asset still downloads anonymously',(await req(`/object/public/public-assets/${publicObject}`,null,{role:'anon'})).status,200);
  check('authenticated public-assets write still denied',(await req('/object/public-assets/attack.png',1,{method:'POST',raw:png})).status===200,false);
  console.log(`PASS ${passed} actual Storage HTTP assertions; official v1.77.0, isolated PostgreSQL. Production untouched.`);
  if(process.argv.includes('--serve')) {
    const {serveShareBrowser}=await import('./share-browser-runtime.mjs');
    await serveShareBrowser({client,runtime,pgPort,password,secret,apiPort,token,uid,freePort,scratch});
  }
} finally {
  if(api&&api.exitCode===null){api.kill('SIGTERM');await once(api,'exit');}
  if(client)await client.end();
  await db.stop();await rm(scratch,{recursive:true,force:true});
}
