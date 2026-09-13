# B06f summary-outage QC handover — September 13, 2026

**Released:** This historical checkpoint is superseded by the [combined release handover](b06e-b06f-b05e-release.md); implementation PRs #117/#118/#119 are merged, both migrations applied, primary production verified. Native gaps remain explicit.

## Objective and IDs
QC-03 remaining browser failure/recovery acceptance, #112. Unknown count was still treated as zero by the profile's My Palate card. Preserve routing for known empty/survey-incomplete accounts. Native acceptance and broad statistics/session ownership remain separate.

## Resume here
Branch `fix/b06f-summary-outage`, base B06e merge `65a4c1c`. Source and browser QC pass; PR/merge pending. Next B05e/QC-14 collision-reviewed alias repair; separately B06g/QC-16 unreachable mobile feature control.

## State and decisions
Profile unknown wine count now uses neutral “Explore your taste profile” copy and keeps `/palate` accessible. An explicitly missing survey still routes to setup; known zero stays survey-only. No summary values fabricated and no live outage injected.

Reusable loopback harness `scripts/qc/summary-proxy.mjs`: run a production Next build on 3001, then `QC_SUMMARY_MODE_FILE=/tmp/cellarsnap-summary-mode node scripts/qc/summary-proxy.mjs`. Write `outage`, `empty`, or `normal` to that file and reload http://localhost:3017/profile. Only `/api/profile/summary` is replaced; auth and other routes are transparently proxied without logging credentials. The old dev-proxy hydration failure does not reproduce with a production build.

## Verification
Web lint/types and Next build pass. Hands-on 390×844 phone and 1440×1000 desktop: injected 503 retains identity/gallery and unknown dashes, neutral card routes to full palate; palate renders identity and independent taste data with unknown count header; menu displays Counts unavailable. Synthetic successful zero response preserves `/taste-survey`. Switch to normal then reload: profile restores 71 wines/two countries/two friends and full palate link, menu restores matching counts. Fixed regression retested; no captured warning/error logs or server exceptions. Screenshots `/tmp/cellarsnap-b06f/{phone-outage-after,desktop-outage,phone-empty,phone-recovered,desktop-recovered,phone-menu-outage}.png`.

No mobile source changes. Current Expo badge reads checked during B06e on desktop/390×844, exports passed; native simulators/emulators unavailable and no binary/OTA distributed. QC-03 remains Partial for native acceptance, not browser outage coverage.

## Release state
No migration/data mutations. B06f source merge/deployment pending. B06e #117 merged `65a4c1c45f25ec59067bba2593eb76375766c217`, primary GitHub deployment 6419098713 success 07:53:40 UTC; URL https://cellar-snap-b58228x32-eitan-sneiders-projects.vercel.app. B06e live release verification continues separately. #112 remains open.

## Workspace and environment
Original user tsconfig/untracked reports/design worktree preserved. Next production 3001, summary proxy3017 (normal mode), Expo8083 remain running for subsequent QC. Dev3004 stopped. No env files changed. Restore generated AGENTS/tsconfig on handoff.

## Next slice
B05e inventory: all 131 hosted aliases damaged; all ASCII. One normalized collision (`Xarel-lo` / `Xarel Lo`) has the same canonical variety. Review lossless equivalent-key consolidation and fail closed on cross-variety collisions. Keep canonical IDs/entry joins and historical SQL unchanged; prepare corrected seed contract and forward repair, isolated and cookie/bearer/browser/Expo lookup checks.
