import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { replay } from './contract.mjs';
import { resolveSql } from '../moderation/review-queue.mjs';

const owner = '00000000-0000-4000-8000-000000000061';
const reporter = '00000000-0000-4000-8000-000000000062';
const thirdParty = '00000000-0000-4000-8000-000000000063';
const publicEntry = '00000000-0000-4000-8000-000000000071';
const privateEntry = '00000000-0000-4000-8000-000000000072';

async function fixture() {
  const db = await replay();
  await db.query(
    `insert into auth.users(id,email) values
      ($1,'moderation-owner@example.invalid'),
      ($2,'moderation-reporter@example.invalid'),
      ($3,'moderation-third@example.invalid')`,
    [owner, reporter, thirdParty]
  );
  await db.query(
    `insert into public.wine_entries
      (id,user_id,wine_name,vintage,notes,entry_privacy,is_feed_visible)
     values
      ($1,$3,'Clean shared wine','2020','Black cherry, killer acidity, and a die-cut label.','public',true),
      ($2,$3,'Private cellar wine','2021','Private working note.','private',true)`,
    [publicEntry, privateEntry, owner]
  );
  return db;
}

async function authenticate(db, userId) {
  await db.exec('reset role; set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
}

test('UGC moderation rejects high-confidence evasions but preserves wine-language false positives', async () => {
  const db = await fixture();
  try {
    await authenticate(db, reporter);
    await db.query(
      `insert into public.entry_comments(entry_id,user_id,body)
       values($1,$2,'Killer Cabernet: black cherry, rich body, and a die-cut label.')`,
      [publicEntry, reporter]
    );

    for (const blocked of [
      'Go k1ll yourself',
      'I will sh00t you',
      'That hateful f@ggot remark',
      'They are sharing child pornography',
    ]) {
      await assert.rejects(
        db.query(
          `insert into public.entry_comments(entry_id,user_id,body) values($1,$2,$3)`,
          [publicEntry, reporter, blocked]
        ),
        /cannot be shared because it may violate the community guidelines/i
      );
    }

    await authenticate(db, owner);
    await assert.rejects(
      db.query(`update public.wine_entries set notes='I will stab them' where id=$1`, [publicEntry]),
      /cannot be shared/i
    );
    await assert.rejects(
      db.query(`update public.wine_entries set wine_name='Go kill yourself' where id=$1`, [publicEntry]),
      /cannot be shared/i
    );
    await assert.rejects(
      db.query(`update public.wine_entries set vintage='I will shoot you' where id=$1`, [publicEntry]),
      /cannot be shared/i
    );
  } finally {
    await db.close();
  }
});

test('private cellar notes are not screened until the same entry becomes shared', async () => {
  const db = await fixture();
  try {
    await authenticate(db, owner);
    await db.query(`update public.wine_entries set notes='Go kill yourself' where id=$1`, [privateEntry]);
    await assert.rejects(
      db.query(`update public.wine_entries set entry_privacy='friends' where id=$1`, [privateEntry]),
      /cannot be shared/i
    );
    await db.query(
      `update public.wine_entries set notes='Black fruit and firm tannin',entry_privacy='friends' where id=$1`,
      [privateEntry]
    );
  } finally {
    await db.close();
  }
});

test('group publication screens its title and hidden member metadata, including later edits', async () => {
  const db = await fixture();
  const groupId = '00000000-0000-4000-8000-000000000073';
  const memberId = '00000000-0000-4000-8000-000000000074';
  const transitionGroupId = '00000000-0000-4000-8000-000000000075';
  try {
    await authenticate(db, owner);
    await db.query(
      `insert into public.entry_groups(id,user_id,title,anchor_entry_id)
       values($1,$2,'Go kill yourself',$3)`,
      [transitionGroupId, owner, publicEntry]
    );
    await assert.rejects(
      db.query(`update public.wine_entries set entry_group_id=$1 where id=$2`, [transitionGroupId, publicEntry]),
      /cannot be shared/i
    );
    await db.query(`delete from public.entry_groups where id=$1`, [transitionGroupId]);
    await db.query(`update public.wine_entries set is_feed_visible=false where id=$1`, [publicEntry]);
    await db.query(
      `insert into public.entry_groups(id,user_id,title) values($1,$2,'Friday tasting')`,
      [groupId, owner]
    );
    await db.query(
      `insert into public.wine_entries
        (id,user_id,wine_name,vintage,notes,entry_privacy,is_feed_visible,entry_group_id)
       values($1,$2,'Hidden member','2021','Clean member note','public',false,$3)`,
      [memberId, owner, groupId]
    );
    await db.query(`update public.wine_entries set entry_group_id=$1 where id=$2`, [groupId, publicEntry]);
    await db.query(`update public.entry_groups set anchor_entry_id=$1 where id=$2`, [publicEntry, groupId]);

    await db.query(`update public.wine_entries set notes='Go kill yourself' where id=$1`, [memberId]);
    await assert.rejects(
      db.query(`update public.wine_entries set is_feed_visible=true where id=$1`, [publicEntry]),
      /cannot be shared/i
    );

    await db.query(`update public.wine_entries set notes='Clean member note' where id=$1`, [memberId]);
    await db.query(`update public.wine_entries set is_feed_visible=true where id=$1`, [publicEntry]);
    await assert.rejects(
      db.query(`update public.wine_entries set producer='I will shoot you' where id=$1`, [memberId]),
      /cannot be shared/i
    );
    await assert.rejects(
      db.query(`update public.entry_groups set title='Go kill yourself' where id=$1`, [groupId]),
      /cannot be shared/i
    );

    await authenticate(db, reporter);
    await db.query(
      `insert into public.content_reports
        (reporter_id,target_type,entry_id,target_user_id,reason)
       values($1,'entry',$2,$3,'other')`,
      [reporter, publicEntry, owner]
    );
    await db.exec('reset role');
    const snapshot = (await db.query(
      `select content_snapshot->>'groupTitle' as group_title,
        content_snapshot->'groupEntries' @> $1::jsonb as includes_member
       from private.content_report_reviews where entry_id=$2`,
      [JSON.stringify([{ id: memberId, wineName: 'Hidden member', vintage: '2021', notes: 'Clean member note' }]), publicEntry]
    )).rows[0];
    assert.deepEqual(snapshot, { group_title: 'Friday tasting', includes_member: true });

    await authenticate(db, reporter);
    await db.query(
      `insert into public.content_reports
        (reporter_id,target_type,entry_id,target_user_id,reason)
       values($1,'entry',$2,$3,'other')`,
      [reporter, memberId, owner]
    );
    await db.exec('reset role');
    const memberReportId = (await db.query(
      `select id from public.content_reports where reporter_id=$1 and entry_id=$2`,
      [reporter, memberId]
    )).rows[0].id;
    await db.exec(resolveSql(memberReportId, 'resolved', 'moderation-on-call', 'Confirmed member violation.'));
    assert.deepEqual((await db.query(
      `select member.entry_privacy::text as member_privacy,member.is_feed_visible as member_visible,
        anchor.is_feed_visible as anchor_visible
       from public.wine_entries member
       join public.wine_entries anchor on anchor.id=$2
       where member.id=$1`,
      [memberId, publicEntry]
    )).rows[0], {
      member_privacy: 'private',
      member_visible: false,
      anchor_visible: true,
    });
    await authenticate(db, owner);
    await assert.rejects(
      db.query(`update public.wine_entries set entry_privacy='public' where id=$1`, [memberId]),
      /removed for a community-guidelines violation cannot be restored/i
    );

    await db.exec('reset role');
    const anchorReportId = (await db.query(
      `select id from public.content_reports where reporter_id=$1 and entry_id=$2`,
      [reporter, publicEntry]
    )).rows[0].id;
    await db.exec(resolveSql(anchorReportId, 'resolved', 'moderation-on-call', 'Confirmed group violation.'));
    await authenticate(db, owner);
    await assert.rejects(
      db.query(`update public.entry_groups set title='Renamed tasting' where id=$1`, [groupId]),
      /removed for a community-guidelines violation cannot be restored/i
    );
  } finally {
    await db.close();
  }
});

test('reports derive the target owner, reset workflow fields, and receive risk-based deadlines', async () => {
  const db = await fixture();
  try {
    await authenticate(db, reporter);
    await db.query(
      `insert into public.content_reports
        (reporter_id,target_type,entry_id,target_user_id,reason,status,created_at)
       values($1,'entry',$2,$3,'hate','resolved','2001-01-01T00:00:00Z')`,
      [reporter, publicEntry, thirdParty]
    );

    await db.exec('reset role');
    const report = (await db.query(
      `select r.target_user_id,r.status,r.created_at > '2026-01-01T00:00:00Z' as server_created,
        q.priority,q.assigned_to,q.review_started_at,q.reviewed_at,
        q.resolution_notes,extract(epoch from (q.review_due_at-r.created_at))::int as due_seconds
       from public.content_reports r
       join private.content_report_reviews q on q.report_id=r.id
       where r.reporter_id=$1 and r.entry_id=$2`,
      [reporter, publicEntry]
    )).rows[0];
    assert.deepEqual(report, {
      target_user_id: owner,
      status: 'open',
      server_created: true,
      priority: 'urgent',
      assigned_to: null,
      review_started_at: null,
      reviewed_at: null,
      resolution_notes: null,
      due_seconds: 14400,
    });

    const reportId = (await db.query(
      `select id from public.content_reports where reporter_id=$1 and entry_id=$2`,
      [reporter, publicEntry]
    )).rows[0].id;
    await db.exec(resolveSql(reportId, 'resolved', 'moderation-on-call', 'Confirmed policy violation.'));
    assert.equal(Number((await db.query(
      `select count(*) as count from private.content_moderation_enforcements
       where entry_id=$1 and active`,
      [publicEntry]
    )).rows[0].count), 1);
    await authenticate(db, owner);
    await assert.rejects(
      db.query(
        `update public.wine_entries set entry_privacy='public',is_feed_visible=true where id=$1`,
        [publicEntry]
      ),
      /removed for a community-guidelines violation cannot be restored/i
    );

    await authenticate(db, reporter);
    await assert.rejects(
      db.query(`select assigned_to from private.content_report_reviews`),
      /permission denied/i
    );
    await assert.rejects(
      db.query(`select * from private.content_moderation_enforcements`),
      /permission denied/i
    );
  } finally {
    await db.close();
  }
});

test('comment reports bind the canonical entry/author and unavailable targets fail closed', async () => {
  const db = await fixture();
  try {
    await authenticate(db, owner);
    const commentId = '00000000-0000-4000-8000-000000000091';
    await db.query(
      `insert into public.entry_comments(id,entry_id,user_id,body) values($1,$2,$3,'Ordinary comment')`,
      [commentId, publicEntry, owner]
    );

    await authenticate(db, reporter);
    await db.query(
      `insert into public.content_reports
        (reporter_id,target_type,entry_id,comment_id,target_user_id,reason)
       values($1,'comment',$2,$3,$4,'spam')`,
      [reporter, privateEntry, commentId, thirdParty]
    );
    await db.exec('reset role');
    const report = (await db.query(
      `select r.entry_id,r.target_user_id,q.priority,
        extract(epoch from (q.review_due_at-r.created_at))::int as due_seconds
       from public.content_reports r
       join private.content_report_reviews q on q.report_id=r.id
       where r.reporter_id=$1 and r.comment_id=$2`,
      [reporter, commentId]
    )).rows[0];
    assert.deepEqual(report, {
      entry_id: publicEntry,
      target_user_id: owner,
      priority: 'standard',
      due_seconds: 86400,
    });

    await authenticate(db, reporter);
    await assert.rejects(
      db.query(
        `insert into public.content_reports
          (reporter_id,target_type,entry_id,target_user_id,reason)
         values($1,'entry',$2,$3,'spam')`,
        [reporter, privateEntry, owner]
      ),
      /unavailable/i
    );
    await assert.rejects(
      db.query(`select * from private.content_moderation_patterns`),
      /permission denied/i
    );
    await assert.rejects(
      db.query(`select private.assert_shareable_text('ordinary')`),
      /permission denied/i
    );

    await db.exec('reset role');
    const storedReportId = (await db.query(
      `select id from public.content_reports where reporter_id=$1 and comment_id=$2`,
      [reporter, commentId]
    )).rows[0].id;
    await db.exec(resolveSql(storedReportId, 'resolved', 'moderation-on-call', 'Confirmed policy violation.'));
    assert.deepEqual((await db.query(
      `select r.status,q.status as queue_status,q.reviewed_at is not null as reviewed,
        c.body,c.deleted_at is not null as deleted
       from public.content_reports r
       join private.content_report_reviews q on q.report_id=r.id
       join public.entry_comments c on c.id=q.comment_id
       where r.id=$1`,
      [storedReportId]
    )).rows[0], {
      status: 'resolved',
      queue_status: 'resolved',
      reviewed: true,
      body: '[deleted]',
      deleted: true,
    });

    await authenticate(db, owner);
    await assert.rejects(
      db.query(
        `update public.entry_comments set body='Restored comment',deleted_at=null where id=$1`,
        [commentId]
      ),
      /removed for a community-guidelines violation cannot be restored/i
    );
  } finally {
    await db.close();
  }
});

test('private evidence survives deletion of the public report receipt', async () => {
  const db = await fixture();
  try {
    await authenticate(db, reporter);
    await db.query(
      `insert into public.content_reports
        (reporter_id,target_type,entry_id,target_user_id,reason,details)
       values($1,'entry',$2,$3,'other','Needs contextual review')`,
      [reporter, publicEntry, thirdParty]
    );
    await db.exec('reset role');
    const reportId = (await db.query(
      `select id from public.content_reports where reporter_id=$1 and entry_id=$2`,
      [reporter, publicEntry]
    )).rows[0].id;
    await db.query(`delete from public.content_reports where id=$1`, [reportId]);
    const queue = (await db.query(
      `select report_id,status,reason,details,
        content_snapshot->>'wineName' as wine_name,
        content_snapshot->>'notes' as notes
       from private.content_report_reviews where entry_id=$1`,
      [publicEntry]
    )).rows[0];
    assert.deepEqual(queue, {
      report_id: null,
      status: 'open',
      reason: 'other',
      details: 'Needs contextual review',
      wine_name: 'Clean shared wine',
      notes: 'Black cherry, killer acidity, and a die-cut label.',
    });
  } finally {
    await db.close();
  }
});

test('migration backfill canonicalizes and queues active pre-trigger reports', async () => {
  const db = await fixture();
  try {
    await db.exec(`alter table public.content_reports disable trigger prepare_content_report;
      alter table public.content_reports disable trigger enqueue_content_report_review;`);
    const oldReport = '00000000-0000-4000-8000-000000000099';
    const orphanReport = '00000000-0000-4000-8000-000000000098';
    const missingEntry = '00000000-0000-4000-8000-000000000097';
    await db.exec(`alter table public.content_reports drop constraint content_reports_entry_id_fkey`);
    await db.query(
      `insert into public.content_reports
        (id,reporter_id,target_type,entry_id,target_user_id,reason,status,created_at)
       values
        ($1,$3,'entry',$4,$5,'violence','open','2026-09-25T00:00:00Z'),
        ($2,$3,'entry',$6,$5,'other','open','2026-09-24T00:00:00Z')`,
      [oldReport, orphanReport, reporter, publicEntry, thirdParty, missingEntry]
    );
    await db.exec(`alter table public.content_reports enable trigger prepare_content_report;
      alter table public.content_reports enable trigger enqueue_content_report_review;`);

    const migration = await readFile(
      new URL('../../supabase/sql/20260926213000_ugc_moderation_readiness.sql', import.meta.url),
      'utf8'
    );
    const backfill = migration
      .slice(migration.indexOf("update public.content_reports r\nset status='dismissed'"))
      .split('-- RLS already limits report receipts')[0];
    await db.exec(backfill);

    const result = (await db.query(
      `select r.target_user_id,q.target_user_id as queued_owner,q.priority,q.status,
        q.content_snapshot->>'notes' as notes
       from public.content_reports r
       join private.content_report_reviews q on q.report_id=r.id
       where r.id=$1`,
      [oldReport]
    )).rows[0];
    assert.deepEqual(result, {
      target_user_id: owner,
      queued_owner: owner,
      priority: 'urgent',
      status: 'open',
      notes: 'Black cherry, killer acidity, and a die-cut label.',
    });
    assert.deepEqual((await db.query(
      `select r.status,count(q.id)::int as queued
       from public.content_reports r
       left join private.content_report_reviews q on q.report_id=r.id
       where r.id=$1 group by r.status`,
      [orphanReport]
    )).rows[0], { status: 'dismissed', queued: 0 });
  } finally {
    await db.close();
  }
});
