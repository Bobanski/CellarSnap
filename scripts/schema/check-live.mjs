// Read-only structural drift check. Supply standard libpq PG* environment variables.
// No project credentials or target are inferred, and no SQL from argv is accepted.
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { canonical, differences, expectedCatalog } from './contract.mjs';

const sql = await readFile(new URL('./catalog.sql', import.meta.url), 'utf8');
const result = spawnSync(process.env.CELLARSNAP_PSQL ?? 'psql', ['-X','-A','-t','-v','ON_ERROR_STOP=1'], {
  input:`begin read only; set local search_path=public; ${sql}; rollback;`,
  env:{...process.env,PGOPTIONS:`${process.env.PGOPTIONS ?? ''} -c default_transaction_read_only=on -c statement_timeout=30000`},
  encoding:'utf8',maxBuffer:10*1024*1024,
});
// Do not print connection details or server error text, which may contain a host/user.
if(result.error || result.status) throw new Error('Read-only catalog query failed; verify the supplied libpq connection and psql executable.');
const line=result.stdout.split('\n').find(line=>line.startsWith('{'));
if(!line) throw new Error('Catalog response missing');
const changed=differences(await expectedCatalog(), canonical(JSON.parse(line)));
console.log(JSON.stringify({matches:changed.length===0,changedCategories:changed}));
if(changed.length) process.exitCode=1;
