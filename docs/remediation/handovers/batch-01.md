# Batch 01 handover — September 12, 2026

## Objective and IDs

Consolidate completed branches while preserving Noir Refined, then implement the initial audit repairs. Work touched AUD-02/03/10/17/27/33/44/48/49. Browser/Expo QC found QC-01 through QC-06. All 50 audit findings and follow-ups are in the [canonical backlog](../backlog.md); partially addressed findings remain open there.

## Resume here

1. Inspect `git status`, worktrees, remote main, and [PR #80](https://github.com/Bobanski/CellarSnap/pull/80). Last checked: **open draft**, branch `codex/audit-remediation`, code/QC documentation HEAD `44e59ff`; later commits add only this planning system. Exact implementation tested: `0e7acb0caad26f6d88e384b07ab563e5b394848f`.
2. Finish the batch-one review/release through the normal workflow; retain all remaining findings. Confirm what code is deployed separately from SQL. Do not repeat earlier consolidation merges or apply the light theme.
3. Start B02 with an explicit entry/photo/public identity access matrix and disposable cross-user fixtures. Inspect affected live policies before proposing changes. Include the mobile raw-rating exposure QC-01. See the [batch plan](../README.md).

## State and decisions

- Main consolidated by [PR #79](https://github.com/Bobanski/CellarSnap/pull/79), commit `778e43c3105f23b791153eb290091de4a6960de0`. Completed overhaul, marketing and iOS submission work was included. Older features already squash-merged were not replayed.
- Owner explicitly chose the existing dark theme. [Champagne Daylight PR #75](https://github.com/Bobanski/CellarSnap/pull/75) stays separate.
- Do not remove features to reduce line count. Preserve rating 1–100 versus algorithm match 0–100, existing scoring weights, sharing/group/draft/import semantics, and web/native I/O differences.
- Shared signing helper: `packages/shared/src/storage.ts`; adapters at `src/server/storage/signedUrls.ts` and `apps/mobile/src/lib/storage/signedUrls.ts`. The separate photo endpoint still needs conversion.
- Score repairs: `src/app/api/algorithm/score/handler.ts` and `score/batch/handler.ts`; corrected grape relationship in `src/app/api/explore/[type]/[slug]/route.ts`.
- No new product-code fixes were made during browser QC. New UI issues are follow-ups, not evidence that batch one changed those behaviors.

## Verification

- At implementation commit: **173** unit/route/PGlite tests passed; web/mobile lint and TypeScript passed; Next production build passed using placeholder public configuration. GitHub web/mobile CI and primary Vercel preview passed at the implementation stage. Recheck checks on the actual release SHA rather than assuming later jobs passed.
- Interactive Chrome at desktop and 390px responsive width: login, feed photos/filter, grape community statistics, score display/reload, library search, private-owner detail, editor hydration/cancel, collections/menu and logout/protected redirect.
- Expo **web**, 390px and 320px: login, all 28 initially loaded image elements valid, photo carousel, cellar/search, private detail and logout. Not an iOS/Android runtime test.
- Findings and limits: [detailed QC report](../../audits/batch-1-browser-mobile-qc-2026-09-12.md). Test account `e2e_user_a`; existing synthetic fixtures. No deliberate entry/profile/social mutations; normal page-triggered cache/generation work may run.
- Batch cache edge cases and SQL roles/policies are covered by isolated tests. No active UI caller for the batch scoring wrapper was found, so browser reload is not proof of the internal all-hit branch.

## Release state

- Implementation branch pushed; PR #80 not merged at last check. Main consolidation alone is deployed; verify deployment state afresh before reporting any remediation live.
- `supabase/sql/20260912185640_protect_profile_capabilities_and_public_assets.sql` is in the manifest and tested with PGlite, **not applied live**. It guards `profiles.is_test_account` client writes and removes public-assets PUBLIC write policies. Existing user rows/flags are not reset or deleted.
- Remaining release steps: review current diff/checks; complete configured merge/deploy workflow; apply migration through the established process; verify authenticated/anonymous denial and retained profile/admin/public-read behavior against the intended environment. Record exact deployment/migration evidence against AUD-02/03 before closing them.
- Recovery: capture existing affected definitions and confirm service-role/admin functionality before rollout. Do not “rollback” by blindly reopening PUBLIC writes or undoing privacy protections; assess a targeted forward correction. Code can be reverted through the normal PR workflow if a regression is reproduced.
- Original P0 entry/photo and personal-embedding exposures remain unresolved. Primary `Vercel – cellar-snap` passed earlier; duplicate `Vercel – cellarsnap` failure remains OPS-01.

## Workspace and environment

- Checkout: `/Users/esneider/Projects/Claude-OS/projects/cellarsnap`.
- Preserve preexisting modified `tsconfig.json` formatting/`.claude` exclusion and untracked `cellarsnap-fix-plan.md`, `cellarsnap-qa-report.md`, and `.claude/worktrees/agent-a251821a0b01f63dc/`. Do not stage them with unrelated remediation docs.
- Nested worktree is on `overhaul/w2b-palate` at `64f7392`; no instruction to delete or merge it blindly. Previous temporary integration worktree was removed.
- Older local March 25 QA files claim nine fixes passed static review but explicitly skipped build/TypeScript due to missing dependencies. They are not present-day acceptance evidence. Their topics are captured in OPS-02 so a future session need not rely on those untracked files surviving.
- Root/mobile `.env.local` files contain the configured service/public settings; root includes designated `E2E_USER_A_*` / `E2E_USER_B_*` credentials. Never print or commit their values. Supabase access and production effects require the same care as any normal backend work.
- No Xcode/simctl or Android SDK/AVD/adb was installed. Native acceptance remains outstanding; do not label Expo web as native emulation.
- Expo's saved API base pointed to an old LAN address. QC temporarily used Next 3001 + Metro 8082 + same-origin proxy 8083; all servers stopped, clients signed out, viewport overrides reset, diagnostic code removed, and mobile environment restored byte-for-byte. Re-establish a local API target for future testing without committing local credentials/settings.
- Local screenshots/sanitized HTTP evidence: `/Users/esneider/.codex/visualizations/2026/09/12/01a096dd-98d0-7153-ad28-a634fabd87fe/batch1-qc/`. The checked-in report contains enough reproduction detail if those artifacts are unavailable.
- Browser/mobile QC preference is in project instructions and `/Users/esneider/.codex/AGENTS.md`. The new repository `AGENTS.md` directs fresh agents to this hub.

## Next slice

B02a: establish affected-policy baseline and owner/friend/block/test/shared-copy/photo fixtures; complete AUD-02/03 deployment verification alongside AUD-01's repair plan. B02b can handle public identity/ratings after the access contract is established. Keep AUD-04 queued immediately afterward in B03, and pull forward containment if current evidence warrants it. Update the backlog and publish a new handover before switching to another fresh session.
