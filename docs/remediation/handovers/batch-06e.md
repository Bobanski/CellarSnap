# B06e handover — September 13, 2026

## Objective and IDs
AUD-09 featured-profile earned-award authority, issue #112. Preserve all definitions and historical awards. Deferred triggers, historical eligibility review and native acceptance remain separate.

## Resume here
Branch `fix/b06e-featured-badge-authority`, base `ac8045a`. Complete hosted migration and browser/Expo QC before merge; see subsequent release handover for final status.

## State and decisions
Both single and ordered array fields must reference stored owner awards. Array-only writes synchronize the single field; legacy single changes replace/clear the list. Up to five distinct non-null picks; contradictory writes reject. Private validation trigger uses definer rights solely for award key locks (clients retain SELECT-only award access), a pinned empty search path and client auth.uid ownership binding; direct execution is revoked. Revocation/key reassignment cleans remaining selections transactionally, including bulk revocations. Concurrent revocation/feature deadlocks may abort one transaction; retry preserves authority. Existing hosted profile selections were all empty; preflight fails on unexpected invalid/unsynchronized legacy data. No awards or profile selections changed by migration.

## Verification
Nine schema/source/database tests pass, including baseline replay and reviewed catalog additions. Full isolated suite/lint/types and browser QC underway. Native tools unavailable (no simctl or Android SDK emulator); Expo web is fallback only. Database generated types unchanged because no public signatures changed.

## Release state
Migration `20260913071742_earned_featured_badges.sql` is forward-only, appended to manifest; not yet applied at this checkpoint. No merge/deployment/live acceptance yet. Preserve tightened award privileges on rollback; use a forward repair rather than disabling authority.

## Workspace and environment
Preserve user-modified tsconfig.json and two untracked QA/plan files, nested worktree, design PR #75. Next 3001 and Expo web 8083 are session-owned; existing 3002 untouched. Evidence under `/tmp/cellarsnap-b06e`. No credential changes.

## Next slice
Complete QC-03 browser outage/recovery visual acceptance using a working local fault harness; separately B05e/QC-14 alias repair. [Backlog](../backlog.md), [hub](../README.md).
