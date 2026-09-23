# B02y archive preservation / iOS release push — September 23, 2026

## Outcome and resume point

[PR #170](https://github.com/Bobanski/CellarSnap/pull/170) passed independent review and merged as `5e992af8cc80f1cbd50bcf2d8aeb9500009c0c22`. Primary `cellar-snap` deployment is Ready; the known duplicate `cellarsnap` deployment remains failed under OPS-01. The production iOS build reached remote credential setup on the exact merged tree and stopped before creating a job because Apple credential validation requires an interactive login/2FA. There is no production build ID, IPA, TestFlight upload or App Review submission.

The protected historical-photo archive is now hosted and populated. Exact migration `20260922063629_protected_photo_archive.sql` is live as `20260923140757`. All 189 reviewed unreferenced objects / 559,574,950 bytes are copied into the private archive with durable receipts and byte/hash/metadata/CAS proof. All source objects remain. AUD-01 stays P0/Partial because no retirement fence, deletion or regional old-capability verification exists. AUD-22 remains Open for nine held originals and three missing paths with no known bytes. Queue is **78 records / 15 Closed** after OPS-04 intake.

Resume with [iOS launch gates](../ios-launch-readiness.md), the [archive contract](../b02y-protected-photo-archive.md) and the [canonical backlog](../backlog.md). The next Apple step requires the owner to complete credential validation without sharing secrets. The next archive implementation is a separately reviewed retirement state machine; copied records are not deletion authority.

## Verification

- Independent #170 review: 597 application tests, 47 schema/tool checks, 7 dependency contracts, 3 tooling contracts, 4 release contracts, web/mobile typechecks and lint, mobile audits zero, Expo Doctor 21/21.
- Hosted archive catalog: private 25 MiB image-only bucket, restrictive anonymous/authenticated object and bucket policies, empty-at-install private RLS ledger, no PUBLIC/anon/authenticated/service-role ledger grants, four invoker-only functions with fixed search paths.
- Hosted disposable fixture: service cross-bucket copy and byte equality passed. Anonymous and authenticated raw/transform/sign/list/upload/copy-out/remove/bucket-discovery checks were denied or safely filtered; service re-read proved denied mutations did not change bytes. Cleanup restored 927 source objects, zero archive objects/ledger rows and zero fixture paths.
- Fresh read-only inventory: 927 objects, 939 paths, 699 reference cells and twelve missing references. All 882 preserved backup files / 2,320,713,813 bytes reverified. Dispositions remain 189 eligible archive objects, nine held originals and three missing paths without known bytes.
- Production preservation: 189/189 operations copied and committed; 559,574,950 receipt bytes; zero proof, destination, current-source or reference mismatches. Final source count remains 927; archive/ledger counts are both 189; no deletes or reference rewrites.
- Security advisors were checked before and after. The only archive delta is the expected informational private-RLS/no-policy notice; existing unrelated warnings remain. [Supabase linter guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- No new browser flow was affected by the archive schema/operator or #170 merge commit. #170's recorded Expo-browser desktop/phone visual check remains the UI evidence and is not relabeled as native acceptance. `simctl`, full Xcode and Android emulators remain unavailable.

[Sanitized evidence](../evidence/b02y-archive-release.json).

## Security incident / OPS-04

A Supabase CLI dry-run printed the database password into local tool output while discovering the remote query path. It was not committed, written to evidence or placed in a command argument, but it must be treated as exposed. Rotate the production database password through the owner account and update every protected consumer before release; verify application, migration and operator connectivity afterward. Do not paste the replacement into chat or repository files.

## Next actions

1. Owner: complete Apple authentication/2FA and verify/create the `com.cellarsnap.mobile` App Store Connect record/key. Re-run the exact merged production build and record its EAS ID/image.
2. Install the exact store build on an iPhone/TestFlight and complete Apple login, consent, camera/library, scan/crop, entry/photo/privacy, report/block, sign-out and deletion acceptance.
3. Rotate the exposed database password, update protected consumers and verify connectivity (OPS-04).
4. Implement historical retirement fencing with fresh source/archive/reference checks, deletion confirmation and independent regional raw/transformed denial. Do not include the nine held originals or three missing paths.
5. Resolve final name/artwork/Terms posture, provider-retention/native-EXIF answers, App Privacy, reviewer account, screenshots and metadata before explicit App Review submission.

## Workspace and rollback

The original checkout's modified `tsconfig.json` and two untracked planning/report files remain untouched. Work used an isolated worktree and a private mode-0600 journal. Disabling the archive operator is the safe rollback; never drop the populated ledger/bucket or recreate retired source keys. No archive retirement or iOS distribution occurred.
