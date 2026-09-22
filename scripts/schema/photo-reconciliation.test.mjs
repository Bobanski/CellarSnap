import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { reconcileHistoricalPhotos } from '../storage/reconcile-historical-photos.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const bytes=Buffer.from('photo');
const hash=createHash('sha256').update(bytes).digest('hex');
const file=(n,name)=>({id:id(n),name,bytes:bytes.length,sha256:hash});
const row=(path,object=null,references=[],original_of=null)=>({path,object,references,original_of});
const ref={table:'entry_photos',column:'path',row_id:id(9),owner_id:id(1)};
test('reconciliation separates historical cohorts, missing-base originals and new uploads without authorizing retirement',async()=>{
 const backup=[file(1,'owner/orphan.jpg'),file(2,'owner/missing__original.jpg'),file(3,'owner/retired.jpg')];
 const inventory={version:1,capturedAt:'2026-09-22',records:[
  row('owner/orphan.jpg',{id:id(1),size:5}),row('owner/missing.jpg',null,[ref]),
  row('owner/missing__original.jpg',{id:id(2),size:5},[],'owner/missing.jpg'),
  row('owner/lost.jpg',null,[ref]),row('owner/new.jpg',{id:id(4),size:5})]};
 const read=[]; const report=await reconcileHistoricalPhotos(inventory,backup,async id=>{read.push(id);return bytes;});
 assert.equal(read.length,3);assert.equal(report.retirementAuthorized,false);
 assert.deepEqual(report.summary.classifications,{'unreferenced-archive-review':1,'missing-base-recovery-review':1});
 assert.equal(report.summary.originalOnlyRecoveryCandidates,1);assert.equal(report.summary.noKnownBytes,1);
 assert.equal(report.retained.some(r=>r.path==='owner/new.jpg'),false);
 inventory.records[0].object.id=id(5);
 assert.equal((await reconcileHistoricalPhotos(inventory,backup,async()=>bytes)).summary.classifications['changed-object-review'],1);
});
test('corrupt, missing, duplicate and path-traversal backup records fail the complete reconciliation',async()=>{
 const inventory={version:1,records:[]};
 await assert.rejects(reconcileHistoricalPhotos(inventory,[file(1,'a')],async()=>Buffer.from('other')),/verification failed/);
 await assert.rejects(reconcileHistoricalPhotos(inventory,[file(1,'a')],async()=>{throw Error('missing')}),/missing/);
 for(const backup of [[file(1,'a'),file(2,'a')],[file(1,'a'),file(1,'b')],[{...file(1,'a'),id:'../secret'}],[{...file(1,'a'),bytes:Infinity}]]){
  await assert.rejects(reconcileHistoricalPhotos(inventory,backup,async()=>assert.fail()),/Invalid backup/);
 }
});
