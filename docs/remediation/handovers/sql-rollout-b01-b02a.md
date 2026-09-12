# B01/B02a SQL rollout handover — September 12, 2026

## Objective and IDs

The owner explicitly authorized applying the reviewed migrations if the final checks supported them. Applied both exact files to production Supabase project `rbmkypbqavmnuycznssv`, in order, then verified live database, Data API, Storage service and web/Expo behavior. No application code or migration SQL changed in this session.

AUD-02 and AUD-03 are **Closed** for their stated capability/public-asset defects. AUD-01 remains **Partial**: its entry-row slice is deployed and verified, while Storage/photo-specific/group privacy remains B02b. AUD-19/48 remain ongoing partial program work. Existing public rating/identity, alias resolution, mobile grape loading and other backlog findings are not closed.

## Resume here

1. The migration rollout is complete; **do not reapply these files merely because the repository and remote version numbers differ**. The Supabase migration tool assigned deployment-time versions; the exact SQL checksums match the repository files.
2. Continue B02b from the [entry access contract](../b02a-access-contract.md) and [batch 02a handover](batch-02a.md). Keep AUD-04 personal knowledge isolation urgent.
3. Use the [canonical backlog](../backlog.md), not the historical merge/readiness snapshots, for current status. [Detailed live QC](../../audits/sql-rollout-qc-2026-09-12.md) records evidence and coverage limits.

## State and decisions

| Reviewed repository migration | Recorded production version / name | Exact SQL MD5 |
|---|---|---|
| `20260912185640_protect_profile_capabilities_and_public_assets.sql` | `20260912211719` / `protect_profile_capabilities_and_public_assets` | `4f690c3fb41c060a1bc41add57207abb` |
| `20260912200417_enforce_entry_read_privacy.sql` | `20260912211747` / `enforce_entry_read_privacy` | `50fb651cc4595d5980b048a34568b7a8` |

The guard is enabled and SECURITY INVOKER. Both broad public-assets write policies are gone; public reads and backend writes are retained. `wine_entries` now has one authenticated SELECT policy using the captured `can_view_entry` helper, with owner INSERT/UPDATE/DELETE unchanged. No row rewrite or flag backfill was performed. All existing test-account flags are unchanged after verification.

Preserve Noir Refined, existing features and separate Champagne Daylight PR #75. Trusted-test extra visibility remains the intentional captured contract, with both-direction blocks honored. Do not interpret entry-row filtering as column-level or object-storage privacy.

## Verification

- Preflight: active healthy PostgreSQL 17.6 project; all 24 affected policies and six helper definitions matched the reviewed fixtures. Array serialization was normalized before comparison. All 384 entries had recognized non-null privacy. Neither migration was already recorded, and there was no existing profile guard.
- Applied B01, inspected its enabled trigger, removed policies, retained public read and unchanged flags, then applied B02a. Production migration-history SQL MD5s exactly match file bytes.
- **35 live HTTP/Data API/Storage checks passed**, using existing designated ordinary accounts A/B and disposable fixtures. Includes owner/private/public/anonymous/backend access, concurrent request isolation, retained owner updates, foreign mutation and ownership-transfer denial, capability escalation denial, public-asset download/upload/update/upsert behavior, and actual wine-photo signing/download/upsert.
- **Eight additional live SQL assertions passed and rolled back**: trusted-test private read, denied tester revocation, denied privileged insert, both block directions, actual ordinary profile name edit, backend flag assignment and revocation. These made no persistent profile or relationship changes.
- Production web: desktop 1365×900 and phone 390×844; owner private detail/rating/photos/carousel/editor save passed. Ordinary B sees “Entry not found” for private and can open public. Expo production web, using the live API/database: owner private view/photos/saved notes and B denial/public access passed at phone widths (390×844 and 320×750).
- Native iOS/Android runtimes remain unavailable; Expo web is explicitly a fallback. No native binary release or device acceptance claim.
- Security advisors: identical before/after findings (44 observations across seven types); no new finding from the migrations. Production Vercel error-log query for the rollout window returned zero records. Browser warnings and limits are in the QC report.
- Cleanup verified: four disposable entries, two photo records and all uploaded fixture objects removed. Entries returned to 384; profiles 64, trusted testers 4, and the flags fingerprint stayed `1732f025b055f58143ed175770ddbdff`.

## Release state

- **Code:** #80 and #82 merged; primary production deployment had succeeded. Starting repository head was `586e6ca`; the product tree matches the reviewed merged code. This session only adds rollout records through a docs PR.
- **SQL:** both files are applied and recorded in production, with the order/checksums above.
- **Live acceptance:** passed for the bounded B01 capability/public-assets and B02a entry-row changes. Full friendship/two-hop/copy matrix remains supported by the prior isolated PostgreSQL/PostgREST tests and exact unchanged live helpers; the live HTTP pass did not recreate every relationship graph.
- **Residual privacy:** wine Storage SELECT, photo-specific/group access, public numeric ratings/identity and personal knowledge isolation still need their planned repairs. Existing signed-object delivery is not claimed fixed by the entry policy.
- **OPS-01:** duplicate Vercel `cellarsnap` remains a separate env/configuration issue; it was not changed.
- **Recovery:** no rollback was needed. Prefer a targeted forward correction if a regression emerges; do not restore broad authenticated entry reads or client-editable capabilities. Do not replay historical SQL to reconcile version-number drift.

## Workspace and environment

Preserved modified `tsconfig.json` formatting, untracked `cellarsnap-fix-plan.md`, `cellarsnap-qa-report.md`, and `.claude/worktrees/agent-a251821a0b01f63dc/`. No environment files were changed. Only existing designated test accounts were used; no new auth users were created.

The production Expo export from the review was served temporarily on loopback 8083, with API requests proxied over HTTPS to `cellarsnap.app`; that service is stopped. Browser test sessions are signed out and viewport overrides reset. Synthetic white 1px PNGs were used for signed-photo checks, then removed. Temporary scripts/logs/state under `/tmp/cellarsnap-rollout-*` are not required for continuity. Screenshot paths are in the QC report; no credentials or signed URLs are checked in.

## Next slice

B02b: capture current Storage/group definitions, establish source/copy/photo privacy semantics, implement a bounded forward repair, and verify actual object-service requests plus web/mobile outcomes. Preserve the successfully deployed owner mutation and trusted-test contracts. Update the canonical backlog and publish the next handover at its boundary.
