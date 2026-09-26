# B02z historical retirement / iOS submission push — September 26, 2026

## Outcome and resume point

Historical archive retirement is implemented locally on `codex/b02z-historical-photo-retirement` from main `ea88d83`. The additive migration and operator add durable fencing, exact single-source deletion, base/original sibling-safe CAS and two-region raw/transformed CDN-denial evidence. Nothing is deployed and no production object is deleted. AUD-01 remains P0/Partial until independent review, password rotation, hosted migration, canary execution and all eligible operations reach verified. The nine held originals and three missing paths remain excluded.

The iOS production build was retried on exact `ea88d83` with current EAS CLI 24.8.0. Production environment names and remote iOS credentials resolved, then the command stopped before job creation because the distribution certificate is not validated for non-interactive builds. Interactive inspection authenticated the existing Apple ID and confirmed that EAS resolves only the personal `Individual` team and its ad-hoc credentials; the session was exited without creating or changing credentials. The intended publisher is the separate Cluster Wine, LLC organization team, so no personal-team build may proceed. Company enrollment/invitation, agreements, the company-owned bundle identifier/app record and company distribution credentials remain required. There is still no production build ID, IPA, TestFlight/App Store upload or App Review submission.

Resume with the [retirement contract](../b02z-historical-photo-retirement.md), [iOS launch gates](../ios-launch-readiness.md), [sanitized evidence](../evidence/b02z-historical-retirement-qc.json) and [canonical backlog](../backlog.md).

## Verification

- 597/597 isolated application tests and 49/49 schema/tool checks pass. The review follow-up makes verified regional evidence immutable while preserving identical lost-response retries; its focused and full schema regressions pass.
- PostgreSQL 17.6 complete replay has zero reviewed-catalog differences. Four preservation and four retirement-fence races reject late references, source replacement, archive replacement and bucket exposure; production writes are zero.
- Sequential separately archived base/original retirement passes without accepting an unexplained missing sibling. PUBLIC, anon, authenticated and service roles cannot execute the private retirement helpers.
- Database type contract, web lint and web typecheck pass. Live Supabase security/performance advisors were checked; this migration is not hosted, so the reported findings are pre-existing. The migration adds covering indexes for both retirement foreign keys.
- No browser UI changed in this batch, so prior merged desktop/phone web and Expo-browser acceptance remains the applicable UI evidence. Native runtimes remain unavailable (`simctl`, `adb`, `emulator` absent); this is not installed-native acceptance.

## Next actions

1. Apple Account Holder: finish/verify Cluster Wine, LLC organization enrollment and agreements, then invite `eitan@clusterwine.app` as Admin with Certificates, Identifiers & Profiles access. Accept the invite, verify the company team in both Apple portals, inspect/release the unshipped personal-team `com.cellarsnap.mobile` identifier, and recreate the identifier/app record and distribution credentials under the company before rerunning the exact production build.
2. Rotate the exposed production database password from OPS-04, update protected consumers and verify connectivity before any migration/operator run.
3. Independently review this branch, run CI, merge, apply the exact migration, rerun advisors and verify the hosted catalog. Do not replay earlier migrations.
4. Refresh the private reconciliation/backup, then canary one eligible operation through fence, exact delete and independent regional evidence. Stop on any mismatch; preserve archive/backup bytes.
5. Install the exact store build on iPhone/TestFlight and complete the launch matrix, final metadata/artwork/privacy/reviewer account, exact-build upload and explicit App Review submission.

## Workspace and rollback

The original checkout's modified `tsconfig.json` and two untracked planning/report files remain untouched. Implementation used an isolated worktree. Safe rollback before deletion is to disable the operator while retaining the fence and archive. After deletion, never recreate an old exposed key; retain all evidence and recover only to a newly authorized path.
