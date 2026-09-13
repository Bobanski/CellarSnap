# B04c release handover — September 12, 2026 (September 13 UTC)

## Objective and IDs
Release the compatible AUD-08 dependency slice, issue [#97](https://github.com/Bobanski/CellarSnap/issues/97), PR [#98](https://github.com/Bobanski/CellarSnap/pull/98). Web merge, deployment and live verification are complete. AUD-08 remains **Partial** for two mobile advisory roots and native acceptance/distribution. No unrelated B11 fixes or SQL changes were included.

## Resume here
Start from current main and the [canonical backlog](../backlog.md). Product implementation is `588d49a`; PR final head `4a5c107e6f16efb44ab653bc71a0eb436060302c` merged as `a0a95642e0d632f6562760702a171438a984a875`. This handover is published from `codex/b04c-release-verification`, based on that merge. The [implementation handover](batch-04c.md) records package choices and residual advisory analysis; its release-pending statements are historical.

## State and decisions
Next/ESLint 16.3.5, directly declared Sharp 0.35.4, Expo SDK 56 alignment and compatible tar/Metro patches are merged. Root full/production audits are zero; mobile has 14 moderate propagated entries, no high/critical. Router query-string/CommonJS → decode-uri-component and xcode → uuid are still unresolved; do not force an ESM override or Expo downgrade. Existing QC-10 recovery scroll, public projections and duplicate hosting stay separate.

## Verification
- Final PR head passed both GitHub web/mobile CI jobs, run `34735183548`, and primary `cellar-snap` Vercel preview. Duplicate `cellarsnap` preview failed under existing OPS-01.
- The released product tree retains **256 passing isolated tests**, including six actual Sharp codec cases, clean installs, web/mobile type/lint, Next production build, and Expo web/iOS/Android Hermes exports. Full prerelease interactive coverage is in the [QC report](../../audits/b04c-dependency-qc-2026-09-12.md).
- **Eight live HTTP checks passed** against cellarsnap.app: designated-account sign-in; anonymous crop 401; normal and zoomed crops 200 with decoded 1200×1200 JPEG output; tiny image 422; IPv4 and IPv6 loopback URLs 422; real public HTML wine list 200 with 48 wines. [HTTP evidence](../evidence/b04c-live-results.json).
- Hands-on live browser: phone 390×844 login/feed images passed; results displayed 48 wines, deselecting Red yielded 27 and updated recommendations. Desktop 1440×1000 reload showed 48/48. Both document widths equalled their viewports, screenshots were visually inspected, and sign-out returned to the login form before tab closure.
- Captured desktop results console had no warnings/errors. Production error-log query from 03:25:50 UTC returned one login request with `refresh_token_not_found` (HTTP 200); subsequent fresh sign-in and sign-out succeeded. This is an observation, not an established dependency regression or a claim of zero server errors. [Deployment/browser/log evidence](../evidence/b04c-release.json).
- Native coverage remains unavailable: no simctl/Xcode or Android SDK/emulator. Prior Expo web and Hermes exports are fallback coverage, not native device acceptance. No binary/OTA deployment occurred. Recovery delivery/password changes and native deep-link stress were not exercised.

## Release state
- **Merged:** PR #98 at 2026-09-13 03:25:06 UTC, merge `a0a95642e0d632f6562760702a171438a984a875`.
- **Web deployed:** primary Vercel `dpl_ETLBU2jPWkBR1DVctLZN1PgCE3VZ`, Ready, production alias [cellarsnap.app](https://cellarsnap.app). Git-SHA filtered deployment metadata and build log confirm that merge and Next 16.3.5.
- **Migration:** none required or applied. Preserve prior live privacy/auth SQL.
- **Live verification:** completed above. One disposable scan and 48 child wines removed; baseline scan retained; no entry saves/account changes. [Cleanup evidence](../evidence/b04c-release-cleanup.json).
- **Mobile distribution:** dependency code merged, native build/QC/release outstanding. Web deployment does not distribute native dependencies.
- **Rollback:** redeploy the prior known-good web release if a regression requires it; this would restore older dependency exposure. No SQL/data rollback is needed for this slice. Later docs-only merges may redeploy the same product tree; do not mistake them for further product changes.

## Workspace and environment
Preserve preexisting modified `tsconfig.json`, untracked `cellarsnap-fix-plan.md`, `cellarsnap-qa-report.md`, and nested `.claude/worktrees/agent-a251821a0b01f63dc/`. Champagne Daylight draft PR #75 remains untouched. No environment files changed; no local test servers started. Browser session signed out, temporary tab closed and viewport override reset. Optional screenshots/logs are under `/tmp/cellarsnap-b04c-release/`; checked-in sanitized evidence suffices to resume.

## Next slice
1. Repair the residual router decoder with verified module/API compatibility and malformed URL/auth-callback tests, including native deep links when a runtime is available.
2. Resolve xcode/uuid through a tested tooling contract; refresh upstream advisory evidence. Arrange compatible native rebuild and device/simulator QC before distributing the mobile dependency update.
3. Keep AUD-01, AUD-06/QC-01 and OPS-01 visible as separate unresolved work. B05 schema/tooling remains the next broad batch; QC-10 belongs to B11. [Hub](../README.md) and backlog now reflect the completed web release.
