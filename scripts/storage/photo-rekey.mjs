// Explicit operator tool. Never imported by web/native code. Stops after a
// committed reference swap; old-object retirement has no command in this release.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
const same = isDeepStrictEqual;
const objectFor = (snapshot, path) => snapshot.objects.find(o => o.path === path)?.object;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const validMime = mime => /^image\/(jpeg|png|webp|gif|avif|heic|heif)$/.test(mime);

// DB adapter exposes only fixed operator commands, with values supplied as SQL
// literals over stdin (never shell interpolation or command-line credentials).
export function psqlAdapter(env = process.env) {
  if (!env.PGHOST || !env.PGUSER || !env.PGDATABASE) throw new Error('Explicit PGHOST/PGUSER/PGDATABASE required');
  if (!['127.0.0.1','localhost','::1'].includes(env.PGHOST) && !env.PGHOST.startsWith('/') && env.PGSSLMODE !== 'verify-full') {
    throw new Error('Remote operator database requires PGSSLMODE=verify-full');
  }
  const literal = value => `convert_from(decode('${Buffer.from(JSON.stringify(value)).toString('hex')}','hex'),'UTF8')::jsonb`;
  const query = async sql => {
    const child = spawn(env.CELLARSNAP_PSQL ?? 'psql', ['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'], {
      env: {...env, PGOPTIONS: '-c statement_timeout=30000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=30000'}, stdio:['pipe','pipe','pipe'],
    });
    let out='', exceeded=false;
    const timer=setTimeout(()=>{exceeded=true;child.kill('SIGKILL');},35000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data',s=>{out+=s;if(Buffer.byteLength(out)>8*1024*1024){exceeded=true;child.kill('SIGKILL');}});
    child.stderr.resume();
    child.stdin.on('error',()=>{exceeded=true;});
    child.stdin.end(sql);
    try {
      await new Promise((ok,no)=>{
        child.once('error',()=>no(new Error('Operator database client unavailable')));
        child.once('close',code=>code===0&&!exceeded?ok():no(new Error('Operator transaction failed; inspect private database diagnostics and resume by operation ID')));
      });
      return JSON.parse(out.trim());
    }finally{clearTimeout(timer);}
  };
  return {
    plan: (id,path)=>query(`select private.plan_photo_rekey((${literal(id)}#>>'{}')::uuid,${literal(path)}#>>'{}');`),
    get: id=>query(`select to_jsonb(o) from private.photo_rekey_operations o where id=(${literal(id)}#>>'{}')::uuid;`),
    snapshot: paths=>query(`select private.photo_rekey_snapshot(array(select jsonb_array_elements_text(${literal(paths)})));`),
    commit: (id,proof)=>query(`select private.commit_photo_rekey((${literal(id)}#>>'{}')::uuid,${literal(proof)});`),
    abandon: id=>query(`select private.abandon_photo_rekey((${literal(id)}#>>'{}')::uuid);`),
  };
}

export function storageAdapter(url, key, fetcher = fetch) {
  const base=new URL(url);
  if (base.protocol!=='https:' || base.username || base.password || base.pathname!=='/' || base.search || base.hash || !key) throw new Error('Explicit HTTPS Storage project URL and operator service key required');
  const request=async(path,options={})=>{
    const response=await fetcher(new URL(path,base),{...options,redirect:'error',signal:AbortSignal.timeout(30000),
      headers:{apikey:key,Authorization:`Bearer ${key}`,...options.headers}});
    if(!response.ok) {await response.body?.cancel();throw new Error(`Storage operation failed (${response.status}); resume by operation ID`);}
    return response;
  };
  return {
    copy:async(oldPath,newPath)=>{
      const r=await request('/storage/v1/object/copy',{method:'POST',headers:{'Content-Type':'application/json','x-upsert':'false'},
        body:JSON.stringify({bucketId:'wine-photos',sourceKey:oldPath,destinationKey:newPath})});
      await r.body?.cancel();
    },
    read:async path=>{
      const r=await request('/storage/v1/object/authenticated/wine-photos/'+path.split('/').map(encodeURIComponent).join('/'));
      const mimetype=r.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      if(!validMime(mimetype??'') || Number(r.headers.get('content-length'))>MAX_PHOTO_BYTES){await r.body?.cancel();throw new Error('Unsupported or oversized photo');}
      const chunks=[];let size=0;const reader=r.body.getReader();
      try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
        if(size>MAX_PHOTO_BYTES)throw new Error('Photo byte bound exceeded');chunks.push(Buffer.from(value));}}
      finally{await reader.cancel();reader.releaseLock();}
      if(!size)throw new Error('Empty photo');
      return {bytes:Buffer.concat(chunks),mimetype};
    },
  };
}

