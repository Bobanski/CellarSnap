# Cluster UGC moderation runbook

This is the operator contract for posts, comments, images, reports, and blocks in
Cluster. It applies to production and must be staffed before App Review. It does not
authorize use of production credentials in source control, chat, shell history, or
command-line arguments.

## Ownership and service levels

Cluster Wine, LLC must name a primary moderation on-call and a backup. The primary
owns `support@clusterwine.app`, the queue alert, content decisions, user replies, and
the daily handoff. The backup acknowledges an unclaimed urgent alert if the primary
does not respond within 15 minutes.

- Hate, harassment, nudity/sexual content, credible threats, and suspected child
  sexual exploitation: claim within 15 minutes and decide within four hours.
- Spam, misinformation, and other reports: decide within 24 hours.
- Credible imminent harm or suspected child sexual exploitation: hide the content,
  preserve the private queue evidence, notify the designated company lead, and
  follow applicable emergency/reporting obligations. Do not investigate beyond the
  minimum needed to preserve safety and evidence.
- Appeals sent to `support@clusterwine.app`: acknowledge within one business day and
  have the backup reviewer make the final decision when practical.

The company inbox and queue alert must be tested with the primary and backup before
submission. A source-controlled runbook or a database row is not proof that either is
monitored.

## What the system enforces

Migration `20260926213000_ugc_moderation_readiness.sql` screens feed-visible,
non-private entry narrative fields and all comments in database triggers. This covers
web APIs and direct native Data API writes. It uses a private, configurable set of
high-confidence patterns for credible threats, targeted slurs, self-harm directions,
and child sexual material. It intentionally avoids broad wine-language terms and does
not screen private cellar notes until the entry is shared.

The filter is one layer, not a claim of complete automated detection. Photos and
context-dependent text depend on in-app reports and human review. Users can report a
post or comment and can block another account. Report intake derives the actual target
owner and canonical entry/comment server-side, resets client-supplied workflow state,
captures a private evidence snapshot, and assigns the four- or 24-hour deadline.

Grouped feed publication screens the group title and every rendered member field;
later title/member edits are screened while the anchor remains shared. The private
snapshot can include grouped text and Storage paths. Retain resolved or
dismissed review rows for 90 days for appeals and incident review, then delete them
under an approved retention job. Legal holds and safety reports supersede that normal
deletion window. Never export queue contents to ordinary analytics or ticket systems.

## Operator setup

First rotate the production database password under OPS-04. Use a company-owned
password manager and an explicit libpq environment (`PGHOST`, `PGPORT`, `PGUSER`,
`PGDATABASE`, `PGSSLMODE=verify-full`, plus the protected password mechanism). The
tool refuses an inferred project and suppresses private server diagnostics.

Run the read-only checks:

```sh
node scripts/moderation/review-queue.mjs summary
node scripts/moderation/review-queue.mjs list
node scripts/moderation/review-queue.mjs assert-sla
```

Install `assert-sla` in a company-owned monitor every five minutes. Exit code `2`
means an overdue case or an urgent case unclaimed for 15 minutes; configure that exit
to page both named operators. Exit code `1` is an operator/tool failure and must also
alert. Stdout contains counts/ages only. Complete an injected urgent-report drill and
record the alert receipt before App Review.

## Review procedure

1. Read `summary`, then `list`. The list is bounded to 100 oldest cases and excludes
   reporter IDs, target user IDs, report details, and evidence text from stdout.
2. Claim by report ID or queue ID:

   ```sh
   node scripts/moderation/review-queue.mjs claim REPORT_UUID OPERATOR_LABEL
   ```

3. Inspect the reported content in the application. If it is gone, review the private
   queue snapshot in a protected database session. Consider context, account history,
   blocking, and immediate-safety escalation. Do not share the snapshot in chat.
4. Write a concise decision rationale in a mode-0600 local file. Resolve a confirmed
   violation or dismiss a non-violation:

   ```sh
   node scripts/moderation/review-queue.mjs resolve REPORT_UUID resolved OPERATOR_LABEL /private/path/notes.txt
   node scripts/moderation/review-queue.mjs resolve REPORT_UUID dismissed OPERATOR_LABEL /private/path/notes.txt
   ```

   `resolved` atomically records a private enforcement, removes an entry from the feed
   and makes it private, or soft-hides a comment as `[deleted]`. Ordinary author writes
   cannot republish or restore enforced content. `dismissed` leaves content visible.
   Both record operator, timestamps, and rationale. Re-running a completed decision
   fails closed.
5. For warnings, suspensions, legal escalation, or account deletion, use the approved
   company procedure and record only the minimum needed in the private resolution
   note. Those account-level actions are not automated by this tool.
6. Re-run `summary` and confirm the case left the open queue. Reply through the
   monitored support channel when the reporter or affected user requested follow-up.

Appeals require a second authorized operator to review the original evidence and
resolution. There is intentionally no ordinary-user or one-command restoration path.
Until an approved database-owner procedure records the appeal rationale, deactivates
every enforcement for the target, and re-screens the content, it remains hidden. Do
not edit the public content row alone; the private enforcement is authoritative.

## Release and acceptance gate

Before production rollout: independently review the append-only migration, rotate
OPS-04, apply it to the intended Supabase project, compare live schema drift, submit
clean and blocked comments through both web and installed iOS, share a formerly
private entry containing blocked text, submit entry/comment reports, block/unblock an
account, and run resolved/dismissed operator decisions. Verify the five-minute alert
drill and support-inbox ownership. Use only disposable accounts and content.

QC-25 remains Partial until the migration is live, the alert/inbox owners are named
and tested, and installed-iOS report/block/filter acceptance passes. Responsive web or
Expo-web testing does not replace installed-native acceptance.
