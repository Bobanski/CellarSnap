# B11h iOS submission preparation handover — September 26, 2026

## Objective and IDs

B11h removes every review-preparation gap that can be closed without the Cluster Wine, LLC Apple team or an installed iPhone build. It advances QC-22 and OPS-03, records the newly confirmed QC-25 App Review gap, and preserves AUD-08 as Partial for native/dependency acceptance.

The branch `codex/ios-submission-readiness` starts from merged main `966bc25` (PR #172); source `3d042de` is open as PR #173. It adds source-controlled App Store listing/reviewer drafts; aligns web, mobile and public-site terms/privacy with Cluster Wine, LLC and `support@clusterwine.app`; makes the mobile Feedback control open the public support page; and re-encodes every native picker/camera image before transmission so source EXIF/IPTC metadata is not uploaded. Release icon and splash candidates are pinned to the reviewed deterministic generator output.

QC-25 remains Open/P1: report and block flows exist, but public posts/comments have no reviewed server-authoritative objectionable-content filter and `content_reports` has no owned moderation queue, monitored notification path or response SLA. Do not submit to App Review until that separate slice and its operations are accepted.

## Resume here

1. Review, merge and deploy the B11h PR. Deploy the static `site/` project separately so `clusterwine.app/privacy` receives the updated policy, then live-verify `/privacy`, `/terms` and `/support` at phone and desktop widths.
2. Start a separate QC-25 implementation batch. Inventory all public post/comment write paths; add server-authoritative filtering with adversarial and false-positive tests; create an owned report-review/notification procedure; and run installed-native report/block/filter acceptance.
3. Review the five Expo SDK 57 patch updates reported by `npx expo install --check` (`expo`, image manipulator/picker, linking and router) as a small dependency slice. Do not update Router without rerunning its installed-consumer compatibility contract.
4. When the company Apple team is available, recreate/verify the bundle identifier and app record on that team, configure protected EAS credentials, produce a store build, and run the installed-iPhone/TestFlight matrix. Use a real GPS-tagged photo to verify the signed app's re-encoded upload has no source location metadata.
5. Create the non-expiring synthetic review account, capture screenshots only from the accepted build, reconcile the packet with App Store Connect, and submit explicitly.

## State and decisions

- Candidate listing values and exact field limits live in `docs/APP_STORE_SUBMISSION_PACKET.md`; credentials and reviewer passwords must never enter Git.
- Public privacy text now names the actual infrastructure/AI providers and distinguishes native metadata stripping from the web venue-metadata path.
- Web and mobile terms render one shared policy source. The separate static site carries equivalent text because it is deployed independently.
- Native images are normalized to JPEG through Expo ImageManipulator on new-entry, add-photo, avatar, wine-list and collection-cover paths before upload/AI/API transmission. PDFs and URL scans are unchanged.
- The image-manipulator iOS implementation reads orientation then emits new JPEG bytes through `UIImage.jpegData`; installed-device verification is still required before claiming signed-build acceptance.
- No production database, Storage, Apple account, EAS credential, App Store Connect record or reviewer account was changed in this batch.

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

- Implementation: pushed on `codex/ios-submission-readiness` as `3d042de`; PR #173 is open.
- Merge: pending.
- Web app deployment: pending; the primary Vercel project should deploy after merge.
- Static marketing/legal deployment: pending and separate (`site/` project).
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

The next code blocker is QC-25, followed by the bounded SDK 57 patch review. The external Apple path is enrollment/invitation, agreements, company bundle/app ownership and protected signing credentials. Apple becomes the universal blocker only after QC-25, patch review, live policy deployment and all non-native release checks pass; installed-native acceptance necessarily remains on the Apple path.