// Stable mapping makes successful copies discoverable after a crash/lost response.
// Do not overwrite or delete a destination on error: it may be a completed copy.
export async function resumeRekey(db, storage, id) {
  const op=await db.get(id);
  if(op.state==='pending_revocation')return op;
  if(op.state!=='planned')throw new Error('Operation is not resumable');
  const oldPaths=op.mapping.map(m=>m.old),newPaths=op.mapping.map(m=>m.new);
  if(!same(await db.snapshot(oldPaths),op.expected))throw new Error('Photo source changed; abandon and replan');
  const hashes=[];
  for(const m of op.mapping){
    const expected=objectFor(op.expected,m.old);
    if(!expected){hashes.push({old:m.old,new:m.new,absent:true});continue;}
    if(!objectFor(await db.snapshot(newPaths),m.new))await storage.copy(m.old,m.new);
    const before=await db.snapshot(newPaths);
    const source=await storage.read(m.old),copy=await storage.read(m.new);
    if(source.bytes.length>MAX_PHOTO_BYTES || !source.bytes.length || !validMime(source.mimetype) ||
      source.mimetype!==copy.mimetype || !source.bytes.equals(copy.bytes))throw new Error('Photo copy hash, size or type mismatch');
    const after=await db.snapshot(newPaths);
    if(!same(before.objects,after.objects))throw new Error('Photo destination changed during verification');
    const meta=objectFor(after,m.new)?.metadata;
    if(Number(meta?.size)!==copy.bytes.length || meta?.mimetype!==copy.mimetype)throw new Error('Photo destination metadata mismatch');
    hashes.push({old:m.old,new:m.new,sha256:digest(copy.bytes),size:copy.bytes.length,mimetype:copy.mimetype,object:objectFor(after,m.new)});
  }
  if(!same(await db.snapshot(oldPaths),op.expected))throw new Error('Photo source changed during copy; abandon and replan');
  const final=await db.snapshot(newPaths);
  for(const h of hashes)if(!same(objectFor(final,h.new),h.absent?null:h.object))throw new Error('Photo destination changed after verification');
  return db.commit(id,{objects:final.objects,hashes});
}
export function operationSummary(op) {
  return {operationId:op.id,state:op.state,objects:op.expected.objects.filter(o=>o.object).length,
    references:op.expected.refs.length,retirementEnabled:false};
}
async function main(){
  const [command,id,path,...extra]=process.argv.slice(2);
  if(!['plan','resume','status','abandon'].includes(command) || !/^[0-9a-f-]{36}$/.test(id??'') || extra.length ||
    (command==='plan'?!path:!!path))throw new Error('Usage: photo-rekey.mjs plan UUID SOURCE_PATH | resume UUID | status UUID | abandon UUID');
  const db=psqlAdapter();let result;
  if(command==='plan')result=await db.plan(id,path);
  else if(command==='status')result=await db.get(id);
  else if(command==='abandon')result=await db.abandon(id);
  else result=await resumeRekey(db,storageAdapter(process.env.CELLARSNAP_REKEY_STORAGE_URL,process.env.CELLARSNAP_REKEY_SERVICE_KEY),id);
  console.log(JSON.stringify(operationSummary(result)));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{
  console.error('Photo rekey did not complete. Inspect status with the same operation ID; no retirement was attempted.');process.exitCode=1;
});
