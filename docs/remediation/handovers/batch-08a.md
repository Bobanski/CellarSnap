# B08a handover — September 13, 2026

**Subsequent release:** merged and QC verified in [B02c2/B02d/B08a release](b02c2-b02d-b08a-release.md). The dated checkpoint below preserves implementation history; use the release handover for current state.


## Objective and IDs
QC-07 canonical mobile grape reads and notes-only retention; QC-17 owner-editor search discovered during acceptance. Related AUD-13/21. No SQL, historical backfill, broad entry mutation refactor or theme changes.

## Resume here
Branch `codex/b08a-mobile-grape-retention` stacked on B02d `6794d45` / #127, then B02c2 #126. Implementation and automated checks pass; final desktop/phone browser retest is running at this checkpoint. Merge/close permission belongs only to this session.

## State and decisions
The mobile detail query uses typed `entry_primary_grapes` and its actual ordered variety relation. Shared normalization distinguishes empty success from missing/incomplete data and query/network failure. Failed reads show a retry state and prevent editing. Notes-only saves compare ordered IDs and issue no grape mutations, preserving link identity/order and avoiding overwriting concurrently changed grapes. Explicit changes retain the existing multi-request mutation workflow, but schema and insert failures are no longer silently ignored: details already saved and grape failure are stated, selection remains available for retry. Atomic multi-table replacement, concurrent explicit edits and crash recovery remain AUD-13/B08; this slice does not claim transactional saves. No historical grape-loss repair attempted.

QC-17: normal owner search was gated on bulk review. Actual retest also returned a canonical result that disappeared after scrolling blurred the input. The query is now enabled in either editor, and inline results remain selectable after keyboard dismissal. Add/remove still preserves ordered selection and the three-grape limit.

## Verification
Before source changes, current released Expo web requested absent `wine_entry_primary_grapes`, returned 404 and showed Not set for a disposable two-grape entry. Source fixes pass typed web/mobile checks, full lint, 398 isolated tests, 12 schema tests and database compile contracts (final client guard rerun pending). Expo web/iOS/Android exports pass. Actual positive/edit/empty/failure/retry browser QC is being rerun after two search discoveries; do not infer acceptance from earlier incomplete runs. Native inventory still has no simulator/Android emulator, so Expo web/export is not native acceptance or distribution.

## Release state
No merge, binary or OTA deployment at this checkpoint. No SQL. Rollback of this client repair would restore missing-table reads and notes-only grape loss risk. Preserve the previously deployed database authority and current stored grapes.

## Workspace and environment
Disposable fixture details are stored only under `/tmp/cellarsnap-b02c2-b02d-b08a`; remove that fixture and verify original awards when browser QC completes. Next 3001 and Expo/proxy 8083; temporary export API base is loopback, no environment files changed. Original user changes and design draft preserved.

## Next slice
Finish QC, final production build/smoke and release all three bounded PRs in dependency order. Keep canonical backlog/hub and final handover aligned; explicitly retain native, old Storage capabilities, numeric public payloads, legacy helper RPCs and atomic mutation residuals.
