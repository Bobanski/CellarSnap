# B04d dependency compatibility QC — September 13, 2026 UTC

Scope: AUD-08, issue #97, PR #100. Product commit `bd40acd78712082c5e56c40c7208a5b3e3820785`, based on main `05d9e7b`. No schema or UI behavior changes. Subsequent documentation commits do not change the tested product.

## Dependencies and automated evidence
- Refreshed upstream advisories [decoder](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) and [UUID](https://github.com/advisories/GHSA-w5hq-g745-h8pq). Patched versions are decoder 0.5.0 and UUID 11.1.1 (CommonJS-compatible).
- Expo Router 56.2.20/query-string 7.1.3 retain a callable CommonJS decoder. The private local package records upstream source/version/license/tarball integrity and explicitly documents its export adaptation plus literal replacement. The test reverses all three edits and checks upstream SHA-256. This is reviewed vendored code; npm audit alone cannot establish its correctness.
- Initial transitive-only relative file override produced a broken npm symlink despite a zero audit. Corrected with a direct local dependency plus `$decode-uri-component` override. Clean `npm ci`, `npm ls`, actual query-string loading, and GitHub mobile CI passed on the final structure.
- Initial stress test found upstream 0.5.0 throws a regex-size SyntaxError on a 16,384-byte malformed run followed by `%41`. Replaced regex construction with equivalent `replaceAll` on percent/hex literal keys; regression passes for 256, 4,096, and 16,384 bytes in a 5-second-killed child process (about 30 ms locally including startup). The process timeout also guards reintroduction of exponential decoding.
- **7 dependency contracts passed**: provenance/export, valid/malformed Unicode, query/fragment/repeated-key round trips, bounded malformed runs, installed native URL extraction + React Navigation parser composition, UUID v4/buffer bounds, and real PBX project edit/write/reparse. Added to mobile CI rather than the web job, which does not install mobile dependencies.
- **256 existing isolated tests passed**; web/mobile lint and TypeScript passed; Next production build passed. Root/mobile full audits both zero, down from 14 mobile moderate entries. Root lockfile unchanged.
- Expo compatibility check and fresh web/iOS/Android Hermes exports passed (3.3/5.6/5.9 MB respectively). No claim of a native build or performance improvement.
- Disposable iOS prebuild passed using explicit `expo-template-bare-minimum@56.0.35`, without dependency/pod installation. Initial rehearsal selected latest SDK 57 and was launched from the wrong cwd (relative icon failure); discarded/recreated temporary iOS output, pinned SDK 56 template, reran from the fixture root successfully. Application workspace/native directories were never modified.
- GitHub CI `34736183698`: both jobs passed on product head; working `cellar-snap` preview passed. Duplicate `cellarsnap` preview failure remains OPS-01.

## Hands-on browser QC
Local optimized Next at 3001, fresh exported Expo web through static/API proxy at 8083. Designated account A, existing read-only feed content; no entry/scan/account writes. Nonexistent recovery identifier used to avoid delivery.

- Expo 390×844: sign-in, feed, All/My Circle filter, menu/sign-out passed. Desktop 1440×1000: filtered feed and account menu passed; document width 1440. Responsive screenshots visually inspected.
- Expo recovery link and nonexistent-identifier submission navigated to reset-password. No credentials were changed and real email delivery/OTP redemption was not tested. At fixed phone size the form rendered, but document width was 450 versus viewport 390; root top/scrollY were 0 in this run. Added evidence to existing QC-10; it does not supersede prior displaced-root reproduction.
- Direct `/auth/callback?fixture=` with 2,048 `%FF` bytes plus `%41` returned to sign-in promptly, no freeze. Fresh designated-account login afterward passed. The callback had no real token/code; this is malformed-link containment, not recovery-link redemption or native OS deep-link acceptance.
- Next: phone login/feed images and desktop/phone visual layout passed; phone document width 390. Account-menu sign-out returned to login. No captured Next browser warnings/errors or server errors in local log.
- Expo captured one generic console `Event` error at 03:41:55 UTC; no stack/message identifies its cause. Login/navigation afterward passed. Do not claim zero Expo errors. No other captured decoder/module runtime error.

## Existing issues found while checking
- **QC-12**: Expo single-photo feed image blank despite loaded bytes. Candidate and prior B04c export both reproduce at the same phone viewport/account: label image naturalWidth 3024, rendered height 0. Prior-build comparison rules out this dependency slice as the cause. The static Image uses height 100% under an unsized Pressable (`feed/index.tsx`); verify that layout cause in B11. Next shows the same image correctly. No fix mixed into B04d.
- QC-01 raw mobile public ratings and QC-05 route-group headings remain visible. QC-10 responsive recovery overflow remains open.

## Coverage and cleanup
No working simctl/Xcode, Android SDK, adb or emulator available. Hermes exports, JS native-link helper tests and PBX generation are **not native acceptance**; no camera, real device callback, pods/native compile, binary or OTA distribution performed. AUD-08 stays Partial for that acceptance/distribution boundary.

Both browser sessions signed out. No database fixtures needed cleanup. Environment files unchanged. Temporary services may remain for B05a during this session; final handover records shutdown. Optional screenshots and logs in `/tmp/cellarsnap-b04d/`; this textual reproduction is sufficient without them. Do not commit signed URLs or account secrets.
