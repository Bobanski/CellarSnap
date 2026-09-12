# Audit remediation progress

**Current planning and status:** [remediation hub](../remediation/README.md), [canonical backlog](../remediation/backlog.md), and [batch-one handover](../remediation/handovers/batch-01.md). This document records historical implementation/QC evidence; update the canonical backlog for ongoing work.

September 12, 2026. The original audit is a historical snapshot at commit 40c6f63; it is not a claim that every finding still exists after later changes.

## Consolidation

PR #79 merged the completed overhaul, marketing site, and iOS submission work onto main at 778e43c. Web/mobile GitHub CI and the primary cellar-snap Vercel deployment passed. The duplicate cellarsnap Vercel project still fails and was not modified.

The older branches for progress bars, tab-bar flashing, sommelier/scan integration, explore browsing, and palate profiles were already squash-merged in PRs #52–56. They were not reapplied over newer work. The owner explicitly chose to preserve Noir Refined and keep the Champagne Daylight draft (#75) separate.

## First implementation branch: codex/audit-remediation

| Audit finding | Change | Status |
|---|---|---|
| 02: public-assets writes | Remove the two policies that incorrectly allow PUBLIC uploads/updates. Service-role writes and public reading remain. | Migration implemented and tested; not applied live |
| 03: privileged test-account flag | Guard profile insert/update using the actual database role; ordinary profile editing and backend administration remain. No existing flags are reset. | Migration implemented and tested; not applied live |
| 10: score-loader schema mismatch | Remove nonexistent quality_tier projection, derive its existing classification fallback, and retain wine_type if canonical fields are unavailable. | Implemented; the separate missing ai_notes_summary issue remains |
| 17: explore grape query | Join grape_varieties through variety_id instead of querying nonexistent entry_primary_grapes.grape. | Implemented |
| 27: batch cache work | Return all-hit/terminal batches before reading preference history or palate. Prevent a cached sibling from overriding direct fields for the same entry ID. | Implemented |
| 33/44: repeated photo signing | One shared batching helper for web and native, with deduplication, 100-path bounds, partial-error handling, and existing single-object fallback. | Implemented for the two utilities; the separate photos route still needs conversion |
| 48: regression baseline | Reconcile stale mocks/expectations against established weights and meaningful style thresholds; discover the nine notes tests; add policy/storage/loader/cache regressions. | 173 tests pass; CI now runs this suite |
| 49: nested worktrees | Exclude .claude from web lint and TypeScript. | Implemented; Metro watch-root work remains |

The scoring engine weights and NLP implementation were not changed to make tests pass. Expectations now reflect the existing documented rebalance (tannin 0.7, complexity 1.3); style tests no longer demand unsupported filler families. Refresh fixtures include assembled sensory data, matching the loader contract.

## Validation and deployment boundary

- npm run test:unit: 173 passed, with no production credentials or paid model calls.
- Web/mobile lint and TypeScript pass.
- Default Next production build (Turbopack) passes using nonfunctional placeholder public Supabase configuration.
- Corrected entry projections and grape joins were checked against the live schema with zero-row SELECTs.
- SQL migration is exercised, including repeat application, against synthetic grants/policies in PGlite (PostgreSQL compiled to WASM). Tests cover own-profile edits, denied privilege escalation/revocation, admin updates, cross-user reads, denied anonymous/authenticated asset writes, and retained public reads/admin writes.

Migration: supabase/sql/20260912185640_protect_profile_capabilities_and_public_assets.sql. It was created with the Supabase CLI, then placed in the repository's existing SQL/manifest workflow. It changes policies and adds a profile guard trigger; no tables, user records, or existing flags are deleted. Review and deploy it through the normal migration process with live post-deployment policy/advisor checks. It has **not** been applied to production by this branch.

The first patch does not yet close the entry/photo privacy gap (01), personal embedding isolation (04), contact lookup exposure (05), public profile projection (06), or badge evaluator/award issues (09). These remain priority follow-up work. Other findings remain pending unless explicitly marked above.

## Next implementation sequence

1. Reconcile entry/photo access rules across originals, shared copies, pending uploads, grouped slides, blocks, and test accounts, with cross-user fixtures before deployment.
2. Separate owner-scoped entry embeddings from shared knowledge and enforce that boundary across all retrieval/deletion paths.
3. Fix badge trigger evaluation/award authority and establish one seeded preference contract for cache refresh and on-demand scoring.
4. Continue batched entry loading, the remaining photo endpoint, notification polling, and shared entry/import workflows.

No broad schema replay, dependency upgrade campaign, native-device acceptance test, or full feature deletion was performed in this first patch.

## Browser and mobile QC follow-up

Interactive QC on September 12 tested the first patch (`0e7acb0`) in Chrome against the local Next app and the mobile app's Expo web runtime, using the existing E2E account. Authentication, feed photos, grape community statistics, score rendering/reload, library search, owner entry loading, editor hydration/cancel, and logout were exercised. Phone layouts were inspected at measured CSS widths of 390px (web and Expo) and 320px (Expo). No regression attributable to the first patch was identified in those flows.

The pass exposed existing issues: numeric ratings remain visible in the mobile social feed; the web library shifts a date-only consumed date back one day; profile/menu counts differ between surfaces. These were not changed by batch one and remain follow-up work. Google Maps loading/deprecation warnings and Expo web presentation/accessibility limitations are also recorded. The security migration is still undeployed, and no native emulator runtime is installed on this Mac.

See [the detailed QC report](batch-1-browser-mobile-qc-2026-09-12.md) for coverage, evidence, and limits. Interactive browser QC and available mobile-emulator testing are now recorded in the project instructions and the owner's global Codex instructions.
