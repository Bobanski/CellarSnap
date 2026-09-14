# B11a–B11c / B01 release handover — September 14, 2026

## Objective and IDs

Completed the five-finding session authorized by the owner: QC-11 empty scan handling, QC-18 web editor labels, QC-19 phone profile wrapping, and final release verification of B01's AUD-17 grape query and AUD-27 cache-batch early return. All five are **Closed**. [Issue #160](https://github.com/Bobanski/CellarSnap/issues/160), [application PR #161](https://github.com/Bobanski/CellarSnap/pull/161).

Recorded one separate pre-existing issue, **QC-20 / P2 / Open**: the mobile recommendation-notes caller omits bearer authentication and the configured API host. No unrelated implementation was added. The canonical backlog now contains **13 Closed, 21 Partial, 35 Open, 2 Needs triage, 1 Not reproducible = 72**, versus 8 Closed / 71 before this session.

## Resume here

Application merge `83454a1816bcc3e95990b75c114a81f481cc0d8f` is deployed and live-verified. The source candidate `6435c31c8253414c996e5a967e167846e560d178` has the exact same tree, `db98c8c212d05f66e7d66ccdc5e76639eaca6cdd`. Release documentation is published on `chore/b11-release`, based on that merge; inspect its PR/main state before continuing. The preceding privacy documentation PR #159 was also marked merged when #161 incorporated its ancestor.

Start the next implementation from current main and the [canonical backlog](../backlog.md). The next priority remains AUD-01's retained historical photo capability retirement coordinated with AUD-22 reconciliation. See [the prior privacy release](b02v-b02w-web-release.md) for the private verified backup, 198 retained historical objects and twelve pre-existing missing references. This session did not repeat or extend that rollout.

## State and decisions

- `src/server/listScan/readability.ts` centralizes the actionable unreadable-list error. Parsing rejects a normalized empty wine list before enrichment/scoring; the route independently rejects before saving history. Existing catch behavior returns 422. The web intake announces the error with `role="alert"`. No browser JavaScript execution was added to menu fetching.
- The existing web editor uses unique `useId`-based input/label associations, named control groups and explicit names for search/upload/crop controls. The location component forwards an optional input ID; grape search is named. Normal, bulk and grouped markup retain their existing save contracts.
- Public profile identity flex items can shrink/wrap; unbroken display/real-name text wraps within the viewport without losing the accessible name.
- AUD-17/AUD-27 required release evidence for existing B01 code. Added a meaningful all-terminal batch regression; retained all-hit zero-preference/palate-load and direct-override tests. No scoring weight change or broad scoring refactor.
- Native acceptance remains deferred to the unlaunched mobile product by owner. QC-19 closes the current web profile finding; this does not certify a native profile implementation. No schema migration, storage operation or native distribution occurred.

## Verification

[Sanitized machine-readable evidence](../evidence/b11a-b11c-release.json) contains the exact live checks, error categories and cleanup results. Tests were run on `6435c31`; the final browser/API checks targeted `https://cellarsnap.app` serving `83454a1`.

