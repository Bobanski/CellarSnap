// Optional browser phase of storage-object-access.mjs. All services and rows
// remain local/disposable. No project credentials are read or exported.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import { createInterface } from 'node:readline';
import { open, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function serveShareBrowser({client,runtime,pgPort,password,secret,apiPort,token,uid,freePort,scratch}) {
  await client.query(`
    alter table wine_entries add column wine_name text default 'B02b2 public fixture', add column producer text default 'Synthetic cellar',
      add column vintage text default '2024', add column consumed_at date default '2026-09-12',add column country text default 'France',
      add column region text default 'Bordeaux',add column appellation text,add column qpr_level text;
    alter table entry_photos add column position int default 0,add column created_at timestamptz default now();
    alter table entry_group_slides add column position int default 0,add column created_at timestamptz default now();
    create or replace view public_profiles as select id,avatar_path,is_test_account,display_name,
      display_name as username,null::text first_name,null::text last_name,null::text email,'username'::text name_display_preference from profiles;
    create table post_shares(id uuid primary key,post_id uuid references wine_entries(id),expires_at timestamptz,revoked_at timestamptz,mode text default 'unlisted');
    create table wine_entry_scores(wine_entry_id uuid,user_id uuid,match_score int,display_score boolean,computed_at timestamptz);
    create table grape_varieties(id uuid primary key,name text);
    create table entry_primary_grapes(entry_id uuid,position int,grape_variety_id uuid references grape_varieties(id));
    grant all on all tables in schema public to service_role;
    alter role authenticator password '${password}';
  `);
  await client.query("update wine_entries set entry_privacy='public' where id=$1",[uid(100)]);
  await client.query("insert into wine_entries(id,user_id,entry_privacy,wine_name) values ($1,$2,'public','B02b2 no-photo fixture')",[uid(132),uid(1)]);
  for(const [share,entry,expiry,revoked] of [[900,100,null,null],[901,103,null,null],[902,110,null,null],
    [903,100,'2020-01-01',null],[904,100,null,'2020-01-01'],[905,132,null,null]]) {
    await client.query('insert into post_shares(id,post_id,expires_at,revoked_at) values ($1,$2,$3,$4)',[uid(share),uid(entry),expiry,revoked]);
  }
  // Private member sorts first, public context second; hidden label/place never
  // become a fallback preview. Existing paths were uploaded by the HTTP suite.
  await client.query('update entry_group_slides set position=100');
  await client.query('update entry_group_slides set position=0 where id=$1',[uid(402)]);
  await client.query('update entry_group_slides set position=1 where id=$1',[uid(403)]);
  const labelPath=`${uid(1)}/${uid(100)}/label/${uid(200)}.jpg`;
  const photo=await readFile('eval/fixtures/images/saint-aubin-label.jpg');
  const upload=await fetch(`http://127.0.0.1:${apiPort}/object/wine-photos/${labelPath}`,{
    method:'POST',headers:{Authorization:`Bearer ${token(1)}`,'Content-Type':'image/jpeg','x-upsert':'true'},body:photo});
  if(!upload.ok)throw new Error('Could not prepare disposable label image');
  const restPort=await freePort(); const gatewayPort=await freePort();
  const restLog=await open(`${scratch}/postgrest.log`,'w');
  const webLog=await open('/tmp/cellarsnap-b02b2-browser-server.log','w');
  let web;let gateway;let input;
  const rest=spawn(resolve(runtime,'postgrest'),[],{env:{PATH:process.env.PATH,LANG:'C',
    DYLD_LIBRARY_PATH:resolve(runtime,'node_modules/@embedded-postgres/darwin-arm64/native/lib'),
    PGRST_DB_URI:`postgresql://authenticator:${password}@127.0.0.1:${pgPort}/postgres`,
    PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,
    PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:String(restPort),PGRST_DB_POOL:'2',PGRST_LOG_LEVEL:'crit'},
    stdio:['ignore',restLog.fd,restLog.fd]});
  try {
    // Supabase URL routing only; auth is deliberately absent in this anonymous
    // browser phase. The application calls real PostgREST and Storage services.
    gateway=createServer((req,res)=>{
      const restRoute=req.url.startsWith('/rest/v1/');const storageRoute=req.url.startsWith('/storage/v1/');
      if(!restRoute&&!storageRoute){res.writeHead(404);res.end();return;}
      const upstream=request({hostname:'127.0.0.1',port:restRoute?restPort:apiPort,
        path:req.url.replace(restRoute?'/rest/v1':'/storage/v1',''),method:req.method,headers:req.headers},r=>{
        res.writeHead(r.statusCode,r.headers);r.pipe(res);
      });
      upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
    });
    gateway.listen(gatewayPort,'127.0.0.1');await once(gateway,'listening');
    web=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--port','3001'],{env:{
      PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',
      NEXT_PUBLIC_SUPABASE_URL:`http://127.0.0.1:${gatewayPort}`,NEXT_PUBLIC_SUPABASE_ANON_KEY:token(null,'anon'),
      SUPABASE_SERVICE_ROLE_KEY:token(null,'service_role'),PUBLIC_SITE_URL:'http://localhost:3001',
      NEXT_PUBLIC_SITE_URL:'http://localhost:3001'},stdio:['ignore',webLog.fd,webLog.fd]});
    console.log('Browser fixture ready at http://localhost:3001/s/'+uid(900));
    console.log('Share suffixes: 900 public mixed gallery, 901 private, 902 tester, 903 expired, 904 revoked, 905 no photos.');
    console.log('Commands: private, public, revoke, restore, label-public, label-private, stop. All mutate only this isolated fixture.');
    input=createInterface({input:process.stdin});
    for await(const raw of input){
      const command=raw.trim();
      if(command==='stop')break;
      if(['private','public'].includes(command))await client.query('update wine_entries set entry_privacy=$1 where id=$2',[command,uid(100)]);
      else if(['revoke','restore'].includes(command))await client.query('update post_shares set revoked_at=$1 where id=$2',[command==='revoke'?new Date():null,uid(900)]);
      else if(['label-public','label-private'].includes(command))await client.query('update wine_entries set label_photo_privacy=$1 where id=$2',[command.slice(6),uid(100)]);
      else {console.log('Unknown fixture command');continue;}
      console.log('Fixture updated: '+command);
    }
  } finally {
    input?.close();
    if(web&&web.exitCode===null){web.kill('SIGTERM');await once(web,'exit');}
    if(gateway)await new Promise(r=>gateway.close(r));
    if(rest.exitCode===null){rest.kill('SIGTERM');await once(rest,'exit');}
    await webLog.close();await restLog.close();
  }
}
