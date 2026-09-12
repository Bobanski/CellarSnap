# B01/B02a merge-readiness handover — September 12, 2026

Historical readiness snapshot; superseded by the [approved merge handover](merged-b01-b02a.md).

## Objective and IDs

Completed a thorough review/QC of the full #80 → #82 stack at the owner's request. Recommendation: code ready for final owner review and ordered merge, with the known duplicate deployment check failing (OPS-01). Owner explicitly said to wait for their quick check and approval before merging. **Do not merge without that approval.** No product-code defect introduced by the stack was found; added real HTTP integration coverage and updated release evidence.

Affected records: AUD-01/02/03/10/17/19/48, OPS-01; new QC-07 (unchanged mobile detail grape loader). Preserve the remaining B02/B03 P0 scope and other backlog findings. No finding is closed by this review.

## Resume here

1. Inspect [PR #80](https://github.com/Bobanski/CellarSnap/pull/80) (base main, head `37f183d`) and [PR #82](https://github.com/Bobanski/CellarSnap/pull/82) (base `codex/audit-remediation`). Both are marked ready for review and GitHub reports them mergeable; neither is merged. B01 issue is now [#83](https://github.com/Bobanski/CellarSnap/issues/83); #70 was an unrelated closed design issue. B02a remains [#81](https://github.com/Bobanski/CellarSnap/issues/81).
2. Read [merge QC report](../../audits/merge-readiness-qc-2026-09-12.md) and [entry access contract](../b02a-access-contract.md). Final code/test revision reviewed locally is `d6a6da7fef138e70559e3cb55640375eaa004e17`, following B02a SQL `50f9fc6`; readiness documentation follows separately. Verify the actual PR head/checks at resumption.
3. After explicit owner approval, merge B01 first, retarget/rebase B02a onto updated main as necessary, and recheck checks/diff before merging B02a. Do not infer approval to deploy SQL from these files or from a future code-merge approval.
4. Both SQL migrations remain undeployed. Review the intended target and release procedure, preserve manifest order, apply through the authorized workflow, then verify live API/Storage/app behavior. Production remediation is not complete until that evidence exists.

## State and decisions

- Preserve Noir Refined, all features and separate Champagne Daylight PR #75. No unrelated code fixes were inserted into this review.
- B01's guarded test capability must precede B02a's row policy. Existing trusted-test extra visibility is intentional. No flag backfill, owner-data rewrite or helper replacement.
- New `scripts/qc/postgrest-entry-access.mjs` shares schema/seed files with the PGlite policy suite. Exact captured JWT claim semantics now exercise real request role switching and a pooled PostgREST process. The runner accepts a local runtime directory only; it cannot be pointed at a live database URL.
- Reviewer found and reproduced existing missing-table mobile grape loading (QC-07) and missing-column alias resolution (additional AUD-10 evidence). Both files are unchanged from main; source/evidence and acceptance are in backlog/report. They remain follow-up work, not hidden QC passes.
- Duplicate Vercel `cellarsnap` is confirmed to fail because Supabase env variables are missing at prerender. Working primary is `cellar-snap`; duplicate domain/ownership/retirement decision remains OPS-01. No deployment settings or secrets were changed.

## Verification

At `d6a6da7`: 181 unit/route/PGlite tests, web/mobile lint and TypeScript passed. Next production build with actual configured env and Expo production web export passed; no product source changed after those builds. Forty-one real HTTP assertions passed with both migrations replayed twice on isolated native PostgreSQL 17.10 + PostgREST 16.3. Live major is PostgreSQL 17 (17.6). No Docker/Supabase cloud branch was required or created.

Browser QC: Chrome web desktop 1365×900 and phone 390×844; production Expo web 390×844 and 320×750. Login, signed photos/carousel, positive personal grape stats, private rating, privacy disclosure, scoped save, search/detail, fixture deletion and logout/session recovery passed. Existing UI/schema errors and console/server evidence are explicitly recorded in the report. Missing mobile grape display is a failure, not a pass.

No installed iOS simulator or Android emulator runtime. Native camera, storage, permissions and gesture checks remain unavailable. Browser used the unchanged live database; isolated migrated HTTP coverage is not a complete Supabase Auth/Storage/app-stack test. In particular, Storage RLS checks use object metadata through PostgREST, not Storage-service object endpoints. Follow-up live tests remain required after an authorized SQL rollout.

### Reproduce isolated HTTP checks on macOS arm64

These tools are temporary and are not new application dependencies. Run from repo root; choose a fresh temporary runtime directory if `/tmp/cellarsnap-review-runtime` does not exist:

```sh
npm install --prefix /tmp/cellarsnap-review-runtime --no-audit --no-fund embedded-postgres@17.10.0-beta.17 pg@8.16.3
curl -fsSL https://github.com/PostgREST/postgrest/releases/download/v16.3/postgrest-v16.3-macos-aarch64.tar.xz -o /tmp/cellarsnap-review-runtime/postgrest.tar.xz
tar -xf /tmp/cellarsnap-review-runtime/postgrest.tar.xz -C /tmp/cellarsnap-review-runtime
LC_ALL=C node scripts/qc/postgrest-entry-access.mjs /tmp/cellarsnap-review-runtime
```

The runner supplies the embedded runtime's `libpq` directory to the PostgREST child. Its database/API bind loopback, random ports/secrets are ephemeral, and finally stops/removes its database. Other OS/architecture binaries need deliberate adaptation; only this runtime was exercised. Do not substitute production connection settings.

## Release state

- Merge: neither PR merged. Await explicit owner approval.
- Code deployment: no production deploy performed; primary Vercel preview checks pass at the pre-documentation heads. Recheck latest remote checks after documentation push.
- Migration deployment: neither `20260912185640_protect_profile_capabilities_and_public_assets.sql` nor `20260912200417_enforce_entry_read_privacy.sql` applied live.
- Live fix verification: outstanding. Read-only catalog/ACL inspection and disposable owner fixtures do not constitute live verification of undeployed policies.
- Isolated integration: passed for the targeted database/Data API contract. Full schema replay and real Storage service still outstanding.
- Recovery: transactional dependency/drift failures preserve old policy state. After a successful SQL rollout, prefer a targeted forward fix for regressions; do not blindly restore the all-authenticated entry read leak.

## Workspace and environment

Preserve modified `tsconfig.json` formatting, untracked `cellarsnap-fix-plan.md`, `cellarsnap-qa-report.md`, and `.claude/worktrees/agent-a251821a0b01f63dc/` (`overhaul/w2b-palate`, `64f7392`). None is part of this review commit.

Disposable private test entry `c94b3965-ad8e-4d81-ae15-d4ae783fcf25` was created under the designated test account, edited/deleted through web UI. Read-only follow-up confirmed zero entry, grape links, score rows and resolution logs; no files uploaded. Existing fixtures were preserved. Normal app-derived cache refreshes occurred. No environment files changed.

Temporary QC services on 3001/8083 are stopped at session end; test browser sessions signed out and viewport overrides reset. A final listener check found neither port still listening. Screenshot directory and sanitized textual evidence are in the report. Temporary runtime and build/log files under `/tmp/cellarsnap-review-*` may disappear without affecting canonical evidence. No secrets are checked in.

## Next slice

After owner review/release coordination, continue B02b Storage/photo/group access from [the previous handover](batch-02a.md). Preserve mixed-privacy, block, test, copy/source and owner mutation fixtures, and test actual Storage object paths. Then public identity/rating projection and urgent B03 personal knowledge isolation.

QC-07 and the alias resolver schema failure stay visible in B08/B07/B05; avoid letting unrelated polish displace P0 containment. [Backlog](../backlog.md) is canonical and [hub](../README.md) points here.
