// Operator-only read inventory. No app credentials inferred, writes or rekey actions.
import { spawn } from 'node:child_process';
import { readFile, open, link, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export const MAX_INVENTORY_ROWS = 10_000;
export const MAX_INVENTORY_BYTES = 64 * 1024 * 1024;
const rawPath = path => typeof path === 'string' && path.length > 0 && path.length <= 2048 && path !== 'pending' &&
  !/^[a-z][a-z0-9+.-]*:/i.test(path) && !/[\\\x00-\x1f\x7f]/.test(path) &&
  path.split('/').every(part => part && part !== '.' && part !== '..');
export function summarizeInventory(records) {
  if (records.length > MAX_INVENTORY_ROWS) throw new Error('Inventory row bound exceeded; no complete snapshot published');
  const paths = new Set();
  const summary = { paths: records.length, objects: 0, references: 0, missingReferencedObjects: 0,
    invalidReferences: 0, unreferencedObjects: 0, originals: 0, originalsWithoutBaseObject: 0,
    multiReferencePaths: 0, crossOwnerReferences: 0, referenceColumns: {} };
  const objectPaths = new Set(records.filter(r => r.object !== null).map(r => r.path));
  for (const r of records) {
    if (typeof r.path !== 'string' || paths.has(r.path) || !Array.isArray(r.references) ||
      (r.object !== null && (typeof r.object !== 'object' || typeof r.object.id !== 'string')) ||
      (r.original_of !== null && typeof r.original_of !== 'string')) throw new Error('Invalid inventory record');
    paths.add(r.path);
    if (r.object) summary.objects++;
    if (r.references.length && !r.object) summary.missingReferencedObjects++;
    if (r.references.length && !rawPath(r.path)) summary.invalidReferences++;
    if (r.object && !r.references.length && !r.original_of) summary.unreferencedObjects++;
    if (r.original_of) { summary.originals++; if (!objectPaths.has(r.original_of)) summary.originalsWithoutBaseObject++; }
    if (r.references.length > 1) summary.multiReferencePaths++;
    for (const ref of r.references) {
      if (!['table','column','row_id','owner_id'].every(k => typeof ref[k] === 'string')) throw new Error('Invalid reference');
      const key = ref.table + '.' + ref.column;
      summary.referenceColumns[key] = (summary.referenceColumns[key] ?? 0) + 1;
      summary.references++;
      if (rawPath(r.path) && r.path.split('/')[0] !== ref.owner_id) summary.crossOwnerReferences++;
    }
  }
  return summary;
}
export async function publishInventory(output, records) {
  const summary = summarizeInventory(records);
  const payload = JSON.stringify({ version: 1, capturedAt: new Date().toISOString(), summary, records }) + '\n';
  if (Buffer.byteLength(payload) > MAX_INVENTORY_BYTES) throw new Error('Inventory byte bound exceeded');
  const temp = `${output}.${randomUUID()}.partial`;
  try {
    const file = await open(temp, 'wx', 0o600);
    try { await file.writeFile(payload); await file.sync(); } finally { await file.close(); }
    // Exclusive atomic publication; refuse an existing destination or symlink.
    await link(temp, output);
  } finally { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  return { summary, sha256: createHash('sha256').update(payload).digest('hex') };
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output') throw new Error('Usage: node scripts/storage/photo-reference-inventory.mjs --output /private/path/inventory.json (explicit PGHOST/PGUSER/PGDATABASE required)');
  if (!process.env.PGHOST || !process.env.PGUSER || !process.env.PGDATABASE) throw new Error('Supply explicit libpq target; no project is inferred');
  const sql = await readFile(new URL('./photo-reference-inventory.sql', import.meta.url), 'utf8');
  const child = spawn(process.env.CELLARSNAP_PSQL ?? 'psql', ['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'], {
    env: { ...process.env, PGOPTIONS: `${process.env.PGOPTIONS ?? ''} -c default_transaction_read_only=on -c statement_timeout=30000` },
    stdio: ['pipe','pipe','pipe'],
  });
  let bytes = 0, output = '', failed = false;
  const timer = setTimeout(() => { failed = true; child.kill('SIGKILL'); }, 35_000);
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => { bytes += Buffer.byteLength(chunk); if (bytes > MAX_INVENTORY_BYTES) { failed = true; child.kill('SIGKILL'); } else output += chunk; });
  child.stderr.resume(); // Server diagnostics may contain host/user/reference values.
  child.stdin.on('error', () => { failed = true; });
  child.stdin.end(`begin isolation level repeatable read read only; ${sql}; commit;`);
  try {
    await new Promise((done, reject) => {
      child.once('error', () => reject(new Error('Inventory client could not start')));
      child.once('close', code => code === 0 && !failed ? done() : reject(new Error('Read-only inventory failed or exceeded bounds; no snapshot published')));
    });
  } finally { clearTimeout(timer); }
  let records;
  try { records = output.trim() ? output.trim().split('\n').map(line => JSON.parse(line)) : []; }
  catch { throw new Error('Invalid inventory response; no snapshot published'); }
  const result = await publishInventory(resolve(args[1]), records);
  console.log(JSON.stringify(result)); // Only sanitized aggregates and digest.
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
