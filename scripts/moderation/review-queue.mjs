// Database-owner moderation queue. Values are sent through psql stdin as encoded
// JSON literals; credentials, report text, and private diagnostics are not logged.
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_OUTPUT_BYTES = 256 * 1024;

export const operatorLiteral = (value) =>
  `convert_from(decode('${Buffer.from(JSON.stringify(value)).toString('hex')}','hex'),'UTF8')::jsonb`;

export function moderationQuery(env = process.env) {
  if (!env.PGHOST || !env.PGUSER || !env.PGDATABASE) {
    throw new Error('Explicit PGHOST/PGUSER/PGDATABASE required');
  }
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(env.PGHOST) &&
    !env.PGHOST.startsWith('/') &&
    env.PGSSLMODE !== 'verify-full'
  ) {
    throw new Error('Remote moderation database requires PGSSLMODE=verify-full');
  }

  return async (sql, { readOnly = false } = {}) => {
    const pgOptions = [
      '-c statement_timeout=15000',
      '-c lock_timeout=2000',
      '-c idle_in_transaction_session_timeout=15000',
      ...(readOnly ? ['-c default_transaction_read_only=on'] : []),
    ].join(' ');
    const child = spawn(
      env.CELLARSNAP_PSQL ?? 'psql',
      ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
      { env: { ...env, PGOPTIONS: pgOptions }, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    let output = '';
    let failed = false;
    const timer = setTimeout(() => {
      failed = true;
      child.kill('SIGKILL');
    }, 20_000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (Buffer.byteLength(output) > MAX_OUTPUT_BYTES) {
        failed = true;
        child.kill('SIGKILL');
      }
    });
    child.stderr.resume();
    child.stdin.on('error', () => {
      failed = true;
    });
    child.stdin.end(sql);
    try {
      await new Promise((accept, reject) => {
        child.once('error', () => reject(new Error('Moderation database client unavailable')));
        child.once('close', (code) =>
          code === 0 && !failed
            ? accept()
            : reject(new Error('Moderation queue operation failed; inspect private database diagnostics'))
        );
      });
      return JSON.parse(output.trim());
    } finally {
      clearTimeout(timer);
    }
  };
}

export const summarySql = `
select jsonb_build_object(
  'open', count(*) filter (where q.status='open'),
  'reviewing', count(*) filter (where q.status='reviewing'),
  'overdue', count(*) filter (where q.status in ('open','reviewing') and q.review_due_at < clock_timestamp()),
  'urgentUnclaimed', count(*) filter (
    where q.status='open' and q.priority='urgent' and q.assigned_to is null
      and q.created_at < clock_timestamp() - interval '15 minutes'
  ),
  'oldestOpenAgeSeconds', coalesce(max(extract(epoch from (clock_timestamp()-q.created_at)))
    filter (where q.status in ('open','reviewing')),0)::bigint
)
from private.content_report_reviews q;`;

export const listSql = `
select coalesce(jsonb_agg(row order by row->>'reviewDueAt',row->>'reportId'),'[]'::jsonb)
from (
  select jsonb_build_object(
    'queueId',q.id,
    'reportId',q.report_id,
    'targetType',q.target_type,
    'entryId',q.entry_id,
    'commentId',q.comment_id,
    'reason',q.reason,
    'status',q.status,
    'priority',q.priority,
    'createdAt',q.created_at,
    'reviewDueAt',q.review_due_at,
    'assignedTo',q.assigned_to
  ) row
  from private.content_report_reviews q
  where q.status in ('open','reviewing')
  order by q.review_due_at,q.id
  limit 100
) pending;`;