Automated checks: **562 isolated tests pass**, web lint/types/production build pass, and [CI run 34878185105](https://github.com/Bobanski/CellarSnap/actions/runs/34878185105) passes both Web lint/tests and Mobile type/lint, including the existing schema/type checks. A fresh Expo web export passes. Four scanner regressions cover empty URL/image/PDF results and script-only HTML; the all-terminal score regression asserts no preference/palate work. Image/PDF empty handling is automated route/parser coverage; live upload/camera/file-picker acceptance was not repeated in this slice.

Actual Chromium browser QC used designated test accounts and disposable fixtures at **1440×1000 desktop** and **390×844 phone**:

| Finding | Before / final live acceptance |
|---|---|
| QC-18 | Baseline Notes has no accessible name. Final normal editor names every visible enabled field with unique IDs; clicking Notes focuses it and Tab reaches Rating. Detail/location/date/privacy sections, bulk wine/detail names and grouped title/type labels pass. Normal notes/rating edits save through the real UI on both sizes and match database values. Bulk/group checks cover naming/focus rather than a new claim about their broader lifecycle/save correctness. |
| QC-19 | Baseline unbroken profile name is visibly clipped. Final long display-name and projected real-name text remains within the viewport (phone text right edges 360/357 versus width 390), with full accessible text, no document overflow and keyboard-accessible back control. Profile changes are restored exactly. |
| AUD-17 | Syrah API personal count/average matches the owner rows joined through `grape_varieties`: 3 wines / 95.5 after desktop save, then 3 / 96 after phone save. Browser counts render correctly. Independent post-cleanup production check returns the original 2 / 98 and matches the database. |
| AUD-27 | A disposable cached sentinel is returned unchanged, missing/terminal entries return per-item failure, and mixed cached/direct overrides preserve request order and do not inherit the sentinel. Direct route checks supplement automated proof of zero preference/palate loads; no current UI caller of the batch wrapper was found. |
| QC-11 | Script-only `https://restaurantbeck.com/wine.html` formerly saved a 200/zero-wine result. Final web and cookie-free Expo return 422, keep intake/retry available, display upload/readability guidance and add no scan history. Retrying `https://www.maisonharlem.com/menu/wine-list/` returns 200/48 wines and renders populated recommendations/results. Both phone and desktop layouts were visually inspected. |

Useful screenshots: [phone profile](../evidence/b11-profile-phone.png), [desktop editor](../evidence/b11-editor-desktop.png), [phone scan error](../evidence/b11-scan-error-phone.png), [desktop populated results](../evidence/b11-scan-results-desktop.png), [Expo phone results](../evidence/b11-expo-results-phone.png). Profile evidence is clipped to the synthetic header to exclude unrelated tester content.

Expo testing used a newly exported build and local static server, with only API traffic proxied to primary production and **all cookies stripped**. Login and parse use the real bearer session. This is web-runtime mobile-code coverage, **not native device testing**. `xcrun simctl list devices available` fails because simctl is unavailable; neither `adb` nor `emulator` is installed on PATH. No installed iOS/Android runtime could be exercised.

Final web QC reports zero page exceptions; its only HTTP/console error is the intentional 422. Expo reports zero page exceptions, the intentional 422 and the separately confirmed **QC-20 401** on optional recommendation notes. The latter request lacks Authorization; parse and populated match recommendations succeed. Both affected notes files are unchanged from prior product `90e4dd2`. Existing Expo `(app)` routing header remains QC-05. Local owner-fetch diagnostics remain under AUD-50. A bounded Vercel runtime stream during live QC returned no records; this is not comprehensive server-log coverage. The duplicate `cellarsnap` project still fails for missing Supabase environment configuration (OPS-01); primary `cellar-snap` succeeds.

Harness issues were corrected and retested: the Expo export initially reused stale local Supabase configuration, fixed with a clean Metro export; a results URL assertion initially omitted `?scanId`, then matched the actual route; final scan screenshots wait for populated recommendations instead of a skeleton. These were test setup/assertion corrections, not product fixes or hidden acceptance failures.

## Release state

- **Implementation:** `6435c31`, three repairs and regression coverage; AUD-17/AUD-27 release verification.
- **Merge:** #161 merged September 14 at 18:09:15 UTC as `83454a1`; exact tested tree retained.
- **Code deployment:** primary Vercel `dpl_FhMJm4BtUWDhi8rCr3711hX5bgrY`, GitHub deployment `6443370150`, Ready/success. Deployment URL `https://cellar-snap-kzb7tqhb0-eitan-sneiders-projects.vercel.app`, primary alias `https://cellarsnap.app` verified.
- **Migration:** none. Prior privacy SQL/cutoffs remain as documented; no replay or data rollout.
- **Live verification:** all five closure checks pass after primary deployment, plus cookie-free Expo error/retry coverage. Session scans, entries, groups, grape links and score cache fixtures are removed. Independent cleanup proves no recorded fixture IDs remain; original profile identity values are restored. No photo/storage fixtures created.
- **Recovery:** revert the application change through a reviewed PR if a regression requires it; there is no migration/data rollback. Do not weaken authentication to bypass QC-20 or undo prior privacy cutoffs.
- **Documentation:** this branch contains only status/history/sanitized evidence changes, to be published through its normal PR. Subsequent documentation deployment does not require repeating the full application QC when runtime source is unchanged.

## Workspace and environment

Implementation worktree `/tmp/cellarsnap-five` is retained. Its application branch was `fix/b11-five-closures`; release records use `chore/b11-release`. Local `.env.local` and fixture snapshots remain private/outside Git. Local browser harness and raw logs are under `/tmp/cellarsnap-five-qc`; no credentials, original profile values or raw fixture identifiers are required to resume from this handover.

Owned Next port 3011, Expo proxy/static port 8083 and the bounded production log listener were stopped after QC. The original workspace's unrelated `tsconfig.json`, `cellarsnap-fix-plan.md`, and `cellarsnap-qa-report.md` were preserved byte-for-byte and checked by SHA-256. Preserve them when fast-forwarding current main documentation into that workspace. Draft design PR #75 is untouched.

## Next slice

1. Resume P0 AUD-01 / AUD-22 historical photo reconciliation with the prior verified backup and a bounded, reviewable plan; uncertain media must remain preserved. Prior referenced-photo and rating cutoffs are already live.
2. Continue AUD-13/15 group/lifecycle commands after the privacy residual, or select another explicit bounded backlog slice with the owner.
3. QC-20 is a future B11/B13 mobile API-adapter fix. Use the configured API host and current bearer token; verify generated notes plus expiry/error/retry in cookie-free Expo and native when available. Keep QC-05/06/10/12 and broader AUD-45/50 obligations visible.

The [hub](../README.md), [canonical backlog](../backlog.md) and [historical progress log](../../audits/remediation-progress.md) are updated. Closed count refers to verified release scope, not just code edits.
