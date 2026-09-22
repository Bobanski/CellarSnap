// Read-only reconciliation. This report is evidence, never a deletion manifest.
import { readFile, open, lstat, link, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { summarizeInventory, MAX_INVENTORY_BYTES } from './photo-reference-inventory.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hash = /^[0-9a-f]{64}$/;
export async function reconcileHistoricalPhotos(inventory, backup, readBackupObject) {
  if (inventory.version !== 1 || !Array.isArray(backup) || backup.length > 10000) throw Error('Invalid reconciliation input');
  summarizeInventory(inventory.records);
  const current = new Map(inventory.records.map(row => [row.path, row]));
  const byName = new Map(), ids = new Set();
  let backupBytes = 0;
  for (const file of backup) {
    if (!uuid.test(file.id) || typeof file.name !== 'string' || byName.has(file.name) || ids.has(file.id) ||
      !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > 25*1024*1024 || !hash.test(file.sha256)) throw Error('Invalid backup index');
    byName.set(file.name, file); ids.add(file.id);
  }
  // Verify every indexed file, not just the candidate subset. Fail the entire
  // report if recovery bytes have gone missing or changed since the prior release.
  for (const file of backup) {
    const bytes = await readBackupObject(file.id);
    if (bytes.length !== file.bytes || digest(bytes) !== file.sha256) throw Error('Recovery archive verification failed');
    backupBytes += bytes.length;
  }
  const retained = inventory.records.filter(row => row.object && byName.has(row.path)).map(row => {
    const file = byName.get(row.path);
    const sameObject = file.id === row.object.id && Number(row.object.size) === file.bytes;
    const base = row.original_of ? current.get(row.original_of) : row;
    return { path: row.path, objectId: row.object.id, backupId: file.id, bytes: file.bytes, sha256: file.sha256,
      classification: !sameObject ? 'changed-object-review' : row.references.length ? 'referenced-review' :
        row.original_of && base?.references.length ? 'missing-base-recovery-review' : 'unreferenced-archive-review',
      references: row.references, originalOf: row.original_of,
      baseReferences: row.original_of ? base?.references ?? [] : [],
      // Prefixes and original suffixes are hints, not proof of ownership or crop equivalence.
      ownerHint: uuid.test(row.path.split('/')[0]) ? row.path.split('/')[0] : null };
  });
  const missing = inventory.records.filter(row => !row.object && row.references.length).map(row => {
    const original = inventory.records.find(candidate => candidate.original_of === row.path && candidate.object);
    return { path: row.path, references: row.references,
      backupBase: byName.get(row.path)?.id ?? null,
      originalPath: original?.path ?? null,
      disposition: byName.has(row.path) ? 'exact-backup-recovery-review' : original ? 'original-only-review' : 'no-known-bytes' };
  });
  const counts = key => Object.fromEntries([...new Set(retained.map(row => row[key]))].map(value => [value, retained.filter(row => row[key] === value).length]));
  return { version: 1, capturedAt: inventory.capturedAt, generatedAt: new Date().toISOString(),
    inventorySha256: digest(Buffer.from(JSON.stringify(inventory))), backupIndexSha256: digest(Buffer.from(JSON.stringify(backup))),
    summary: { currentObjects: inventory.records.filter(row => row.object).length, verifiedBackupObjects: backup.length,
      verifiedBackupBytes: backupBytes, retainedHistoricalObjects: retained.length,
      retainedHistoricalBytes: retained.reduce((sum,row) => sum + row.bytes,0), classifications: counts('classification'),
      missingReferences: missing.length, originalOnlyRecoveryCandidates: missing.filter(row=>row.disposition==='original-only-review').length,
      noKnownBytes: missing.filter(row=>row.disposition==='no-known-bytes').length },
    retained, missing, retirementAuthorized: false };
}
async function readBoundedJson(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.size > MAX_INVENTORY_BYTES) throw Error('Invalid or oversized input file');
  return JSON.parse(await readFile(path,'utf8'));
}
async function main() {
  const [inventoryPath, backupDirectory, output, ...extra] = process.argv.slice(2);
  if (!inventoryPath || !backupDirectory || !output || extra.length) throw Error('Usage: reconcile-historical-photos.mjs INVENTORY_JSON BACKUP_DIRECTORY PRIVATE_OUTPUT_JSON');
  const report = await reconcileHistoricalPhotos(await readBoundedJson(inventoryPath),
    await readBoundedJson(join(backupDirectory,'hashes.json')), async id => {
      const path=join(backupDirectory,'objects',id), info=await lstat(path);
      if (!info.isFile() || info.size > 25*1024*1024) throw Error('Invalid recovery object');
      return readFile(path);
    });
  const temporary = `${output}.${randomUUID()}.partial`;
  try {
    const file=await open(temporary,'wx',0o600);
    try { await file.writeFile(JSON.stringify(report)+'\n'); await file.sync(); } finally { await file.close(); }
    await link(temporary,output);
  } finally { await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;}); }
  console.log(JSON.stringify(report.summary));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(()=>{
  console.error('Historical reconciliation failed; no complete report published. Check private input files and recovery archive.');process.exitCode=1;
});
