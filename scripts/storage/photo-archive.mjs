// Operator-only preservation. This tool cannot delete sources or authorize
// retirement. "copied" is a timestamped observation, never a perpetual lease.
import { readFile, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as same } from 'node:util';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MAX_PHOTO_BYTES, operatorQuery, operatorLiteral as literal } from './photo-rekey.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hash = /^[a-f0-9]{64}$/;
const mime = value => /^image\/(jpeg|png|webp|gif|avif|heic|heif)$/.test(value);
export const ARCHIVE_BUCKET = 'photo-recovery-archive';

export function archiveDatabase(env = process.env) {
 const query = operatorQuery(env);
 return {
  plan: (id,path,receipt) => query(`select private.plan_photo_archive((${literal(id)}#>>'{}')::uuid,${literal(path)}#>>'{}',${literal(receipt)});`),
  get: id => query(`select to_jsonb(o) from private.photo_archive_operations o where id=(${literal(id)}#>>'{}')::uuid;`),
  snapshot: (path,dest) => query(`select private.photo_archive_snapshot(${literal(path)}#>>'{}',${literal(dest)}#>>'{}');`),
  commit: (id,proof) => query(`select private.commit_photo_archive((${literal(id)}#>>'{}')::uuid,${literal(proof)});`),
  abandon: id => query(`select private.abandon_photo_archive((${literal(id)}#>>'{}')::uuid);`),
 };
}

// Fixed cross-bucket copy endpoint; never move, upsert, remove or sign. Reject
// redirects and bound both network duration and streamed response bytes.
export function archiveStorage(url,key,fetcher=fetch) {
 const base=new URL(url);
 if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash||!key) throw Error('Explicit HTTPS Storage URL and service key required');
 const request=async(path,options={})=>{
  const response=await fetcher(new URL(path,base),{...options,redirect:'error',signal:AbortSignal.timeout(30000),
   headers:{apikey:key,Authorization:`Bearer ${key}`,...options.headers}});
  if(!response.ok){await response.body?.cancel();throw Error(`Archive Storage request failed (${response.status}); resume by operation ID`);}
  return response;
 };
 return {
  copy:async(source,dest)=>{
   const r=await request('/storage/v1/object/copy',{method:'POST',headers:{'Content-Type':'application/json','x-upsert':'false'},
    body:JSON.stringify({bucketId:'wine-photos',sourceKey:source,destinationBucket:ARCHIVE_BUCKET,destinationKey:dest})});
   await r.body?.cancel();
  },
  read:async(bucket,path)=>{
   if(!['wine-photos',ARCHIVE_BUCKET].includes(bucket))throw Error('Unsupported archive bucket');
   const r=await request(`/storage/v1/object/authenticated/${bucket}/`+path.split('/').map(encodeURIComponent).join('/'));
   const mimetype=r.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
   if(!mime(mimetype??'')||Number(r.headers.get('content-length'))>MAX_PHOTO_BYTES){await r.body?.cancel();throw Error('Invalid archive photo type or size');}
   const reader=r.body.getReader(),chunks=[];let size=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>MAX_PHOTO_BYTES)throw Error('Archive photo byte bound exceeded');chunks.push(Buffer.from(value));}}
   finally{await reader.cancel();reader.releaseLock();}
   if(!size)throw Error('Empty archive photo');
   return {bytes:Buffer.concat(chunks),mimetype};
  },
 };
}

