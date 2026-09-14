# B02n handover — September 13, 2026
## Objective and IDs
QC-01 P1/Partial: projected bearer/mobile feed; preserve public bands, grouped slides, notes, QPR and pagination. B02m parent covers owner-aware detail/profile/tagged responses. Related AUD-48/50. No database privileges or SQL changed.
## Resume here
Branch `codex/b02n-mobile-feed-projection`, base B02m `e65bc29` / #144. 429 isolated / 30 schema checks pass; web production build, web/mobile types/lint and all-platform Expo export pass. Final Expo-browser suite and final export after request cleanup guard remain in progress. Do not merge until combined checkpoint records acceptance.
## State and decisions
Feed auth resolves cookie or bearer; an explicitly invalid bearer cannot fall back to a cookie. Responses are private/no-store with read-only CORS, no credentialed cross-origin cookies. Mobile supplies its bearer/photo-adoption header, validates viewer ID, null ratings/bands/cursors, times out failed fetch/body reads and does not fall back to direct entry/slide queries. Existing detail social helpers are retained. Pure transport types are separate so root regression tests do not import native runtime dependencies.
Per-slide notes/QPR and precomputed public bands are projected by the server for mobile compatibility. Group ratings are always null, including on owner detail group metadata; owner's main entry rating remains numeric. No base-table isolation/cutoff or installed native distribution claim.
## Verification
Combined web feed desktop/phone labels/groups/photos/pagination/circle/access/owner edit and detail/profile cookie/bearer ownership tests pass with no page/console/HTTP failures. Phone profile capture initially preceded image fade completion; corrected image-opacity wait requires full retest. First Expo harness did not wait for age-gate hydration; corrected and rerunning. Initial web build exposed a test import into native aliases; separated transport types, rebuilt successfully. Record these corrections rather than claiming first-pass acceptance.
Native Xcode/simctl and Android SDK absent. Expo/browser coverage is not native certification. Full evidence/release handover follows.
## Release state
No migration. Not merged/deployed; PR and combined QC pending. #144 has passing application CI and primary preview; duplicate legacy preview retains OPS-01. Session-only merge permission remains conditional on QC.
## Workspace and environment
Original user tsconfig/two reports/worktree/#75 preserved. Next 3001 and cookie-stripping Expo proxy 8083; `/tmp/cellarsnap-b02m-b02n` holds private fixtures/harnesses/logs. No environment edits. Only disposable E2E rows/objects used; profile flags restored in finally blocks.
## Next slice
B05f: remove tracked historical Git-index worktree metadata without deleting local contents; fresh clone and checkout-cleanup evidence. Finish Expo local QC, release PRs in dependency order, final-primary web and Expo counterpart, cleanup, statuses and release handover. [Backlog](../backlog.md).
