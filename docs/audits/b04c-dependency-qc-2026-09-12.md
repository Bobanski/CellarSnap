# B04c dependency review and QC — September 12, 2026

Scope: AUD-08 compatible dependency slice, issue #97 / PR #98. Tested product `588d49a`, base `1db7d80`; Node 22.14.0/npm 10.9.2 on macOS arm64. Session timestamps are September 13 UTC, September 12 America/New_York. No SQL changes. [Handover](../remediation/handovers/batch-04c.md).

## Advisory evidence and decisions
[Sanitized npm results](../remediation/evidence/b04c-dependencies.json) preserve before/after counts, dependency paths, ranges and advisory URLs. Registry metadata and actual installed consumers were inspected, not just severity labels.

| Tree | Before | After |
|---|---|---|
| Root, all | 13: 2 critical, 7 high, 3 moderate, 1 low | 0 |
| Root, omit-dev | 6: 1 critical, 4 high, 1 moderate | 0 |
| Mobile, all | 29: 1 critical, 12 high, 15 moderate, 1 low | 14 moderate |
| Mobile, omit-dev | Not captured before | 14 moderate |

Expo tools are installed beneath production-listed packages; omit-dev output does not mean every transitive is bundled into a native app. Mobile residual 14 entries propagate from decoder and UUID, described with exact next actions in the handover. Do not report 14 independent exploits or a fully clean mobile tree.