export async function recoveryReceipt(report,backup,path,readRecovery) {
 if(report.version!==1||report.retirementAuthorized!==false||!Array.isArray(report.retained)||report.retained.length>10000||
  !Array.isArray(backup)||backup.length>10000||!hash.test(report.inventorySha256)||digest(Buffer.from(JSON.stringify(backup)))!==report.backupIndexSha256) throw Error('Invalid reconciliation provenance');
 const candidates=report.retained.filter(row=>row.path===path),files=backup.filter(row=>row.name===path);
 if(candidates.length!==1||files.length!==1)throw Error('Ambiguous or missing historical source');
 const candidate=candidates[0],file=files[0];
 if(candidate.classification!=='unreferenced-archive-review'||candidate.references?.length!==0||candidate.baseReferences?.length!==0||
  !uuid.test(file.id)||candidate.backupId!==file.id||candidate.objectId!==file.id||candidate.sha256!==file.sha256||candidate.bytes!==file.bytes||
  !hash.test(file.sha256)||!Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>MAX_PHOTO_BYTES)throw Error('Historical source is not eligible for preservation');
 const bytes=await readRecovery(file.id);
 if(bytes.length!==file.bytes||digest(bytes)!==file.sha256)throw Error('Recovery bytes changed');
 return {backup_id:file.id,size:file.bytes,sha256:file.sha256,inventory_sha256:report.inventorySha256,backup_index_sha256:report.backupIndexSha256};
}

export async function resumeArchive(db,storage,id) {
 const op=await db.get(id);
 if(!op||!['planned','copied'].includes(op.state))throw Error('Archive operation is not resumable');
 const snapshot=()=>db.snapshot(op.source_path,op.archive_path);
 const start=await snapshot();
 if(!start.protected||!same(start.source,op.expected)||start.source.refs.length)throw Error('Archive source or protection changed; review before resuming');
 // Even a previously copied operation revalidates bytes and metadata on resume.
 // Recover a successful copy after a lost response without overwriting it.
 if(!start.archive)await storage.copy(op.source_path,op.archive_path);
 const before=await snapshot();
 const source=await storage.read('wine-photos',op.source_path),copy=await storage.read(ARCHIVE_BUCKET,op.archive_path);
 if(source.bytes.length!==op.receipt.size||!mime(source.mimetype)||source.mimetype!==copy.mimetype||
  !source.bytes.equals(copy.bytes)||digest(copy.bytes)!==op.receipt.sha256)throw Error('Archive source/copy/recovery hash, size or type mismatch');
 const after=await snapshot();
 if(!after.protected||!same(after.source,op.expected)||!same(before.archive,after.archive))throw Error('Archive objects changed during verification');
 if(Number(after.archive?.metadata?.size)!==copy.bytes.length||after.archive?.metadata?.mimetype!==copy.mimetype)throw Error('Archive destination metadata mismatch');
 return db.commit(id,{object:after.archive,sha256:digest(copy.bytes),size:copy.bytes.length,mimetype:copy.mimetype});
}

export function archiveSummary(op) {
 if(!op)throw Error('Archive operation not found');
 return {operationId:op.id,state:op.state,bytes:op.receipt.size,verifiedAt:op.verified_at,retirementAuthorized:false};
}
async function boundedFile(path,max) {
 const info=await lstat(path);
 if(!info.isFile()||info.size>max)throw Error('Invalid or oversized archive input');
 return readFile(path);
}
async function main() {
 const [command,id,...args]=process.argv.slice(2);
 if(!['plan','resume','status','abandon'].includes(command)||!uuid.test(id??'')||args.length!==(command==='plan'?3:0))
  throw Error('Usage: photo-archive.mjs plan UUID RECONCILIATION_JSON BACKUP_DIRECTORY SOURCE_PATH | resume UUID | status UUID | abandon UUID');
 const db=archiveDatabase();let op;
 if(command==='plan'){
  const [report,backup,path]=args;
  const receipt=await recoveryReceipt(JSON.parse(await boundedFile(report,64*1024*1024)),JSON.parse(await boundedFile(join(backup,'hashes.json'),64*1024*1024)),path,
   id=>boundedFile(join(backup,'objects',id),MAX_PHOTO_BYTES));
  op=await db.plan(id,path,receipt);
 }else if(command==='resume')op=await resumeArchive(db,archiveStorage(process.env.CELLARSNAP_ARCHIVE_STORAGE_URL,process.env.CELLARSNAP_ARCHIVE_SERVICE_KEY),id);
 else op=await db[command==='status'?'get':'abandon'](id);
 console.log(JSON.stringify(archiveSummary(op)));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{
 console.error('Photo archival did not complete. Inspect status using the same operation ID; all source bytes remain untouched.');process.exitCode=1;
});
