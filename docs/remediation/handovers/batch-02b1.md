# Batch 02b1 handover — September 12, 2026

## Objective and IDs

Implemented a bounded AUD-01 slice: parent-plus-photo metadata privacy, anchor/member group read policies, and web/mobile filtering before signing grouped slides. Targeted AUD-19 baseline and AUD-48 regression coverage expanded. [PR #86](https://github.com/Bobanski/CellarSnap/pull/86), references issue #81. AUD-01 stays **Partial**; this slice is QC passed — release pending with the explicit coverage limits below.

Deferred B02b2: actual Storage authorization/signing/download, legacy/source/copy path authority, avatars/covers and anonymous service-role share projections. AUD-06/QC-01 public identity/ratings and urgent AUD-04/B03 personal knowledge isolation remain open. New QC-08 records an existing event-card selected-slide/detail-link mismatch; no unrelated fix was inserted.

## Resume here

1. Inspect PR #86 and current checks. Branch `codex/b02b1-photo-group-privacy`, base main `a122d707e2c666b729578df05c37ac2b892babc0`, implementation/test commit `256a76f09fd7d22b604af8c66f59e8f53dbca22a`. Later commits contain handover documentation only.
2. Read the [photo/group contract](../b02b1-photo-group-contract.md), [QC report](../../audits/b02b1-photo-group-qc-2026-09-12.md) and [backlog](../backlog.md).
3. Review code/SQL before normal release. The new migration is **not applied to production**. Re-capture policies and compare definitions, verify B01/B02a prerequisites, then apply the exact reviewed file only through an authorized rollout and verify actual metadata/app behavior.
4. Continue B02b2's Storage/access contract promptly; do not call AUD-01 closed after this metadata change. Keep urgent B03 isolation visible rather than letting unrelated polish displace P0 work.

## State and decisions

- Preserve Noir Refined and the separate Champagne Daylight PR #75.
- Groups publish through an author-owned anchor. Other users can see group metadata only when that valid anchor is readable. Each member slide separately checks its own entry and type-specific photo privacy. Entry-less context inherits anchor privacy and must use the group author's prefix.
- Owners retain draft/group/photo management. Existing protected trusted-test visibility and both-direction block behavior are unchanged. A broader photo setting never unlocks a private parent.
- A shared helper filters successfully fetched group/entry IDs before signing/rendering on the web resolver, mobile grouped-entry resolver and mobile feed. Missing referenced entries no longer become anonymous-looking photo slides.
- Aggregate preflight: 34 groups, 33 valid anchors, one null-anchor draft; 107 slides including eight own-prefix contexts; no active label/place overrides. No data repair was needed or performed.
- New migration: `supabase/sql/20260912214315_enforce_photo_and_group_metadata_privacy.sql`, CLI-generated and appended to the manifest. No new functions/grants/Storage policies/data rewrite. The previous deployed migrations have different remote timestamps; retain the [existing checksum/version map](sql-rollout-b01-b02a.md).

## Verification

At implementation `256a76f`: 189 automated tests, 54 actual isolated PostgreSQL 17.10/PostgREST 16.3 HTTP assertions, web/mobile lint and TypeScript, Next production build and Expo web export passed. See the QC report for exact commands and fixtures. Targeted policy replay is not a complete schema baseline or full hosted Supabase stack.

Hands-on web desktop 1365×900 and phone 390×844: owner My Events search/three-slide carousel, non-owner two-slide feed carousel and direct private-entry denial passed. Expo production web at 390×844: owner event gallery contains all three photos; non-owner feed renders exactly public/context images and denies private entry detail. Native runtimes unavailable. Expo touch-gallery navigation did not advance with available desktop input and is explicitly unverified. No browser warnings/errors in checked galleries; no server 5xx; expected private-denial 404s only. Existing QC-01/05/06 and new QC-08 remain recorded.

Browser tests used changed local app code against **unchanged production policies** and disposable live fixtures. The new SQL was tested only on isolated PGlite and PostgreSQL/PostgREST. After rollout, repeat private label/place overrides, hidden anchors/members, owner drafts, blocks/testers, metadata queries and web/Expo rendering against the migrated target before live acceptance.

## Release state

- Commit/push: implementation and continuity docs on PR #86. At `256a76f`, GitHub Web (lint + tests), Mobile (typecheck + lint), and primary `Vercel – cellar-snap` preview passed. Duplicate `Vercel – cellarsnap` failed, retained as OPS-01. Recheck final head/checks after documentation updates.
- Merge: not merged. Code production deployment: not performed. Preview/check state is recorded in the PR.
- SQL deployment: **not deployed**. No production DDL was run in this batch.
- Live verification: application filtering passed on disposable live fixtures; SQL fix verification remains pending rollout. Actual Storage/anonymous sharing remains B02b2.
- Recovery: no rollback needed. Migration failures are transactional; after rollout prefer a targeted forward fix rather than restoring broad authenticated reads. Application filtering can ship ahead of the SQL, but is not the database security boundary.

## Workspace and environment

Preserved unrelated `tsconfig.json` formatting, untracked `cellarsnap-fix-plan.md`, `cellarsnap-qa-report.md`, and `.claude/worktrees/agent-a251821a0b01f63dc/` (`overhaul/w2b-palate`). Nothing in those paths was staged. No environment file edits or new application dependencies.

Only designated E2E accounts A/B were used, without capability/relationship changes. Both disposable entries, group, three slides, two photo rows and three objects were deleted and verified absent. Counts restored to 384 entries, 34 groups, 107 slides, 64 profiles, four trusted testers. Temporary Next/Expo services on 3001/8083 stopped; browser sessions signed out, tabs closed, viewport reset. Screenshots and build logs are under `/tmp/cellarsnap-b02b1-*`; continuity does not depend on them. The temporary isolated runtime remains available at `/tmp/cellarsnap-review-runtime`.

## Next slice

1. B02b2: inventory all bucket writers/readers and capture Storage policies. Cover legacy label/place/pairing, ordered photos, originals, copied versus referenced paths, avatars, collection covers/snapshots and entry-less context.
2. Define source privacy-change/revocation semantics. Forged path/root/group references must not grant access; preserve independently owned physical copies and legitimate sharing according to the reviewed contract. Reconcile service-role anonymous previews at the same boundary.
3. Build a bounded forward Storage repair, test actual object-service download/sign/batch-sign/upload/upsert/delete and all relevant role relationships, then browser/Expo/native where available. Already-issued signed URLs require an explicit TTL/revocation assessment.
4. Public identity/private rating projection and urgent B03 personal knowledge isolation follow; QC-08 is B06 correctness work. Update the [backlog](../backlog.md) and [hub](../README.md) at the next boundary.