Sources reviewed: [Next image/AVIF advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4), [Next proxy prerequisite advisory](https://github.com/vercel/next.js/security/advisories/GHSA-6gpp-xcg3-4w24), [Expo upgrade guidance](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/), [decoder 0.5 release](https://github.com/SamVerschueren/decode-uri-component/releases/tag/v0.5.0), [Supabase npm guidance](https://supabase.com/docs/guides/security/npm-security), Supabase changelog markdown and npm package metadata. Config has no i18n/custom rewrites; Windows hosting doesn't describe Vercel. Image upload/processing is an actual server feature, so patched Sharp is directly declared even independently of Next optimizer prerequisites. Transitive XML packages serve EXIF/import parsing; Babel, lint and CSS/browser tooling are primarily build paths. Both classes were updated.

`npm audit fix --force` was never used. Selected updates stay within Next 16 / Expo 56; Sharp 0.35.4 is the deliberate security upgrade from 0.34.5, tested with actual codecs. Supabase CLI uses a patch tar override; Metro patch overrides remove its old image-size consumer. No client Supabase, OpenAI SDK, React or React Native upgrade was mixed in.

## Automated and build checks
- Both clean npm installs passed. Root native Sharp binaries installed; Supabase CLI postinstall archive extraction/checksum path worked. `supabase --version` returned 2.78.1; `--help` passed, without any remote CLI mutation.
- 256 isolated tests passed in 17.5 seconds, including six new native codec tests. Web and mobile TypeScript/lint passed. Initial web lint failed on two new Next navigation warnings; focused login annotations preserved behavior, lint/type/build were rerun successfully, and actual login was retested.
- Next production build succeeded; 91 static generation steps. Root tests/build use normal production code, not a mocked image library.
- Expo compatibility check passed. Fresh `expo export --platform all --max-workers 4` generated web JS (3.3 MB), iOS Hermes (5.6 MB), Android Hermes (5.9 MB). CLI progress emits NO_COLOR/FORCE_COLOR warnings; these are tool environment warnings, not app runtime failures.
- Native runtimes unavailable: xcrun cannot locate simctl; no Xcode app or Android SDK/adb/emulator. Native exports do not establish native compilation, signing, camera permissions, gestures, deep links or device behavior.

## Hands-on browser and HTTP checks
Local optimized Next server 127.0.0.1:3001 against the configured backend; existing designated account A. Disposable fixture scope only. Fresh Expo production static export through local 8083 proxy (web static 8082; API 3001). Process-only Expo API override; no environment-file mutation.

| Flow | Actual result |
|---|---|
| Desktop web, 1440×1000 | Login → feed, photos loaded; 81 image elements, zero completed broken images, no horizontal overflow. Results/recommendations rendered after reload. |
| Phone web, 390×844 | Loopback menu URL rejected with actionable error, scan controls re-enabled; public menu retry succeeded. |
| HTML scanning | Maison Harlem returned 48 wines. Phone wine-type filter deselect White → 33/48; Done closed picker. Desktop reload returned 48/48. |
| PDF scanning | Real Soho House `lhb_pen-yen.pdf` → HTTP 200, 41 wines. Text extraction's recorded failure fell back to visual parsing successfully. Wine extraction counts are model-dependent; earlier B04b returned 42. |
| Web image upload/crop | Synthetic 600×900 label uploaded to AI preview; phone crop dialog rendered, Save crop closed it; preview decoded as 1200×1200. Removed fixture image and did not save an entry. |
| Crop HTTP | Anonymous 401, authenticated normal crop 200, zoom 2.5 crop 200, 32px image 422. Successful outputs decoded as 1200×1200 JPEG. |
| Web auth/recovery | Sign-out returned login; recovery navigation and desktop layout passed. No real recovery message/password change. |
| Expo auth | Age gate, designated login → feed, sign-out → login and recovery/back navigation passed. Signing out uses the existing shared backend session behavior; web re-login was tested afterward. |
| Expo fixed phone recovery | **Known failure QC-10 reproduced:** after fresh sign-in-page reload and recovery link at fixed 390×844, root height 844/top -160, scrollY 160; bottom light gap and document overflow. No viewport change between navigation steps. First multi-tab/default-1280 observation is separately named, not claimed as phone evidence. |
| Expo photo picker | Updated expo-image-picker opened the browser chooser, accepted the synthetic JPEG, rendered its thumbnail, and removed it with x. No scan submitted from that photo; no runtime warnings/errors. Tested at default desktop 1280×720. |
| Expo phone scanning | Loopback rejection rendered and retry controls enabled. Public retry returned 48/48 wines and recommendations; desktop 1440×1000 reload retained results with no horizontal overflow. |

Browser warnings: intentional scan-rejection warning, existing Maps non-async loader and legacy Places warnings (QC-04). No new web dependency runtime error. Existing Expo route-group headings (QC-05), numeric public ratings (QC-01) and pressable roles (QC-06) remain visible. QC-10 upgraded to Open, same stable ID, separate B11 scope.

Screenshots are local optional evidence under `/tmp/cellarsnap-b04c/`: `web-desktop-feed.png`, `web-phone-rejection.png`, `web-phone-results.png`, `web-desktop-results.png`, `web-phone-crop.png`, `web-desktop-recovery.png`, `expo-initial-recovery-gap.png`, `expo-phone-recovery-retest.png`, `expo-phone-rejection.png`, `expo-phone-results.png`, `expo-desktop-results.png`, `expo-photo-picker.png`. Names distinguish the initial default viewport from fixed phone retest. Screenshots containing account data are not committed.

## Release and cleanup
Product head `588d49a`: primary Vercel preview passed; duplicate Vercel project failed as tracked OPS-01. Both GitHub CI jobs passed at product head (run `34734788062`); primary preview `GJrERM6umsePi4CcofLChMP4k3vu` succeeded. PR is unmerged; production and native deployment/live acceptance are pending. Native binary/OTA was not released.

[Cleanup evidence](../remediation/evidence/b04c-cleanup.json): deleted exactly three captured disposable scans scoped to designated account A, with 137 child rows removed by existing cascade and zero fixture children remaining. The pre-existing one scan was retained. The label fixture was removed from the unsaved form; no entry/account changes were saved and no photo Storage persistence was invoked (new-entry persistence occurs on save). Test requests use ordinary limiter expiry; production buckets were not reset.

Temporary Next 3001, Expo static 8082 and proxy 8083 were stopped after QC. Browser sessions were signed out, tabs closed and viewport override reset; browser credential variables cleared. No environment files changed. Local optional evidence stays under `/tmp/cellarsnap-b04c/`; repository evidence excludes credentials, signed URLs and raw account contacts.
