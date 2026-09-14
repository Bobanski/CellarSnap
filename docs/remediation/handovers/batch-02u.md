# B02u handover — September 14, 2026

**Superseded by the [B02t/B02u release](b02t-b02u-release.md): merged, final-primary verified; original checkpoint below is retained as history.**

## Objective and IDs
QC-01 P1/Partial, AUD-13/15/48/50. Required mobile owner edit API adoption, normal and bulk review. No physical rating transfer, SQL, creation/import rewrite or native distribution.

## Resume here
Branch `fix/b02u-mobile-owner-edit`, parent B02t `97a0438` / PR #155. Implementation and automated checks pass. Final local browser retest of focus-loss correction, CI, merge and primary live acceptance pending at this checkpoint. Combined release handover will record exact tested commit.

## State and decisions
`entryEditRequest.ts` uses bearer POST with credentials omitted, a 15-second deadline including token acquisition and response parsing, and strict entry/viewer/replay receipt checks. There is no direct-RPC fallback or automatic write retry. Existing editor inputs, raw snapshots, explicit versus untouched grapes, owner rating bounds and ordinary/grouped/bulk-review details are preserved. The existing queue publication step remains separate AUD-13/15 lifecycle work.

A held successful bulk save followed by Feed-tab navigation reproduced a redirect back to the library. Expo tabs keep screens mounted. B02u now invalidates edits on focus loss, entry/session changes and unmount; generation checks protect completion after save and after queue publication. Aborting the client does not undo a transaction already committed; explicit retry remains safe through the existing no-op command contract.

## Verification
557 isolated / 30 schema checks, canonical query types, web/mobile types, lint and web/iOS/Android Expo exports pass. B02t has 30 new route tests and B02u 18 request tests. Final screen fix passes fresh types/lint/exports; actual focus-loss regression retest is running.
Hosted actual API checks pass: owner receipt, foreign designated tester denial, anonymous/malformed bearer denial, valid-cookie-only denial, invalid bearer with valid cookie denial, cross-origin CORS/no-store, 1/100/null ratings, stale-snapshot 409 and invalid-grape/rating rollback.
Actual desktop 1440×1000 and phone 390×844 Expo interactions passed normal notes/rating/grape saves, unchanged link IDs, 101 rejection, failure and lost-success retry, phone deadline, conflicts/draft retention, clear-all-grapes, grouped owner edits with unchanged companion and bulk failure/retry/publication. Web counterpart shows saved notes/numbers and decoded private photos at both sizes. Final navigation retest remains the checkpoint gate.
No page exceptions. Deliberate 400/401/403/409 and injected 503s are recorded separately. Recurring web login auth `Failed to fetch` diagnostic remains AUD-50. Existing `(app)` header and broad pressable role/target work remain QC-05/06/B11. No native simulator: CommandLineTools only, no simctl, emulator/adb or standard Android SDK/Xcode app. Browser/export results do not establish native acceptance.

## Release state
B02t primary preview and both application CI jobs pass. B02u merge/deployment/live verification pending. Duplicate legacy Vercel project fails for missing Supabase environment configuration (OPS-01), not a product build failure. No SQL/native deployment.

## Workspace and environment
Next 3001 / Expo browser 8083, local private harness/evidence `/tmp/cellarsnap-b02t-b02u`. Disposable fixtures scoped by explicit IDs, no tester/profile flags changed; cleanup runs at each harness boundary. Original tsconfig bytes, user reports and nested worktree preserved. Restore only session-generated AGENTS delta when servers stop.

## Next slice
Complete browser navigation/sign-out/return-and-retry coverage, merge B02t then B02u when checks pass, test final primary and publish a combined release handover. QC-01 remains Partial for physical/direct/native and create/import/server/operator sources. AUD-01 P0 rollout/cutoff/rekey/retirement gates remain unmet. [Backlog](../backlog.md), [hub](../README.md), [inventory](../b02o-rating-consumers.md).
