# iOS PR merge and web release — September 22, 2026

## Objective and IDs

Review and merge #165, #167 and #168 after application CI/QC. Scope: AUD-01/AUD-22 archive source, B11d–B11f/B04e mobile repairs, QC-22 privacy permission/disclosures and AUD-08 dependency patch. All three are merged. Queue remains **76 records / 15 Closed**; remaining native and hosted archival criteria prevent additional closures. Design draft #75 is untouched.

## Resume here

Continue from [iOS release gates](../ios-launch-readiness.md), [canonical backlog](../backlog.md) and the [archive runbook](../b02y-protected-photo-archive.md). The merge question is resolved: owner explicitly approved treating OPS-01's failing duplicate Vercel project as nonblocking. Main is `2205a5c`; no pending source-merge permission is needed. Source approval does not apply the archival migration or certify native acceptance.

## State and decisions

- #167 merged as `1427ebd72268f8514255bb62149ef5f6140868df`; #168 retargeted to main and merged as `6f69d8360b6a2921f942a7387825c23e9785fda9`.
- #165 integrated the reviewed changes at `023bfe7a8b66edd05ae61ebdc2e4a3310b753dc2`, preserving both documentation histories. No runtime conflict. Fresh combined checks passed; merged as `2205a5cf41fb602d1c37ddc4a83408c265cf5200`.
- All merges used the checked head SHA and ordinary merge commits; no admin/bypass flags. Primary `cellar-snap` checks passed. Duplicate `cellarsnap` remains OPS-01 with missing environment configuration.
- The archive implementation is dormant operator/schema source: no app-route dependency, migration application, historical copy or retirement. Nine unresolved originals remain held; preservation is not permission to delete.

## Verification

- [Combined CI](https://github.com/Bobanski/CellarSnap/actions/runs/35749023957): **597 isolated tests, 47 schema/tool checks, 7 dependency and 3 tooling contracts**, web/mobile type checks and lint pass. Primary preview Ready. Fresh local PostgreSQL 17.6 catalog/race replay also passed in the [review checkpoint](ios-pr-merge-review.md).
- Production `https://cellarsnap.app` was Ready at `6f69d83`, deployment `dpl_GP91dZJS5JzJiNzAunT1fmKkV6rS`; build logs confirmed that commit. Web/mobile/shared/package trees are identical at final archive merge `2205a5c`. Final main deployment `dpl_DBDLDMaPuiYA3CvQt6GJxyWd9CKK` is Ready; build log confirms `2205a5c`, public privacy returns HTTP 200. Interactive flows were tested at `6f69d83`, not repeated on the identical application tree.
- Actual Chromium desktop **1440×1000** and phone **390×844**, web cookie auth and Expo web bearer auth against production: policy/controls fit; intentional failed save retains off; keyboard retry enables; reload retains choice; revoke immediately denies the unchanged bearer token; manual editor remains available with AI disabled. Four intentionally injected 503 responses were the only HTTP/console errors; zero page exceptions.
- Visually inspected [web desktop](../evidence/ios-live-privacy-desktop.png), [web phone](../evidence/ios-live-choice-phone.png), [Expo desktop](../evidence/ios-live-expo-desktop.png), [Expo phone](../evidence/ios-live-expo-phone.png). Expo API proxy strips cookies; requests use bearer credentials.
- A bounded 45-second Vercel runtime-log capture yielded no application records, so complete server-log coverage is unavailable. Actual API responses and browser errors were checked. [Sanitized evidence](../evidence/ios-merge-release.json).
- Designated test account only: no entries/photos created; original app metadata restored exactly and generated session signed out. No ordinary account or historical Storage mutation.
- Command Line Tools only; `simctl` and Android tooling unavailable. Expo is browser fallback, **not native acceptance**. Apple sign-in/camera/picker/native EXIF/VoiceOver and store-signed workflows remain unverified.

## Release state

All three source PRs merged. Matching privacy backend/web deployed and live-verified; mobile source merged but no new store binary, TestFlight upload or App Review submission. `20260922063629_protected_photo_archive.sql` remains unapplied. AUD-01 stays P0/Partial, AUD-22 Open, QC-22/AUD-08/OPS-03 Partial, QC-21 Implemented — QC pending. Keep the consent-enforcing backend in place for supported clients; rolling it back can restore unconsented AI processing. Archive source can be reverted without data recovery because no hosted archive operation ran.

## Workspace and environment

Original workspace's modified `tsconfig.json` and two untracked QA/fix-plan files are untouched. Worktrees `/tmp/cellarsnap-ios-launch`, `/tmp/cellarsnap-pr167-review` and `/tmp/cellarsnap-progress` remain. Release continuity is on `chore/ios-merge-release`. Private scripts/session/logs under `/tmp/cellarsnap-merge-release` are not repository evidence; never commit secrets. QC proxy is stopped at handoff. Existing local-only Expo configuration is for QC and must not be used for a store build.

## Next slice

1. Finish Apple authentication/production provisioning, verify App Store Connect record and build the final main commit using the production EAS environment. Record actual build ID/image; no `--latest` upload ambiguity.
2. Test that signed build on an iPhone/TestFlight, including first/repeat/cancelled Apple login, scan, privacy/consent, entry/photo lifecycle, deletion and report/block. Record device/OS and failures.
3. Complete provider retention/contact/logging/native EXIF answers, final listing/artwork/screenshots, App Privacy and dedicated reviewer access. Uploading a binary and submitting for review are separate steps.
4. Continue AUD-01 via the reviewed archive runbook with explicit hosted SQL/copy/retirement boundaries and verified backups; retain unresolved originals. Do not infer P0 closure from this merge.
