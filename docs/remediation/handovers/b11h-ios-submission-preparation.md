# B11h iOS submission preparation handover — September 26, 2026

## Objective and IDs

B11h removes every review-preparation gap that can be closed without the Cluster Wine, LLC Apple team or an installed iPhone build. It advances QC-22 and OPS-03, records the newly confirmed QC-25 App Review gap, and preserves AUD-08 as Partial for native/dependency acceptance.

The branch `codex/ios-submission-readiness` started from merged main `966bc25` (PR #172); reviewed source `ad10698` merged as PR #173 / `9163bf7`. It adds source-controlled App Store listing/reviewer drafts; aligns web, mobile and public-site terms/privacy with Cluster Wine, LLC and `support@clusterwine.app`; makes the mobile Feedback control open the public support page; and re-encodes every native picker/camera image before transmission so source EXIF/IPTC metadata is not uploaded. Release icon and splash candidates are pinned to the reviewed deterministic generator output.

QC-25 moved to the separate B11i implementation after this release; it remains a submission gate until deployment, monitored operations and installed-native acceptance pass.

## Resume here

1. Continue B11i/QC-25 from its current handover: review/merge, then rotate OPS-04 before applying the moderation migration; configure/drill the primary/backup SLA alert and run installed-native report/block/filter acceptance.
2. B11h merge and web/static releases are complete. Keep the live legal/support pages aligned with the submitted build.
3. Review the five Expo SDK 57 patch updates reported by `npx expo install --check` (`expo`, image manipulator/picker, linking and router) as a small dependency slice. Do not update Router without rerunning its installed-consumer compatibility contract.
4. When the company Apple team is available, recreate/verify the bundle identifier and app record on that team, configure protected EAS credentials, produce a store build, and run the installed-iPhone/TestFlight matrix. Use a real GPS-tagged photo to verify the signed app's re-encoded upload has no source location metadata.
5. Create the non-expiring synthetic review account, capture screenshots only from the accepted build, reconcile the packet with App Store Connect, and submit explicitly.

## State and decisions

- Candidate listing values and exact field limits live in `docs/APP_STORE_SUBMISSION_PACKET.md`; credentials and reviewer passwords must never enter Git.
- Public privacy text now names the actual infrastructure/AI providers and distinguishes native metadata stripping from the web venue-metadata path.
- Web and mobile terms render one shared policy source. The separate static site carries equivalent text because it is deployed independently.
- Native images are normalized to JPEG through Expo ImageManipulator on new-entry, add-photo, avatar, wine-list and collection-cover paths before upload/AI/API transmission. PDFs and URL scans are unchanged.
- The image-manipulator iOS implementation reads orientation then emits new JPEG bytes through `UIImage.jpegData`; installed-device verification is still required before claiming signed-build acceptance.
- No production database, Storage, Apple account, EAS credential, App Store Connect record or reviewer account was changed in this batch. The web and static legal/support changes were released after review.

## Verification

Automated checks on the B11h working tree:

- 597/597 isolated application tests passed.
- 49/49 schema/tool checks passed; database type contract passed.
- Web and mobile typechecks and lints passed.
- Mobile release contract passed 7/7, dependency contract 7/7 and tooling contract 3/3.
- Root and mobile clean installs reported zero vulnerabilities.
- Environment-injected Next production build passed all 94 routes.
- Environment-injected iOS production export bundled 1,778 modules and produced the Hermes bundle in `/private/tmp/cellarsnap-ios-ready-export-20260926`.
- `npx expo install --check` is advisory-failing because five newer SDK 57 patch releases are available. This is recorded for the next bounded dependency slice, not represented as an export failure.

Hands-on browser/mobile-web QC:

- Next `/terms` passed at 390×844 and 1440×900: company text present, no horizontal overflow, no console/page errors.
- Static `privacy.html`, `terms.html` and `support.html` passed at 390×844 and 1440×900: HTTP 200, correct titles, no overflow or browser errors. Screenshots are retained locally under `/private/tmp/cellarsnap-ios-ready-qc`.
- Expo web at 390×844 passed age gate and mobile terms; Cluster Wine, LLC was present and the old CellarSnap identity absent.
- The designated disposable E2E account signed in, opened the phone-size menu, exposed Feedback and opened `https://clusterwine.app/support`; no console/page errors were captured. Local web sign-in required pointing the Expo test runner at the active local API and disabling browser CORS enforcement because the production native transport is not a same-origin browser flow.
- No iOS simulator/runtime or Android emulator is installed. This is responsive Expo-web coverage, not native acceptance. Camera/library permissions, real photo metadata removal, Sign in with Apple, account deletion token revocation, native screenshots and TestFlight installation remain untested.

## Release state

- Implementation: reviewed source `ad10698`; PR #173 merged as `9163bf7`.
- Merge: complete.
- Web app deployment: complete on the primary project; `https://cellarsnap.app/terms` and `/privacy` passed phone/desktop live verification.
- Static marketing/legal deployment: complete on `cluster-site` as `dpl_AL1PFwmShqAvoSAtkGT3ZbqmwMoe`; `https://clusterwine.app/privacy`, `/terms`, and `/support` passed phone/desktop live verification.
- Database migration/data mutation: none.
- Native/EAS build or upload: none.
- App Store Connect metadata, TestFlight, review submission: none.
- Historical retirement from merged PR #172 remains undeployed/unexecuted; zero production deletes. OPS-04 password rotation still precedes any retirement operation.

Rollback is a source revert for policy/UI/sanitization changes. Do not restore inaccurate public disclosures after deployment; if runtime metadata stripping must be rolled back, first restore accurate disclosure and block affected uploads rather than silently transmitting source metadata.

## Workspace and environment

Work is isolated at `/private/tmp/cellarsnap-ios-ready`. The original checkout's modified `tsconfig.json` and untracked user files remain untouched. Local services used ports 3010 (Next), 8085 (Expo web) and 8090 (static site); stop them at handoff. Secrets were sourced only from the existing ignored environment file and were not copied to the worktree, logs or evidence.

Local visual evidence is disposable and not required to resume:

- `/private/tmp/cellarsnap-ios-ready-qc`
- `/private/tmp/cellarsnap-ios-ready-export-20260926`

## Next slice

The next code blocker is B11i/QC-25, followed by the bounded SDK 57 patch review. The external Apple path is enrollment/invitation, agreements, company bundle/app ownership and protected signing credentials. Apple becomes the universal blocker only after QC-25, patch review and all non-native release checks pass; installed-native acceptance necessarily remains on the Apple path.
