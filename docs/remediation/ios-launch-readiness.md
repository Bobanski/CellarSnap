# iOS release readiness — September 26, 2026

This is a release gate record, not a certification that the app is ready for review. Owner now targets an iOS launch; historical handovers' web-only native deferral does not satisfy this launch. Track remediation in the [canonical backlog](backlog.md).

## Candidate

- Cluster, bundle `com.cellarsnap.mobile`, version `1.0.1`, iOS build `3`.
- EAS project `97b28ad8-6330-4762-9ca3-a9be0204b401`; production profile explicitly uses store distribution and the production environment.
- Current source base: main `966bc25` / #172, Expo SDK 57.0.24 / React Native 0.86.3, production prebuild template `expo-template-bare-minimum@57.0.26`. The upgrade removes the known SDK 56 Hermes V1 memory-regression exposure; Expo Doctor reports 21/21 checks passing. B11h submission preparation is on `codex/ios-submission-readiness` and is not yet merged or released.
- Last existing binary inspected: preview/internal build `d878c8d8-0c6f-43a9-8ec2-0b00d06c2f21`, version 1.0.1/build 2, September 14. It predates this candidate and is not an App Store binary.
- EAS production has the four expected public environment variable names. Verify resolved production API/Supabase hosts against the final build. Do not embed private keys or the local QC proxy.
- Store-build retry at main `ea88d83` (application candidate unchanged from `5e992af`) used current EAS CLI 24.8.0. Production environment and remote credentials resolved, then non-interactive setup stopped before job creation because the distribution certificate is not validated. Interactive inspection confirmed that the available Apple login resolves only a personal `Individual` team with ad-hoc credentials; the session was exited without changes. Cluster must ship from the Cluster Wine, LLC organization team. No EAS build ID, IPA, App Store upload or App Review submission exists.
- Production prebuild now pins the matching SDK 57 template. Disposable iOS generation succeeds with iOS 16.4 minimum, Apple Sign In entitlement, build 3 and an app privacy manifest. Generated configuration no longer requests unused Face ID/microphone access or Android audio recording. This is native project generation, not compilation/device acceptance.
- Privacy candidate: #167/#168/#170 are merged; #172 adds reviewed historical-source retirement guards without running deletion. B11h aligns company support/legal copy, prepares App Store metadata and re-encodes native picker photos before transmission so source EXIF/IPTC metadata is not uploaded. Matching backend/web for the earlier consent work is deployed; B11h is not. [Submission packet](../APP_STORE_SUBMISSION_PACKET.md).
- Code repairs: QC-20 notes bearer authentication/retry, QC-05 nested headers, QC-10 auth viewport, QC-12 single-photo size, scoped QC-06 accessible controls, QC-21 Apple nonce exchange.
- EAS has no production build and no submission. Submission status cannot resolve `com.cellarsnap.mobile` with any currently available App Store Connect API key. Verify/create the app record and add an appropriately scoped API key (or complete an authenticated interactive submission) before upload.

## Gates before review

| Gate | Evidence / next action |
|---|---|
| Store-signed binary | Build this exact candidate with `eas build -p ios --profile production --non-interactive`. A successful JS export or internal IPA is insufficient. Record EAS ID and build image/SDK. |
| Apple account and app record | Cluster Wine, LLC organization membership, Account Holder agreements and the `eitan@clusterwine.app` Admin invitation with Certificates, Identifiers & Profiles access must be verified. The existing `com.cellarsnap.mobile` identifier/credentials are on the personal team and must not be used for release; because no build has been uploaded, inspect its Sign in with Apple association and safely release it before recreating it on the company team. Then create the company App Store Connect record/`ascAppId` and protected submission key. The submit profile is empty; do not invent an app ID. |
| Native acceptance | No Xcode/simctl, adb or Android emulator here. Test the signed binary on an iPhone/TestFlight: first/repeat/cancelled Apple login, password sign-in/recovery and session restore; camera/library permissions, label scan and crop; create/edit/private ratings/photos; feed/group navigation; notes scan/retry; report/block; sign-out; account deletion using a disposable account. Record OS/device and result. Browser Expo coverage is not native acceptance. |
| Privacy retirement | AUD-01 remains P0/Partial. Archive SQL is live as `20260923140757`; all 189 eligible objects / 559,574,950 bytes are privately copied and verified, with all source bytes retained. B02z retirement machinery merged in #172 but is not hosted or run. OPS-04 password rotation precedes deployment. Preserve nine held originals, three missing-path records and existing backups. |
| Privacy disclosures | QC-22 Partial: #168 adds shared accurate policy and explicit AI Allow/Decline/Revoke, enforced server-side. B11h uses the company support channel, aligns the public policy and strips source image metadata from native picker uploads. Finish provider retention/logging checks, publish and live-verify the policy, test a real GPS-tagged iPhone photo, inspect the signed archive and enter/verify App Store Connect answers. |
| Listing and artwork | The [submission packet](../APP_STORE_SUBMISSION_PACKET.md) contains field-length-checked copy, links, age-rating inputs, screenshot plan and review notes. Icon/splash exactly reproduce the brand-guide generator and release tests pin their hashes; owner artwork/category/copy sign-off remains. Capture screenshots only from the accepted TestFlight binary. |
| UGC review readiness | QC-25 Open: report/block and public contact exist, but no reviewed objectionable-content filter or owned moderation-response operation was found. Implement and verify both before submission under App Review Guideline 1.2. |
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

Latest source/archive release and production acceptance: [current handover](handovers/b02y-archive-release.md). This does not satisfy the native/store gates above.
