# B02p handover — September 13, 2026 (EDT)

**Release follow-up:** merged and final-primary verified; see [B02o/B02p/B02q release](b02o-b02p-b02q-release.md). The checkpoint below preserves its original stopping state.

## Objective and IDs
QC-01 Home containment, related AUD-48/50. Circle JSON now carries null ratings and public bands; owner recent rows retain numbers. Mobile requires projected Home API and removes direct raw-row fallback.
## Resume here
Branch `codex/b02p-home-rating-projection`, parent B02o `830b615`, issue #81. Implementation and local QC pass; production build/CI/release pending. B02q detail adoption follows on this branch's tested source.
## State and decisions
Bearer-only mobile requests omit cookies, adopt request-time photo delivery and reject wrong-viewer/raw circle/slide responses. One deadline bounds token/fetch/body, including uncooperative dependencies. Session/unmount invalidation discards late results. Errors clear entry lists and offer an explicit retry. Owner recent input and public bands/QPR/counts/interaction data remain; no database policy change.
## Verification
446 isolated and 30 schema tests pass; web/mobile lint and types and all-platform Expo exports pass. Actual desktop 1440×1000 and phone 390×844 Expo-browser: owner/circle cards, all four bands, decoded photos, navigation to detail, no direct Home entry reads, bearer/no-cookie requests, outage/raw-response denial and retry, test-author/block denial/restore, sign-out. Cookie API, cross-origin bearer, invalid bearer with valid cookie, anon and read-only preflight checks pass. Zero page exceptions; two intentional injected Home 503s only. Native Xcode/Android unavailable; this is browser acceptance and export validation, not native distribution.
## Release state
No SQL/migration or physical rating cutoff. QC-01 remains Partial for direct Data API, other clients and native rollout. Production build, PR merge, primary deployment and final-live verification still pending; see final combined handover before resuming.
## Workspace and environment
Disposable six entries, group, photo and tester flags restored. Private harness/evidence `/tmp/cellarsnap-b02o-b02q`. Next 3001 and Expo 8083 running for B02q; original tsconfig/user reports/nested checkout preserved. Next dev generated an AGENTS block; restore only that generated delta after server shutdown.
## Next slice
B02q: required owner-aware detail API read, public band display, stale-state protection; preserve grapes, crop/photos, owner 1–100 editing, comments and group metadata. Verify failures and native counterpart using Expo browser, then build/CI/review and release both application slices. [Backlog](../backlog.md), [hub](../README.md).
