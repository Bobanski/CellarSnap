# B04h/B11g iOS submission readiness — September 22, 2026

## Objective and IDs

Move the merged iOS launch source toward an App Store-reviewable binary without claiming Apple-account or native-device work that has not happened. Scope: AUD-08 (native runtime dependency risk), QC-24 (unused sensitive permissions), QC-22 (generated privacy declarations) and OPS-03 (store gates). Base is main `d57a585`; source candidate `8ad26f2` is [PR #170](https://github.com/Bobanski/CellarSnap/pull/170) on `fix/ios-submission-readiness`. Queue is **77 records / 15 Closed**.

## Resume here

Start with [iOS release gates](../ios-launch-readiness.md), the [submission runbook](../../IOS_SUBMISSION_RUNBOOK.md) and the [canonical backlog](../backlog.md). PR #170 has green Web/Mobile CI and primary `cellar-snap` preview; the known duplicate `cellarsnap` deployment fails under OPS-01. Do not build or submit an older internal binary. The next executable gate requires merge, verified Apple signing and an App Store Connect app record/API key; no secret should be committed or pasted into documentation.

## Implemented

- Upgraded the unshipped mobile candidate from Expo SDK 56/RN 0.85.3 to Expo 57.0.24/RN 0.86.3 and pinned the matching `expo-template-bare-minimum@57.0.26` production prebuild. This moves off Expo's documented Hermes V1 memory/startup regression family.
- Added an app-level iOS privacy manifest declaring the source-reviewed linked/non-tracking data types and the required-reason API union found across installed native dependencies. App Store Connect answers and signed-archive inspection remain separate.
- Disabled image-picker microphone/Android audio-recording and secure-store Face ID declarations because the app records no audio and does not request biometric secure-store access. Camera/photo-library descriptions remain.
- Added four iOS release-configuration contract tests and made them part of Mobile CI. They lock the store profile/template, bundle/build/Apple Sign In, minimized permissions, privacy data types and required-reason APIs.
- Updated the privacy draft, release gates and submission runbook with the actual SDK 57 candidate and current App Store Connect credential failure.

## Verification

- Existing application suite: **597 passed**. Schema/tool suite: **47 passed**. Web lint, web typecheck and database type contract pass.
- Mobile: dependency contracts **7 passed**, tooling contracts **3 passed**, release contracts **4 passed**; typecheck and lint pass. `expo-doctor` reports **21/21 checks passed**. Mobile audit reports zero vulnerabilities.
- Production EAS environment all-platform export succeeds for web, iOS and Android. Resolved hosts are the intended public web API and Supabase project; no secret values are recorded here.
- Disposable clean iOS prebuild succeeds with SDK 57 template, deployment target 16.4, `com.cellarsnap.mobile`, version 1.0.1/build 3, Apple Sign In entitlement and generated `PrivacyInfo.xcprivacy`. The generated plist contains camera/photo usage descriptions and no microphone or Face ID description; Android output has no `RECORD_AUDIO` permission.
- Actual in-app-browser visual inspection at **390×844** and **1440×1000** confirms the SDK 57 age-gate screen fits and has zero console errors/warnings. Deeper interactive browsing was not performed because crossing the age-verification gate requires the user's age assertion. Previous main-candidate production desktop/phone and Expo-browser flows remain recorded in the release handover, but are not relabeled as SDK 57 acceptance.
- Full Xcode, `simctl`, Android SDK/emulator and CocoaPods are unavailable on this host. Therefore no native compile, simulator/device install, Apple login, camera/picker, native EXIF or VoiceOver acceptance was performed.

## External release state

- EAS is authenticated and the production environment/profile resolves correctly. Existing build history contains no production/store build; the latest inspected binary remains internal preview 1.0.1/build 2. Submission history is empty.
- App Store Connect submission status cannot find `com.cellarsnap.mobile` with any API key currently available to EAS. Production signing previously stopped at Apple 2FA/provisioning before upload. No EAS build job, IPA, TestFlight upload or App Review submission was created in this slice.
- Final product identity and listing remain an owner decision: config says Cluster, older material still uses CellarSnap, assets are documented as placeholders and Terms still describe a friends-and-family product. Do not silently choose the final name/artwork or rewrite legal scope.
- AUD-01 protected archive migration/copies/retirement remain pending and were not touched.

## Workspace and rollback

The user's original workspace changes (`tsconfig.json` and two untracked planning/report files) remain untouched. Work is isolated in `/tmp/cellarsnap-ios-submission-push`. Generated native/export directories are outside the repository and contain no release artifact. Rollback is the candidate commit/PR; no database, storage, EAS build or App Store state changed.

## Next actions

1. Review and merge this source candidate after CI. Re-run EAS config at the merged SHA.
2. In the real Apple account, verify/create the `com.cellarsnap.mobile` App Store Connect record, agreements/team and Sign in with Apple capability; configure a protected scoped App Store Connect API key or complete authenticated interactive submission setup.
3. Build the exact merged SHA with the production profile. Record EAS build ID, Xcode/iOS SDK image, signing result and a privacy report from the signed archive.
4. Install that exact build on an iPhone/TestFlight and complete the launch matrix in the release gates, including Apple first/repeat/cancel, privacy allow/decline/revoke, camera/library, scanning, entry/photo lifecycle, report/block and account deletion. Capture store screenshots only from the accepted build.
5. Resolve final product name, artwork, Terms/release posture, provider retention/native EXIF answers, App Privacy questionnaire and dedicated reviewer account. Upload the verified build ID, complete metadata, then separately submit it for App Review and record the receipt/status.
