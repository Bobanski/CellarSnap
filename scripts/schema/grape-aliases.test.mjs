import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {replay} from './contract.mjs';
import {aliasSeedRows,normalizeAlias,renderAliasSeed} from '../reference/grape-alias-seed.mjs';
const rows=JSON.parse(await readFile(new URL('../../supabase/reference/grape-aliases.json',import.meta.url),'utf8'));
const repair=await readFile(new URL('../../supabase/sql/20260913075619_repair_grape_alias_keys.sql',import.meta.url),'utf8');
async function fixture(historical=true) {
 const db=await replay();
 for(const row of new Map(rows.map(r=>[r.variety_slug,r])).values()) await db.query('insert into grape_varieties(slug,name) values($1,$2)',[row.variety_slug,row.variety_name]);
 if(historical) for(const row of rows) await db.query("insert into grape_aliases(variety_id,alias,alias_normalized) select id,$2,lower(trim(regexp_replace($2,'[^a-z0-9]+',' ','g'))) from grape_varieties where slug=$1",[row.variety_slug,row.alias]);
 return db;
}
test('historical repair retains canonical references and alias timestamps, consolidates only equivalent spelling, and is repeatable',async()=>{
 const db=await fixture();try {
 const before=(await db.query('select id,variety_id,alias,created_at from grape_aliases order by id')).rows;
 const varieties=(await db.query('select id,slug,name from grape_varieties order by id')).rows;
 await db.exec(repair);
 const after=(await db.query('select id,variety_id,alias,created_at from grape_aliases order by id')).rows;
 assert.equal(before.length,131);assert.equal(after.length,130);
 assert.deepEqual(after,before.filter(r=>r.alias!=='Xarel Lo'));
 assert.deepEqual((await db.query('select id,slug,name from grape_varieties order by id')).rows,varieties);
 for(const [key,name] of [['shiraz','Syrah'],['px','Pedro Ximenez'],['cab sauv','Cabernet Sauvignon'],['xarel lo','Xarel-lo']]) {
  assert.equal((await db.query('select v.name from grape_aliases a join grape_varieties v on v.id=a.variety_id where alias_normalized=$1',[key])).rows[0].name,name);
 }
 await db.exec(repair);
 assert.deepEqual((await db.query('select id,variety_id,alias,created_at from grape_aliases order by id')).rows,after);
 }finally{await db.close();}
});
test('repair rejects cross-variety collisions and unexpected/non-ASCII keys without partial changes',async()=>{
 for(const [alias,key,message] of [['SHIRAZ','shiraz',/cross-variety/],['new alias','custom-key',/unexpected/],['Albariño','albari o',/non-ASCII/]]){
 const db=await fixture();try {
 await db.query("insert into grape_aliases(variety_id,alias,alias_normalized) select id,$1,$2 from grape_varieties where slug='merlot'",[alias,key]);
 const before=(await db.query('select * from grape_aliases order by id')).rows;
 await assert.rejects(db.exec(repair),message);await db.exec('rollback');
 assert.deepEqual((await db.query('select * from grape_aliases order by id')).rows,before);
 }finally{await db.close();}
 }
});
test('fresh alias seed uses the same reviewed lookup keys, is repeatable and rejects conflicting ownership',async()=>{
 const db=await fixture(false);try{
 const seed=renderAliasSeed(rows);await db.exec(seed);await db.exec(seed);
 const data=(await db.query('select alias,alias_normalized from grape_aliases')).rows;
 assert.equal(data.length,130);for(const row of data)assert.equal(row.alias_normalized,normalizeAlias(row.alias));
 await db.exec("update grape_aliases set variety_id=(select id from grape_varieties where slug='merlot') where alias_normalized='shiraz'");
 await assert.rejects(db.exec(seed),/Cross-variety/);await db.exec('rollback');
 }finally{await db.close();}
 assert.equal(aliasSeedRows(rows).length,130);
 for(const [value,key] of [['SHIRAZ','shiraz'],['  Cab-Sauv  ','cab sauv'],["Nero d'Avola",'nero d avola'],['PX','px']])assert.equal(normalizeAlias(value),key);
 assert.throws(()=>normalizeAlias('Albariño'),/non-ASCII/);assert.throws(()=>normalizeAlias('!!!'),/Empty/);
 assert.throws(()=>aliasSeedRows([...rows,{variety_slug:'merlot',variety_name:'Merlot',alias:'SHIRAZ'}]),/Cross-variety/);
});
