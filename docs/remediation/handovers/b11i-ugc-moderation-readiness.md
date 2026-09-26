# B11i UGC moderation readiness handover — September 26, 2026

## Objective and IDs

B11i advances QC-25 from Open to Partial without claiming an operation that is not
yet staffed or deployed. It covers every current direct and API post/comment write
path with database-authoritative screening, makes report targets and workflow state
server-authoritative, preserves private review evidence if public content/receipts are
deleted, and supplies a bounded operator/SLA contract. It also updates the accepted
terms to prohibit abusive and objectionable content.

Work is isolated on `codex/ugc-moderation-readiness`, based on merged B11h main
`9163bf7`. No production database or user content was changed.

## Resume here

1. Review the migration, operator commands, private evidence retention, filter
   precision, and friendly `PT422` API mappings. Open/merge the PR only after CI and
   a fresh review pass.
2. Rotate the exposed production database password under OPS-04, update protected
   consumers, and verify database/operator connectivity.
3. Apply `20260926213000_ugc_moderation_readiness.sql` to the intended Supabase
   project, compare the live catalog, and run disposable web/Data API acceptance.
4. Name the primary and backup moderation operators, connect `assert-sla` to a
   five-minute company-owned alert, confirm `support@clusterwine.app` ownership, and
   perform an injected urgent-report alert drill.
5. Run installed-iPhone/TestFlight filtering, report and block acceptance. Only then
   may QC-25 and Guideline 1.2 readiness be considered complete.
6. Take the five available Expo SDK 57 patch updates as a separate AUD-08 slice.

## State and decisions

- The filter lives in private database triggers because mobile comments and ordinary
  mobile entries can write directly through Supabase. API-only validation would be
  bypassable.
- All comment bodies are screened. Feed-visible non-private posts screen the displayed
  structured fields, location, notes and advanced notes; private cellar notes are not
  screened until the record is shared.
- Patterns are private/configurable and deliberately high-confidence. Tests cover
  leetspeak/punctuation evasions and wine-language false positives. This is not a
  claim of exhaustive automated detection or image pre-screening.
- Report intake derives the real content owner/canonical entry, resets forged status,
  checks visibility, snapshots reported text and photo paths privately, and assigns
  urgent four-hour or standard 24-hour deadlines. The private queue survives deletion
  of the public report receipt. Active historical receipts are canonicalized and
  backfilled into the private queue; invalid historical self-reports are dismissed.
- The database-owner CLI exposes sanitized counts/bounded metadata only. Claim and
  resolve values are encoded through stdin, not shell interpolation. Confirmed
  violations atomically hide the post or soft-delete the comment; dismissed reports
  preserve content.
- A monitor contract is implemented, not configured. `assert-sla` exits `2` for an
  overdue case or an urgent case unclaimed for 15 minutes. Submission remains blocked
  until a tested alert reaches named primary and backup owners.

## Verification

Verified on the B11i working tree:

- 599/599 isolated application tests passed.
- 56/56 schema/tool checks passed, including catalog drift, direct authenticated
  entry/comment writes, private-to-shared transitions, adversarial/false-positive
  filtering, target/status forgery, private access denial, report evidence persistence,
  operator encoding and atomic resolution.
- Database type contract, web/mobile typechecks, and web/mobile lints passed.
- Mobile release 7/7, dependency 7/7, and tooling 3/3 contracts passed.
- Next production build passed all 94 routes.
- Web and static Terms passed at 390×844 and 1440×900: updated prohibited-content
  copy and support contact present, HTTP 200, no horizontal overflow, console errors,
  or page errors. Screenshots are disposable under `/tmp/cellarsnap-b11i-*.png`.
- No native runtime/emulator is installed. The migration is not hosted, so actual
  filter/report/resolve browser or Data API acceptance could not be run. Automated
  PGlite execution is not live Supabase acceptance.

## Release state

- Implementation: source `68c73a8` on `codex/ugc-moderation-readiness`; PR #174
  is open and awaiting independent checks/review.
- Merge/application deployment: pending.
- Database migration: pending; zero production DDL/DML.
- Alert/inbox staffing and drill: pending.
- Installed native acceptance: unavailable/pending.
- B11h PR #173 is merged as `9163bf7`; primary web and the separate `cluster-site`
  legal/support deployment are live-verified.
- Historical retirement remains undeployed/unexecuted; zero production deletes.

Rollback before hosting is a source revert. After hosting, disable individual private
patterns to address precision without removing report intake/queue safeguards. A full
migration rollback must preserve pending evidence and resolve trigger dependencies;
do not drop the private queue as an emergency response.

## Workspace and environment

The isolated worktree is `/private/tmp/cellarsnap-moderation-ready`. The original
checkout and its user-owned changes remain untouched. The ignored environment file
was sourced only for the local production build/server and was not copied or printed.
Local Next/static QC used ports 3011/8091 and should be stopped at handoff.

## Next slice

Finish review/merge, OPS-04 rotation, hosted migration/catalog acceptance, monitored
operations and installed-native acceptance in that order. QC-25 remains Partial until
all of those gates pass. Then complete the bounded Expo patch review; Apple company
enrollment, signing, TestFlight and installed-device acceptance should become the only
remaining submission blockers.
