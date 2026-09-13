import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { replay } from './contract.mjs';
import { summarizeInventory, publishInventory, MAX_INVENTORY_ROWS } from '../storage/photo-reference-inventory.mjs';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('inventory enumerates every canonical path, shared references, originals, missing/pending and unreferenced objects in a read-only snapshot', async()=>{
 const db=await replay();try{
  const owner=uid(1),other=uid(2),entry=uid(100),group=uid(200),collection=uid(300),path=`${owner}/${entry}/label/é.jpg`;
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[owner,'inventory1@example.invalid',other,'inventory2@example.invalid']);
  await db.query("insert into wine_entries(id,user_id,label_image_path,place_image_path,pairing_image_path) values($1,$2,$3,'pending',$4)",[entry,owner,path,`${owner}/missing.jpg`]);
  await db.query("insert into entry_photos(entry_id,path,type) values($1,$2,'label')",[entry,path]);
  await db.query("insert into entry_groups(id,user_id,mode,title,anchor_entry_id) values($1,$2,'event','Inventory',$3)",[group,owner,entry]);
  await db.query("insert into entry_group_slides(group_id,entry_id,photo_type,path,position) values($1,$2,'label',$3,0)",[group,entry,path]);
  await db.query('update profiles set avatar_path=$1 where id=$2',[path,owner]);
  await db.query("insert into user_collections(id,user_id,name,cover_image_path) values($1,$2,'Inventory',$3)",[collection,other,path]);
  await db.query('insert into user_collection_items(collection_id,user_id,entry_id,snapshot_label_image_path,snapshot_preview_image_path) values($1,$2,$3,$4,$4)',[collection,other,entry,path]);
  await db.exec("insert into storage.buckets(id,name) values('wine-photos','wine-photos')");
  for(const name of [path,path.replace('.jpg','__original.jpg'),`${owner}/orphan.jpg`,`${owner}/missing-base__original.jpg`]) await db.query("insert into storage.objects(bucket_id,name) values('wine-photos',$1)",[name]);
  await db.exec('begin read only');
  const rows=(await db.query(await readFile(new URL('../storage/photo-reference-inventory.sql',import.meta.url),'utf8'))).rows.map(r=>r.record);
  await db.exec('rollback');
  const summary=summarizeInventory(rows);
  assert.equal(summary.paths,6);assert.equal(summary.references,9);assert.equal(summary.objects,4);
  assert.equal(summary.missingReferencedObjects,2);assert.equal(summary.invalidReferences,1);
  assert.equal(summary.originals,2);assert.equal(summary.originalsWithoutBaseObject,1);assert.equal(summary.unreferencedObjects,1);
  assert.equal(summary.crossOwnerReferences,3);assert.equal(summary.multiReferencePaths,1);assert.equal(Object.keys(summary.referenceColumns).length,9);
  const canonical=rows.find(r=>r.path===path);assert.equal(canonical.references.length,7);
  assert.equal(rows.find(r=>r.original_of===path).references.length,0);
  // A newly introduced physical photo-path column cannot silently escape inventory coverage.
  const columns=(await db.query("select table_name||'.'||column_name key from information_schema.columns c join pg_class p on p.relname=c.table_name join pg_namespace n on n.oid=p.relnamespace and n.nspname=c.table_schema where table_schema='public' and p.relkind='r' and (column_name in ('path','avatar_path','cover_image_path') or column_name like '%image_path')")).rows.map(r=>r.key).sort();
  assert.deepEqual(Object.keys(summary.referenceColumns).sort(),columns);
 }finally{await db.close();}
});
test('snapshot publication is private, exclusive, complete and rejects oversized/duplicate inventories',async()=>{
 const root=await mkdtemp(join(tmpdir(),'photo-inventory-'));try{
  const out=join(root,'snapshot.json'),record={path:'owner/photo.jpg',object:null,references:[],original_of:null};
  const published=await publishInventory(out,[record]);assert.equal(published.summary.paths,1);assert.match(published.sha256,/^[a-f0-9]{64}$/);
  assert.equal((await stat(out)).mode & 0o777,0o600);const original=await readFile(out,'utf8');
  await assert.rejects(publishInventory(out,[]),{code:'EEXIST'});assert.equal(await readFile(out,'utf8'),original);
  assert.throws(()=>summarizeInventory(Array(MAX_INVENTORY_ROWS+1).fill(record)),/bound exceeded/);
  assert.throws(()=>summarizeInventory([record,record]),/Invalid inventory/);
 }finally{await rm(root,{recursive:true,force:true});}
});
