import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';

// Sort catalog collections independently of host collation and JSON key order.
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k,canonical(value[k])]));
  return value;
}
export const baselineFile = name => readFile(new URL(`../../supabase/baseline/${name}`, import.meta.url), 'utf8');
export async function catalog(db) {
  await db.exec('set search_path=public');
  const result = await db.query(await readFile(new URL('./catalog.sql',import.meta.url),'utf8'));
  return canonical(result.rows[0].catalog);
}
export async function replay() {
  const db = new PGlite({extensions:{vector}});
  try {
    await db.exec(await baselineFile('auth.fixture.sql'));
    // pg_dump emits CREATE SCHEMA public, but PostgreSQL initializes it already.
    // Create vector first (schema-filtered dumps omit extension-owned objects).
    await db.exec('create extension vector');
    const sql=await baselineFile('app.sql');
    if(sql.split('CREATE SCHEMA public;').length!==2) throw new Error('Unexpected public schema declaration');
    await db.exec(sql.replace('CREATE SCHEMA public;',''));
    await db.exec('set search_path=public');
    await db.exec(await baselineFile('auth-hooks.sql'));
    await db.exec(await baselineFile('managed-storage.fixture.sql'));
    for (const migration of await forwardSql()) await db.exec(migration);
    await db.exec('set row_security=on; set check_function_bodies=on; set search_path=public');
    return db;
  } catch(error) { await db.close(); throw error; }
}
export async function expectedCatalog() {
  const expected = JSON.parse(await baselineFile('catalog.json'));
  // Reviewed B06b delta; retain the immutable B05b production capture and
  // compare every other object without automatically trusting replay output.
  expected.grants = expected.grants.filter(g => g.object !== 'user_badges' ||
    !['PUBLIC','anon','authenticated'].includes(g.grantee) ||
    (g.grantee === 'authenticated' && g.privilege_type === 'SELECT'));
  expected.policies = expected.policies.filter(p => !(p.schemaname === 'public' &&
    p.tablename === 'user_badges' && p.policyname === 'Users can insert own badges'));
  // Reviewed B06e additions: two private trigger functions, owner-only EXECUTE,
  // and two triggers. Keep this captured delta independent of replay output.
  const featuredDelta = JSON.parse(await readFile(new URL('./b06e-catalog-delta.json', import.meta.url), 'utf8'));
  for (const [key, rows] of Object.entries(featuredDelta)) expected[key].push(...rows);
  // Reviewed B02c2 delta: only the public-profile view/grants and its explicit
  // private projection reader. Exact removals keep unexpected drift visible.
  const profileDelta = JSON.parse(await readFile(new URL('./b02c2-catalog-delta.json', import.meta.url), 'utf8'));
  for (const [key, {add, remove}] of Object.entries(profileDelta)) {
    for (const row of remove) {
      const index = expected[key].findIndex(candidate => JSON.stringify(canonical(candidate)) === JSON.stringify(canonical(row)));
      if (index < 0) throw new Error(`Missing reviewed B02c2 predecessor in ${key}`);
      expected[key].splice(index, 1);
    }
    expected[key].push(...add);
  }
  return canonical(expected);
}
export function differences(expected, actual) {
  return [...new Set([...Object.keys(expected),...Object.keys(actual)])].filter(key => JSON.stringify(expected[key])!==JSON.stringify(actual[key]));
}

export async function forwardSql() {
  const result=[];
    // Historical files stay evidence. Only append-only migrations after the captured
    // cutoff are replayed; changing/reordering an archived script fails closed.
    const provenance=JSON.parse(await baselineFile('provenance.json'));
    const manifest=(await readFile(new URL('../../supabase/sql/manifest.txt',import.meta.url),'utf8')).trim().split('\n');
    for (const [index,entry] of provenance.historicalManifest.entries()) {
      if(manifest[index]!==entry.file) throw new Error('Historical manifest order changed');
      const bytes=await readFile(new URL(`../../supabase/sql/${entry.file}`,import.meta.url));
      if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256) throw new Error(`Historical SQL changed: ${entry.file}`);
    }
    for (const file of manifest.slice(provenance.historicalManifest.length)) {
      if(!/^[a-zA-Z0-9_]+\.sql$/.test(file)) throw new Error('Invalid forward migration filename');
      result.push(await readFile(new URL(`../../supabase/sql/${file}`,import.meta.url),'utf8'));
    }
  return result;
}
