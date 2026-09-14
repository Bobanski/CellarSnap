import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import {expectedCatalog} from './contract.mjs';

const root=new URL('../../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const hash=text=>createHash('sha256').update(text).digest('hex');
const members=node=>new Map(node.members.map(m=>[m.name.text,m]));

test('generated source is tied to the reviewed schema and unmodified CLI output',async()=>{
  const meta=JSON.parse(await read('supabase/baseline/type-source.json'));
  assert.equal(hash(await read('supabase/baseline/catalog.json')),meta.catalogSha256);
  assert.equal(hash(await read('packages/shared/src/database.types.ts')),meta.typesSha256);
});

test('all generated table rows and insert requirements agree with the reviewed catalog',async()=>{
  const source=await read('packages/shared/src/database.types.ts');
  const ast=ts.createSourceFile('database.types.ts',source,ts.ScriptTarget.Latest,true);
  const database=ast.statements.find(n=>ts.isTypeAliasDeclaration(n) && n.name.text==='Database');
  const publicSchema=members(database.type).get('public').type;
  const tables=members(members(publicSchema).get('Tables').type);
  const catalog=await expectedCatalog();
  const expected=catalog.relations.filter(r=>r.schema_name==='public' && ['r','p'].includes(r.kind)).map(r=>r.name).sort();
  assert.deepEqual([...tables.keys()].sort(),expected);
  for (const [table,node] of tables) {
    const types=members(node.type);
    const row=members(types.get('Row').type),insert=members(types.get('Insert').type),update=members(types.get('Update').type);
    const columns=catalog.columns.filter(c=>c.table_name===table);
    assert.deepEqual([...row.keys()].sort(),columns.map(c=>c.name).sort(),table);
    assert.deepEqual([...insert.keys()].sort(),[...row.keys()].sort(),table+' insert');
    assert.deepEqual([...update.keys()].sort(),[...row.keys()].sort(),table+' update');
    for (const column of columns) {
      const label=table+'.'+column.name;
      const typeText=row.get(column.name).type.getText(ast);
      assert.equal(/\bnull\b/.test(typeText),!column.not_null,label+' nullability');
      assert.equal(Boolean(insert.get(column.name).questionToken),!column.not_null || column.default_expression!==null || Boolean(column.identity) || Boolean(column.generated),label+' insert required');
      assert(update.get(column.name).questionToken,label+' update optional');
    }
  }
});
