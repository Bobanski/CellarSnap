# Batch 02b2 handover — September 12, 2026

## Objective and IDs

Implemented AUD-01's Storage/source authority and anonymous-share signing slice. [PR #87](https://github.com/Bobanski/CellarSnap/pull/87), references issue #81, is stacked on [PR #86](https://github.com/Bobanski/CellarSnap/pull/86). AUD-01 stays **Partial**; this slice is QC passed — release pending with explicit coverage limits. Targeted AUD-19 schema evidence and AUD-48 regression coverage expanded. No new unrelated finding ID was needed: reclassification/slide-only compatibility and share caching fall within AUD-01.

Deferred: public identity/private numeric-rating projections (AUD-06/QC-01), urgent personal knowledge isolation (AUD-04/B03), native acceptance, hosted transformation/CDN verification and production rollout. Preserve existing QC-05/06/08 and the separate Champagne Daylight draft PR #75.

## Resume here

1. Read the [Storage contract](../b02b2-storage-contract.md), [QC report](../../audits/b02b2-storage-share-qc-2026-09-12.md) and [canonical backlog](../backlog.md).
2. Inspect PRs #86 and #87. B02b2 branch `codex/b02b2-storage-privacy`, implementation/test commit `eb52b33c436f6c1e62f85aad331e52c6dc363df1`, base B02b1 `9558f5c213f0747a80ec74b2e65ffcb066f411fa`; underlying main `a122d707e2c666b729578df05c37ac2b892babc0`. Later commits contain continuity documentation only. If #86 is squash-merged, reconcile/rebase the stack deliberately rather than duplicating its changes into main.
3. Neither new migration is deployed. Before any authorized rollout, recapture policies, function ACLs and path aggregates, compare definitions with checked-in evidence, then apply B02b1 followed by `20260912222036_enforce_wine_object_privacy.sql`. SHA-256: `3e42ae94f6bd63ade4191b21b6d5951d4af89257c193280b6e6854b8ba35dc70`.
4. Release the share resolver after the helper exists, then repeat hosted download/sign/copy/upload/upsert/delete, category-change, legacy/slide-only, avatar/cover and anonymous-share checks. Re-run advisors. Application-first release fails closed on share images until the RPC exists; it does not fix production Storage access.

## State and decisions

- Source owner and entry UUID must match the object path. Ordered metadata determines current photo types; legacy columns and then valid slide-only group records are fallbacks. Parent and photo privacy both apply. Existing private source records cannot be relabeled by forged context. Eight existing slide-only member images and three reclassified photos are preserved without data rewrites.
- A locked-search-path private SECURITY DEFINER helper performs only explicit identity-bound boolean authorization. Hidden metadata must be distinguishable from missing metadata; ordinary invoker RLS cannot make that distinction. The public RPC facade is SECURITY INVOKER, with anonymous execution revoked. Own-prefix management and exact current avatars remain supported; custom covers stay owner-only. Physical copies have their own entry privacy; references retain source privacy.
- Anonymous shares require a live, unrevoked/unexpired share, an explicitly public post and a non-test author. Candidate sources must pass the same helper's public-only branch. Hidden first candidates are skipped. Unknown/missing RPC responses never become unchecked signatures.
- Share pages/OG authorization is not cached across requests; OG responses are explicitly no-store. New share-image URLs last one hour. Previously issued URLs and third-party caches cannot be retroactively revoked by this RLS change; authenticated SDK signing lifetimes are not globally capped.
- No production DDL, data repair, dependency update or unrelated UI edit. The previous B01/B02a migrations remain deployed under different remote timestamps; preserve their [checksum/version map](sql-rollout-b01-b02a.md).

## Verification

At implementation `eb52b33`: **196 automated tests**, **148 actual Supabase Storage HTTP assertions**, web/mobile lint/types, Next production build and Expo web export passed. The real service was official Storage v1.77.0 with its own Storage migrations on isolated PostgreSQL 17.10; PostgREST 16.3 connected the actual Next app for anonymous browser QC. The checked-in runner documents reproduction and cannot target a remote database.

Hands-on desktop 1365×900/phone 390×844: public label load, hidden-label fallback, immediate next-request label/entry privacy changes, revoked/expired/tester shares, photo-free shares and navigation passed. Actual observed signature lifetime was 3,600 seconds. OG public/denied PNG generation and no-store headers passed. Final helper adjustments were retested. Local hosted-transform/CDN/S3/TUS coverage is unavailable; do not equate the local file backend with those surfaces.

Expo web 390×844: owner detail and three-image My Events gallery; non-owner two-image feed and private-entry denial; sign-in/sign-out passed on disposable live fixtures with unchanged production policies. No native simulator/emulator is installed. Native gestures/camera/upload and Expo touch swiping remain unverified. Existing mobile public ratings/header/semantics findings remain open. All live fixtures were removed and base counts restored. See the QC report for exact observations, failures corrected and limits.

## Release state

- Implementation committed/pushed and PR #87 opened. At `eb52b33`, GitHub web/mobile CI and primary `Vercel – cellar-snap` preview passed; duplicate `Vercel – cellarsnap` failed (existing OPS-01). Recheck final documentation head before release.
- PR #86 remains open/unmerged; final head `9558f5c` has successful web/mobile CI and primary `Vercel – cellar-snap` preview. Duplicate `Vercel – cellarsnap` failed, retained as OPS-01.
- B02b1/B02b2 merge: not performed. Production code deployment: not performed. SQL deployment: not performed. Hosted/live fix verification: pending authorized rollout. Current live Storage broad-read policy remains in place.
- Recovery: no rollback required. Prefer targeted forward repairs; do not restore broad authenticated reads. Revalidate helpers, source paths and service-share behavior after deployment, including cached/signed capability limits.

## Workspace and environment

Preserved unrelated `tsconfig.json` formatting, untracked `cellarsnap-fix-plan.md`, `cellarsnap-qa-report.md` and `.claude/worktrees/agent-a251821a0b01f63dc/` (`overhaul/w2b-palate`). None was staged. No environment file edits. Temporary runtime packages live only under `/tmp`/npm cache.

All disposable fixture rows/objects were removed: 384 entries, 34 groups, 107 slides, 64 profiles, four testers, 869 wine objects restored. No capability or relationship changes. Browser accounts signed out; saved session token file removed. Next/Expo and isolated services stopped; viewport reset. One unmarked stale browser error tab could not be closed through the tool's data-URL guard and remains subject to automatic temporary-tab cleanup. Evidence: `/tmp/cellarsnap-b02b2-*`; continuity does not depend on it.

## Next slice

1. Coordinate review/release of the #86 → #87 stack and record actual migration, deployment and hosted acceptance separately. This is required before closing AUD-01.
2. Prioritize **AUD-04/B03 personal knowledge isolation** promptly; it remains P0 and should not wait behind broad polish. Capture current owner/entry/search boundaries and contain cross-user retrieval while preserving curated knowledge.
3. Complete B02 public identity/private-rating projection (AUD-06/QC-01) as a separate bounded slice. Keep raw 1–100 private input intact and test web/mobile/API/share projections.
4. Continue the remaining canonical batch order; QC-08 belongs to B06. Update statuses and this hub at each boundary.
