# B02y / B07b–B09a release handover — September 22, 2026

## Objective and IDs

User authorized merging the clear candidate and beginning the next round. [PR #164](https://github.com/Bobanski/CellarSnap/pull/164) is merged and final-primary verified; AUD-11 and AUD-28 are Closed for scoring-preference parity and bounded entry/grape hydration. Total: **15 Closed / 72 findings**. AUD-10/12/29/35 and ongoing AUD-50 remain explicit.

The next round implements protected historical-photo preservation for AUD-01/AUD-22, [issue #81](https://github.com/Bobanski/CellarSnap/issues/81), [PR #165](https://github.com/Bobanski/CellarSnap/pull/165). Implementation `225c0ee9a79cd17f4d88b8d24990dc7d54dc6e61`, branch `codex/b02y-protected-photo-archive`, base `421f244`. AUD-01 remains Partial/P0; AUD-22 remains Open for canonical ownership/representation and historical recovery work. No historical deletion or ownership inference.

## Resume here

Review #165 and the [archive runbook](../b02y-protected-photo-archive.md). The additive migration is **not hosted**. Release its exact SQL separately, then verify actual hosted cross-bucket copy and role denial with disposable fixtures before any ordinary archival copy. The implementation supports one bounded source per operation, preserves uncertain originals and records timestamped hash/CAS proof. Code installation has no app-route dependency on the new schema.

Then preserve the reviewed 189-object cohort, retaining all source and recovery bytes. The next implementation is historical retirement: fresh archive/source verification, durable reference/upload fencing, deletion confirmation and independent regional raw/transformed capability evidence. Nine originals of missing referenced crops remain held for a semantic recovery decision; three missing paths have no known bytes. Do not relax the existing referenced-photo operator or treat copied records as deletion authority.

## State and decisions

- #164 merged `421f244bb3c973e9c7f635306419fcc44f48da76` at 06:35:11 UTC. Its tree exactly matches tested head `bd2e2be`. Primary `cellar-snap` deployment `dpl_VXF5RzR7TAGT8WYZzqTc3dEn4aV5` is Ready and serves `https://cellarsnap.app`; build log identifies `421f244`. Web/mobile CI passed on the merged candidate. The known duplicate `cellarsnap` project failed from missing Supabase environment variables (OPS-01), independently verified before merge.
- The new `photo-recovery-archive` bucket denies all client object/bucket operations with restrictive policies. The private ledger has no public/client/service-role access; SQL functions are invoker-only. The service key performs only bounded Storage reads/copies; PostgreSQL operator credentials manage ledger transitions.
- Planning binds source identity and bytes to the original indexed backup, snapshots both base/original references, and rejects referenced cohorts. Resume checks source/copy/backup SHA-256, size, MIME and stable metadata; final short READ COMMITTED CAS locks against phantom references, object changes and public-bucket changes. There is no network I/O under a database lock.
- Lost copies/commits resume without overwrites. Copied records are timestamped observations, not permanent access/immutability guarantees. Abandoned plans keep any partial bytes. No deletion, move, signature, new tombstone or reference rewrite command was added. Existing rekey/cutoff rules are preserved.
- Read-only receipt preflight verified all 189 eligible files / 559,574,950 bytes; nine originals are held. Production recheck still reports 921 objects, twelve missing referenced paths, active cutoff, 487 verified prior rekeys and no archive bucket.

## Verification

Archive source `225c0ee`:

- **568 isolated tests**, **47 schema/tool checks**, web lint and public database type contract pass. No public schema/type or application source changed in #165.
- PostgreSQL 17.6 with pgvector 0.8.0: full catalog matches the reviewed additive delta; four new concurrency checks pass (reference, source, destination, bucket privacy), as do existing badge/edit/rekey/cutoff races and real psql CLI checks. The runner creates/destroys its own loopback cluster and performs zero production writes.
- Failure/role fixtures pass: copy and commit lost-response recovery; corrupt/mismatched bytes; referenced/missing-base holds; changed historical identity; malformed/duplicate provenance; anonymous/authenticated denial even with otherwise broad permissive policies; disabled-RLS/pre-existing-bucket installation refusal; stale-isolation refusal. Early test assertions were corrected for managed Storage's updated_at/delete guards, then rerun successfully.
- The cross-bucket HTTP adapter is tested with bounded response/failure fixtures and agrees with current official docs/installed SDK. **Actual hosted Storage copying and archive-specific hosted role acceptance have not run** because the migration remains unreleased. Service-key download success alone will not satisfy that access check.

Final-primary #164 browser acceptance at 1440×1000 and 390×844:

- Real owner detail/explanation/edit/save, refreshed cache versus fresh scoring parity (score, confidence, effective profile, axis contribution), no horizontal overflow.
- Full cold single/batch parity, warm numeric parity, ordered duplicates/mixed items, foreign-ID overrides denied. Both cookie and isolated bearer requests pass.
- Injected 503 announces temporary failure; keyboard Enter on Retry match recovers at both widths.
- Real menu scan returns 48 wines in personalized mode; desktop/phone recommendations, Show/Hide filters and Best Match sorting pass.
- Zero page exceptions. Main flow has only two intentional 503 resource/console diagnostics; supplemental bearer/scan flow has no HTTP or console failures. A bounded 20-second production log tail overlapping a successful scoring request emitted no runtime error records; this is not a historical log audit.
- Visual inspection: [phone score](../evidence/b02y-live-score-phone.png), [desktop explanations](../evidence/b02y-live-breakdown-desktop.png), [phone retry](../evidence/b02y-live-retry-phone.png), [desktop scan](../evidence/b02y-live-scan-desktop.png), [phone recommendations](../evidence/b02y-live-scan-phone.png).
- `simctl` unavailable; `adb`/`emulator` absent. Responsive Chromium is web coverage. No Expo/native change or installed-device acceptance; native launch remains deferred per owner.

[Sanitized evidence](../evidence/b02y-release-archive-qc.json). Independent cleanup verifies zero session entries and scan rows.

## Release state

#164: implementation, merge, primary deployment and live web acceptance complete. No SQL migration in that release. Existing old score-cache rows use normal invalidation/6-hour expiry; cache versioning and full warm explanation parity remain AUD-12, materialized profiles AUD-29, uncapped preference history AUD-35.

#165: implemented/local QC passed; PR open. Source `225c0ee` Web/Mobile CI passed ([run 35696729681](https://github.com/Bobanski/CellarSnap/actions/runs/35696729681)); primary preview is Ready. The duplicate preview still fails from missing Supabase env (OPS-01), verified from its build log. Documentation-only follow-up commits do not change tested runtime; check current-head status before release. New migration `20260922063629_protected_photo_archive.sql` is appended to the manifest and **not applied**. No historical source/Storage mutations, hosted archive operations or new native release. Rollback disables the operator while preserving ledger/archive/recovery bytes; never drop populated Storage metadata or republish old exposed keys.

## Workspace and environment

Worktree `/tmp/cellarsnap-progress` retained, dependencies unchanged. Its private `.env.local` still links to the original; no environment values changed. Original workspace modified `tsconfig.json`, untracked fix-plan/QA report, nested worktree and design PR #75 untouched. No local web server was started this round. Disposable PostgreSQL clusters are stopped/removed; bounded log-tail processes ended.

Private logs, fixture manifests and browser harness/screenshots: `/tmp/cellarsnap-b02y-private`. Rebuilt local PostgreSQL/pgvector binaries: `/tmp/cellarsnap-b02y-runtime/pg17/bin` (the earlier runtime had been cleaned away). Durable historical backup/reconciliation directories under `/Users/esneider/Projects/Claude-OS/backups/cellarsnap` remain intact. Do not commit raw paths, row data, credentials or capabilities.

## Next slice

1. Review/release #165 and verify the hosted archive role/copy matrix. Refresh inventory and hashes before any ordinary preservation run.
2. Implement and test historical retirement fencing and recovery mapping; preserve the nine unresolved originals and missing-path records until their representation is deliberately repaired. Keep AUD-01 Partial until regional revocation evidence is complete.
3. Continue B07 cache/version/profile reuse and B08 grouped/lifecycle atomicity. Preserve the now-closed AUD-11/AUD-28 parity and query-bound regressions.
