# B06e handover — September 13, 2026

## Objective and IDs
AUD-09 featured-profile earned-award authority, issue #112. Preserve all definitions and historical awards. Deferred triggers, historical eligibility review and native acceptance remain separate.

## Resume here
**Paused at the user’s request.** Branch `fix/b06e-featured-badge-authority`, base `ac8045a`, implementation commit `63cb2c6854fd137152997d539eb20393d1c77090`, [draft PR #117](https://github.com/Bobanski/CellarSnap/pull/117). This checkpoint is pushed; do not infer completion from its passing automated tests.

1. Review the migration and private trigger authorization/locking contracts, especially concurrent feature versus award deletion/key reassignment. PGlite checks transactions, but hosted concurrency is not tested.
2. Recheck live preflight/grants and finish database release planning. Migration has **not** been applied; a source deployment cannot enforce this boundary by itself. Apply only the reviewed forward file in a coordinated release, never replay historical SQL.
3. Use designated accounts with recorded initial profile fields/award timestamps. Test direct Data API feature/unfeature, unearned/cross-user denial, cookie/bearer API parity, and concurrent revocation. Restore exact disposable fixture state.
4. Exercise feature/edit/reorder/cancel/save/reload/clear on desktop and phone web, plus legacy single-feature behavior in Expo web and available native tools. Check UI/server errors; triage QC-15 before calling browser QC complete.
5. Update backlog/QC/handover, then review CI and release readiness. The user’s merge permission was expressly one-session only; this pause is not standing authorization for future sessions.

## State and decisions
Both single and ordered array fields must reference stored owner awards. Array-only writes synchronize the single field; legacy single changes replace/clear the list. Up to five distinct non-null picks; contradictory writes reject. Private validation trigger uses definer rights solely for award key locks (clients retain SELECT-only award access), a pinned empty search path and client auth.uid ownership binding; direct execution is revoked. Revocation/key reassignment cleans remaining selections transactionally, including bulk revocations. Concurrent revocation/feature deadlocks may abort one transaction; retry preserves authority. Existing hosted profile selections were all empty; preflight fails on unexpected invalid/unsynchronized legacy data. No awards or profile selections changed by migration.

## Verification
Tested implementation `63cb2c6`: **385 isolated checks pass**, **nine schema/source/database tests pass** (baseline replay/drift, four featured-authority test groups, generated-source contracts), whole web/mobile lint passes, web `tsc --noEmit` and database type-contract compile pass. Initial full-suite failures were localhost `listen EPERM` sandbox restrictions; the authorized rerun passed all 385. An initial anonymous-role test retained the owner JWT fixture; clearing the claim correctly models anonymous requests and passes. No product fix was needed for those test-harness failures.

Hands-on browser coverage is **incomplete**: designated-account login succeeded and navigation to local `/profile` started; APIs returned 200. No feature mutation, desktop/phone visual acceptance, screenshots, or Expo interaction completed before the pause. Local server output contained one transient `/profile` 500 with `SyntaxError: Unexpected end of JSON input`, followed by 200s; root cause unknown, QC-15 Needs triage. No claim of clean browser/server errors. No hosted mutation/concurrency checks, Next production build, mobile typecheck, fresh Expo exports, or native distribution acceptance this session. No simctl/Xcode app or Android SDK emulator was found. Existing B06b Expo web bundle server was started but not exercised; it is not current native acceptance. Database generated types unchanged because no public signatures changed.

## Release state
Migration `20260913071742_earned_featured_badges.sql` is forward-only, appended to manifest; **not applied**. PR #117 is a draft, no merge or issue closure. No production deployment or live acceptance performed; preview/CI may start from the pushed PR and are unreviewed. Hosted read-only preflight found zero invalid/unsynchronized selections and zero featured profiles. Security advisors were read before implementation; existing warnings retained, no after-migration advisory check yet. No hosted award/profile/reference mutations performed. Ordinary authenticated reads may update derived caches. Preserve tightened award privileges on rollback; use a forward repair rather than disabling authority.

## Workspace and environment
User-modified `tsconfig.json` restored byte-for-byte from session-start copy; untracked `cellarsnap-fix-plan.md` / `cellarsnap-qa-report.md`, nested worktree and design PR #75 preserved. Next-generated AGENTS block removed by restoring its session-start content. Session-owned Next 3001 and Expo web 8083 stopped; existing 3002 untouched. Temporary browser tab closed; explicit sign-out was not completed before server shutdown, so a local browser QC session may remain. No environment/credential changes or viewport override. Logs and original-file backups under `/tmp/cellarsnap-b06e` are optional supporting evidence; this document is sufficient to resume.

## Next slice
After finishing B06e, complete QC-03 browser outage/recovery visual acceptance using a working local fault harness; separately B05e/QC-14 alias repair. Neither follow-up batch was implemented. Historical alias seed SQL was read only; no repair, collision inventory, or hosted alias mutation occurred. [Backlog](../backlog.md), [hub](../README.md).
