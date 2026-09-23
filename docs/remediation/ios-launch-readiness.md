# iOS release readiness — September 22, 2026

This is a release gate record, not a certification that the app is ready for review. Owner now targets an iOS launch; historical handovers' web-only native deferral does not satisfy this launch. Track remediation in the [canonical backlog](backlog.md).

## Candidate

- Cluster, bundle `com.cellarsnap.mobile`, version `1.0.1`, iOS build `3`.
- EAS project `97b28ad8-6330-4762-9ca3-a9be0204b401`; production profile explicitly uses store distribution and the production environment.
- Current source candidate: `fix/ios-submission-readiness`, Expo SDK 57.0.24 / React Native 0.86.3, production prebuild template `expo-template-bare-minimum@57.0.26`. The upgrade removes the known SDK 56 Hermes V1 memory-regression exposure; Expo Doctor reports 21/21 checks passing.
- Last existing binary inspected: preview/internal build `d878c8d8-0c6f-43a9-8ec2-0b00d06c2f21`, version 1.0.1/build 2, September 14. It predates this candidate and is not an App Store binary.
- EAS production has the four expected public environment variable names. Verify resolved production API/Supabase hosts against the final build. Do not embed private keys or the local QC proxy.
- Store-build attempt at `1a06fd0`: failed before upload because production credentials are incomplete. Interactive setup reached Apple 2FA after the cached session expired; canceled cleanly and restored local QC environment. No new EAS build ID, IPA, App Store upload or App Review submission. Complete Apple authentication and production provisioning, then rebuild the final PR head.
- Production prebuild now pins the matching SDK 57 template. Disposable iOS generation succeeds with iOS 16.4 minimum, Apple Sign In entitlement, build 3 and an app privacy manifest. Generated configuration no longer requests unused Face ID/microphone access or Android audio recording. This is native project generation, not compilation/device acceptance.
- Privacy candidate: #167/#168 are merged; main `d57a585` includes account-wide AI permission and shared disclosures. Matching backend/web deployed and production desktop/phone web + Expo-browser checks passed. Merge this candidate before native distribution. ExifReader 4.41.1 patches a fresh advisory. [Current handover](handovers/b04f-b04g-ios-privacy.md).
- Code repairs: QC-20 notes bearer authentication/retry, QC-05 nested headers, QC-10 auth viewport, QC-12 single-photo size, scoped QC-06 accessible controls, QC-21 Apple nonce exchange.
- EAS has no production build and no submission. Submission status cannot resolve `com.cellarsnap.mobile` with any currently available App Store Connect API key. Verify/create the app record and add an appropriately scoped API key (or complete an authenticated interactive submission) before upload.

## Gates before review

| Gate | Evidence / next action |
|---|---|
| Store-signed binary | Build this exact candidate with `eas build -p ios --profile production --non-interactive`. A successful JS export or internal IPA is insufficient. Record EAS ID and build image/SDK. |
| Apple account and app record | Membership, App Store Connect record/`ascAppId`, role and agreements must be verified. EAS cannot currently resolve the bundle with any available App Store Connect API key; add verified credentials without committing secrets. The submit profile is empty; do not invent an app ID. |
| Native acceptance | No Xcode/simctl, adb or Android emulator here. Test the signed binary on an iPhone/TestFlight: first/repeat/cancelled Apple login, password sign-in/recovery and session restore; camera/library permissions, label scan and crop; create/edit/private ratings/photos; feed/group navigation; notes scan/retry; report/block; sign-out; account deletion using a disposable account. Record OS/device and result. Browser Expo coverage is not native acceptance. |
| Privacy retirement | AUD-01 remains P0/Partial. [PR #165](https://github.com/Bobanski/CellarSnap/pull/165) archive source is merged at `2205a5c`; SQL/copies and subsequent historical retirement remain pending. Preserve uncertain media and existing backups. |
| Privacy disclosures | QC-22 Partial: #168 adds shared accurate policy and explicit AI Allow/Decline/Revoke, enforced server-side. The SDK 57 candidate generates the source-reviewed app privacy manifest and removes unused microphone/Face ID declarations. Production desktop/phone web/Expo-browser consent acceptance passes. Finish provider retention/contact/logging/native EXIF checks, inspect the signed archive and enter/verify App Store Connect answers. Installed-native policy/permission acceptance remains required. |
| Listing and artwork | Confirm Cluster product name, final icon/splash (asset README still calls them placeholders), support URL/contact, category, age-rating questionnaire, screenshots from the tested native build, App Privacy responses and review notes. Current icon meets 1024×1024/no-alpha dimensions; that does not establish final artwork approval. Existing Terms still describe a friends-and-family test product; confirm that wording matches the intended release. |
| Reviewer access | Supply a dedicated review account with usable fixtures and working deletion/reporting paths; do not publish internal E2E credentials. Confirm private-beta gates do not obstruct review. |
| Upload versus review | `eas submit` uploads the store build to App Store Connect/TestFlight. Metadata, selected build and explicit App Review submission are separate. |

## Submission commands after gates

From `apps/mobile`, after the reviewed candidate is merged and Apple credentials/app record are verified, build it and upload its exact EAS ID (avoid `--latest`, which may select an internal build):

```sh
eas build --platform ios --profile production --non-interactive
eas submit --platform ios --profile production --id <verified-store-build-id>
```

Complete App Store Connect metadata, select that build, provide review access, choose release timing, and submit for App Review. Keep implementation, PR merge, backend deployment, binary build, TestFlight acceptance, upload and review state separate.

## Current platform references

Apple requires Xcode 26+/iOS 26 SDK for uploads since April 28, 2026: [SDK requirements](https://developer.apple.com/news/upcoming-requirements/?id=04282026a). Check the actual EAS build image. Expo documents [store builds](https://docs.expo.dev/deploy/build-project/), [iOS upload prerequisites](https://docs.expo.dev/submit/ios/) and [App Review as a separate step](https://docs.expo.dev/deploy/submit-to-app-stores/). These were reviewed September 22; recheck if the release slips.

Latest source merge and production acceptance: [release handover](handovers/ios-merge-release.md). This does not satisfy the native/store gates above.