export function claimSql(reportId, assignee) {
  const id = operatorLiteral(reportId);
  const owner = operatorLiteral(assignee);
  return `begin;
with claimed as (
  update private.content_report_reviews q
  set status='reviewing',assigned_to=${owner}#>>'{}',review_started_at=coalesce(q.review_started_at,clock_timestamp()),updated_at=clock_timestamp()
  where (q.report_id=(${id}#>>'{}')::uuid or q.id=(${id}#>>'{}')::uuid)
    and q.status in ('open','reviewing') and q.reviewed_at is null
  returning q.id,q.report_id,q.status,q.assigned_to,q.review_due_at
), advanced as (
  update public.content_reports r set status='reviewing'
  from claimed c where r.id=c.report_id returning r.id
)
select coalesce((select jsonb_build_object('queueId',id,'reportId',report_id,'status',status,'assignedTo',assigned_to,'reviewDueAt',review_due_at) from claimed),'null'::jsonb);
commit;`;
}

export function resolveSql(reportId, outcome, assignee, notes) {
  const id = operatorLiteral(reportId);
  const status = operatorLiteral(outcome);
  const owner = operatorLiteral(assignee);
  const resolution = operatorLiteral(notes);
  return `begin;
with completed as (
  update private.content_report_reviews q
  set status=${status}#>>'{}',assigned_to=${owner}#>>'{}',review_started_at=coalesce(q.review_started_at,clock_timestamp()),
    reviewed_at=clock_timestamp(),resolution_notes=${resolution}#>>'{}',updated_at=clock_timestamp()
  where (q.report_id=(${id}#>>'{}')::uuid or q.id=(${id}#>>'{}')::uuid)
    and q.status in ('open','reviewing') and q.reviewed_at is null
  returning q.id,q.report_id,q.target_type,q.entry_id,q.comment_id,q.status,q.assigned_to,q.reviewed_at
), hidden_entry as (
  update public.wine_entries e set is_feed_visible=false,entry_privacy='private'
  from completed c where ${status}#>>'{}'='resolved' and c.target_type='entry' and e.id=c.entry_id
  returning e.id
), hidden_comment as (
  update public.entry_comments c set body='[deleted]',deleted_at=clock_timestamp(),updated_at=clock_timestamp()
  from completed done where ${status}#>>'{}'='resolved' and done.target_type='comment' and c.id=done.comment_id
  returning c.id
), closed as (
  update public.content_reports r set status=${status}#>>'{}'
  from completed c where r.id=c.report_id returning r.id
)
select coalesce((select jsonb_build_object('queueId',id,'reportId',report_id,'status',status,'assignedTo',assigned_to,'reviewedAt',reviewed_at) from completed),'null'::jsonb);
commit;`;
}

function validateAssignee(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9 ._@+-]{2,100}$/.test(value)) {
    throw new Error('Assignee must be a 2-100 character operator label');
  }
  return value;
}

async function main() {
  const [command = 'summary', ...args] = process.argv.slice(2);
  const query = moderationQuery();
  let result;
  if (command === 'summary' && args.length === 0) {
    result = await query(summarySql, { readOnly: true });
  } else if (command === 'list' && args.length === 0) {
    result = await query(listSql, { readOnly: true });
  } else if (command === 'assert-sla' && args.length === 0) {
    result = await query(summarySql, { readOnly: true });
    if (Number(result.overdue) > 0 || Number(result.urgentUnclaimed) > 0) process.exitCode = 2;
  } else if (command === 'claim' && args.length === 2 && UUID.test(args[0])) {
    result = await query(claimSql(args[0], validateAssignee(args[1])));
    if (result === null) throw new Error('Report is not claimable');
  } else if (
    command === 'resolve' &&
    args.length === 4 &&
    UUID.test(args[0]) &&
    ['resolved', 'dismissed'].includes(args[1])
  ) {
    const notesPath = resolve(args[3]);
    if ((await stat(notesPath)).size > 2000) throw new Error('Resolution notes exceed 2000 bytes');
    const notes = (await readFile(notesPath, 'utf8')).trim();
    if (!notes) throw new Error('Resolution notes are required');
    result = await query(resolveSql(args[0], args[1], validateAssignee(args[2]), notes));
    if (result === null) throw new Error('Report is not resolvable');
  } else {
    throw new Error('Usage: review-queue.mjs summary | list | assert-sla | claim UUID ASSIGNEE | resolve UUID resolved|dismissed ASSIGNEE NOTES_FILE');
  }
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
