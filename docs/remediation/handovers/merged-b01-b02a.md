# B01/B02a merged handover — September 12, 2026

## Objective and IDs

The owner approved merging the reviewed stack. Merged #80, then retargeted/rechecked and merged #82. This session changed no application code, test logic, migration SQL or deployment configuration. This documentation-only follow-up records actual release state for AUD-01/02/03/10/17/19/48 and OPS-01. No finding is closed solely because its code merged.

## Resume here

1. [PR #80](https://github.com/Bobanski/CellarSnap/pull/80) merged at **20:56:32 UTC** as `25f14e12e0e3cde680ad17a27f6d2feadaf9d635` (reviewed head `37f183d`; issue #83).
2. [PR #82](https://github.com/Bobanski/CellarSnap/pull/82) merged at **20:57:07 UTC** as `c22a45cec280e1745a147eeab5a8b45d11fd170d` (reviewed head `22d1378`; issue #81). Its base was changed to main after #80 merged. Merge commits preserve the reviewed stack history; no rebase or conflict resolution was required.
3. Code merge is complete. **Both SQL migrations are still undeployed.** Obtain authorization for the intended database target and follow the release procedure; merge approval did not authorize SQL deployment.
4. Continue B02b from [batch 02a](batch-02a.md), using the [access contract](../b02a-access-contract.md). Keep AUD-04 personal knowledge isolation urgent. The [backlog](../backlog.md) remains canonical.

## State and decisions

Preserve Noir Refined, all existing features, and separate Champagne Daylight PR #75. Existing unrelated workspace edits are untouched. No remote branch was deleted and auto-merge was not enabled.

B01's profile capability guard must be applied before B02a's entry policy. Preserve manifest order:

1. `20260912185640_protect_profile_capabilities_and_public_assets.sql`
2. `20260912200417_enforce_entry_read_privacy.sql`

Trusted-test visibility remains the captured intentional contract. Storage/photo-specific/group privacy and public identity/rating projections remain later B02 slices. QC-07 mobile grape loading and AUD-10 alias resolution drift remain existing follow-up defects, documented in the [review report](../../audits/merge-readiness-qc-2026-09-12.md).

## Verification

Before each merge, checked the exact head SHA, GitHub mergeability and CI results. Web/mobile CI and primary Vercel preview passed; the already-reviewed duplicate `cellarsnap` env failure remained visible. Used `--match-head-commit` to bind each merge to its reviewed revision.

After #80 merged, `git diff 37f183d origin/main` was empty. #82's merge base remained `37f183d`; its retargeted diff contained only the expected B02a SQL/fixtures/tests/documentation. After #82 merged, `git diff 22d1378 c22a45c` was empty. Thus the merged tree is exactly the reviewed/tested tree; no additional product changes required a new browser run.

Prior acceptance remains: 181 unit/route/PGlite tests, 41 real PostgreSQL/PostgREST HTTP assertions, web/mobile lint/types, Next/Expo production builds and hands-on desktop/phone/Expo web flows. Exact results/limits are in [merge readiness](merge-readiness.md) and the QC report. Native iOS/Android runtimes were unavailable. No claim of full migrated Supabase Auth/Storage service coverage or post-rollout privacy verification.

## Release state

- **Merge:** #80 and #82 merged to main in the required order.
- **Web code deployment:** GitHub deployment `6414302917`, environment `Production – cellar-snap`, reports success at **20:57:42 UTC** for `c22a45c`. [Deployment](https://vercel.com/eitan-sneiders-projects/cellar-snap/6jHP5HVmB8gAkT2fFizo8zMjfyeR). This is a deployment-success check, not a new live functional QC pass.
- **Duplicate deployment:** `Vercel – cellarsnap` still has the known missing-environment problem (OPS-01); its target/configuration was not changed.
- **Mobile binary distribution:** no native build/store release performed.
- **SQL deployment:** neither new migration applied live. The P0 database exposures are not claimed fixed in production.
- **Live policy verification:** outstanding after an authorized SQL rollout; verify ordinary/test/backend behavior, direct API and actual Storage-service reads/writes/signing, and affected app flows.
- **Recovery:** prefer a targeted forward repair after rollout. Do not blindly restore broad authenticated entry reads. The SQL guard/drift checks abort transactionally without changing row data.

## Workspace and environment

Preserved modified `tsconfig.json` formatting, untracked `cellarsnap-fix-plan.md`, `cellarsnap-qa-report.md`, and `.claude/worktrees/agent-a251821a0b01f63dc/`. No app/test services started, environment files edited, credentials changed or test fixtures mutated this session. Earlier QC services remain stopped and disposable fixture cleanup is recorded in merge readiness.

Documentation branch `codex/merge-release-handover` records this handover through the normal PR workflow. Inspect current Git/main before resuming; later documentation commits may follow the implementation merge recorded above.

## Next slice

Coordinate the separately authorized SQL release and live acceptance; continue the bounded B02b Storage/photo/group fixture and policy work. Do not treat this merge handover as closure of partial findings. OPS-01 needs a deliberate project/domain decision, not copying secrets or disabling a project blindly. No additional merge approval is pending for #80/#82.
