# Canonical remediation backlog

Updated September 12, 2026. **58 records: all 50 original audit findings, six browser/mobile QC findings, and two operational/reconciliation items.** This file is the work queue; do not maintain competing unchecked lists in successive handovers.

Read the [batch plan and workflow](README.md) and the latest handover linked there first. Original `AUD-NN` IDs map directly to section NN of the [September 12 audit](../audits/codebase-backend-audit-2026-09-12.md), which supplies detailed evidence and recommendations. QC sources are the [browser/mobile report](../audits/batch-1-browser-mobile-qc-2026-09-12.md). This index adds status, remaining scope, batch and a closure test; it does not replace those technical details.

**Ownership / external tickets:** unassigned unless a row links a PR or active branch. PR #80 owns only the implemented B01 slices. B02a's entry-row slice is in [PR #82](https://github.com/Bobanski/CellarSnap/pull/82), tracked by [issue #81](https://github.com/Bobanski/CellarSnap/issues/81) on `codex/b02a-entry-privacy`. There is no GitHub umbrella; these stable local IDs remain the canonical tickets. Issue #70 is closed brand/design work and should not be used as this backlog's umbrella.

**Release boundary:** no finding is marked Closed here. “QC passed — release pending” means the implemented slice passed its applicable checks but is still in review or awaiting deployment/live checks. B02a has isolated database tests and browser baseline only; migrated integration remains pending. “Partial” preserves residual work. Recheck current deployment state when resuming.

## Original audit

| ID | Priority | Finding | Status | Batch / next acceptance evidence |
|---|---|---|---|---|---|
| AUD-01 | P0 | Entry/photo policies bypass privacy | Partial | B02a entry-row migration + captured live access helpers + eight PostgreSQL tests implemented on `codex/b02a-entry-privacy` ([PR #82](https://github.com/Bobanski/CellarSnap/pull/82), [#81](https://github.com/Bobanski/CellarSnap/issues/81)); integration/release pending. [Handover](handovers/batch-02a.md). B02b still needs Storage/photo-specific/group policies and real cross-user API/Storage/browser/native verification. |
| AUD-02 | P0 | PUBLIC can write public-assets | QC passed — release pending | B01 → B02 release: [PR #80](https://github.com/Bobanski/CellarSnap/pull/80) migration tested in PGlite, not deployed. Verify live client write denial and retained public reads/admin writes after rollout. |
| AUD-03 | P0 | Client-editable privileged test-account flag | QC passed — release pending | B01 → B02 release: PR #80 guards insert/update. Verify live own-profile editing, escalation/revocation denial and retained admin updates; do not reset existing flags. |
| AUD-04 | P0 | Personal embeddings globally readable/searchable | Open | B03: owner/entry boundaries in tables and every retrieval path; cross-user denial, retained curated search, update/delete propagation and no orphaned private chunks. |
| AUD-05 | P1 | Identifier lookup exposes email/phone mappings | Open | B04: non-enumerating public responses and restricted resolver authority; login/recovery and deliberate availability checks still work with abuse limits. |
| AUD-06 | P1 | Public identity projection overexposes fields | Open | B02: explicit public DTO/projection honoring identity preferences and visibility, verified on web/mobile without breaking legitimate profile reads. Related QC-01. |
| AUD-07 | P1 | Unbounded/unsafe wine-list URL fetching | Open | B04: validate destination and every redirect; total body deadline and byte limits; accept legitimate restaurant sources and reject disallowed destinations. |
| AUD-08 | P1 | Dependency advisories and undeclared runtime imports | Open | B04: recheck advisories, upgrade compatible Next/Expo sets, declare imports; separate build-only exposure and test auth/scanning/images/mobile build compatibility. |
| AUD-09 | P1 | Badge trigger/evaluator incompatibility and award authority | Open | B06: exhaustive shared trigger union coverage, server-authoritative awards, checked writes, representative fixtures for all supported trigger families; preserve all 85 definitions. |
| AUD-10 | P1 | Score-loader/schema drift | Partial | B01 fixes nonexistent quality_tier query and preserves wine_type, with tests/QC in PR #80. B07 still must resolve absent ai_notes_summary deliberately and prove the schema/loader contract. |
| AUD-11 | P1 | Refresh and on-demand scoring use different preferences | Open | B07: identical versioned inputs for seeded/unseeded single, batch, refresh and list-scan paths; numerical parity fixtures. |
| AUD-12 | P2 | Cached responses lose promised score fields | Open | B07: cold/warm response equivalence including explanation/confidence fields, or an explicit compatible score-only versus detail contract. |
| AUD-13 | P1 | Web/native entry lifecycle diverges | Open | B08: authoritative command/side-effect contract covering consumed/cellared/shared/group entries; parity across clients while preserving drafts and native I/O. |
| AUD-14 | P1 | Cellar drink/decrement/clone is non-atomic | Open | B08: ownership-checked transaction, conditional decrement/locking and idempotency; concurrent last-bottle/retry tests with grape cloning and side effects. |
| AUD-15 | P1 | Multi-table mutations rely on compensation/positions | Open | B08: stable request/row IDs, atomic boundaries, rollback/retry tests; retain intentional partial-import reporting. |
| AUD-16 | P1 | Import mapping discards custom types | Open | B08 correctness; B12 consolidation: preserve date, number, grape, bottle-format and currency custom fields across both import formats with round-trip fixtures. |
| AUD-17 | P1 | Explore grape query uses nonexistent column | QC passed — release pending | B01 PR #80 fixes variety join; schema query and browser community pulse passed. Complete release checks; add a positive personal-grape fixture alongside the empty-state UI coverage. |
| AUD-18 | P2 | Inconsistent validation on write paths | Open | B08: shared bounded runtime schemas, meaningful 400s and partial-update semantics; unsupported input rejected without erasing omitted valid fields. |
| AUD-19 | P1 | Migration history does not reproduce production | Partial | B02a captured affected live policies/grants and executable entry-helper fixtures; documented text-vs-enum drift in the [access contract](b02a-access-contract.md). B05 still needs the complete reviewed baseline, replay/drift detection, triggers/seeds and deployment reconciliation. Never replay historical SQL on production. |
| AUD-20 | P1 | Compatibility branches lack retirement contract | Open | B05 supported schema/mobile window; B15 deletion: instrument fallback usage and remove only obsolete schema branches while preserving nullable/input recovery and access controls. |
| AUD-21 | P1 | Database types drift from schema/domain DTOs | Open | B05: generate one type source from reviewed schema, adopt client factories/query result typing, keep public DTOs/validators distinct and CI-check drift. |
| AUD-22 | P2 | Duplicated entry/photo/group representations lack ownership | Open | B08: document canonical writer and derived copies, reconcile before retirement; retain OCR provenance, separate tasting ratings and collection snapshots. |
| AUD-23 | P2 | RLS policy overhead and redundant predicates | Open | B14 after B02/B05: equivalent allow/deny behavior plus representative plans; role targeting and optimized row-independent auth calls. |
| AUD-24 | P2 | Missing/query-misaligned indexes | Open | B14 or justified earlier slice: reconcile notification/FK/query indexes; representative before/after plans rather than speculative indexes on tiny tables. |
| AUD-25 | P3 | Proven duplicate indexes | Open | B14: compare definitions, predicates, constraints and workloads; drop only demonstrated redundancy while preserving uniqueness/FK/operational needs. |
| AUD-26 | P2 | Retention and derived refresh metadata undefined | Open | B03 personal-data cleanup; B10 full lifecycle: bounded retention, authoritative timestamps/versioning, incremental refresh and deletion propagation without losing raw provenance. |
| AUD-27 | P1 | All-hit score batches rebuild preferences | QC passed — release pending | B01 PR #80: all-hit/terminal early return and direct override precedence tested. Release checks outstanding; retain these invariants during B07/B09. No current UI caller for the batch wrapper was found. |
| AUD-28 | P1 | Per-entry loads remain inside score batches | Open | B09: bounded authorized entry/grape queries, stable order, per-item failures, existing reference prefetch/bulk writes retained; measured query-count reduction. |
| AUD-29 | P1 | Materialized sensory profiles rebuilt inconsistently | Open | B07: one versioned assembly contract, reuse matching profiles, rebuild stale/missing only; numerical parity before substituting stored data. |
| AUD-30 | P2 | Fragmented reference-cache coverage | Open | B07: extend existing cache with bounded/versioned keys and in-flight dedupe; demonstrate hit/fallback behavior without assuming cross-instance persistence. |
| AUD-31 | P1 | Palate reads block on backfill writes | Open | B10: normal writes materialize through lifecycle; bounded observable backfill; prompt fallback reads, checked persistence and retry policy. |
| AUD-32 | P1 | Saves wait for broad invalidation/eager refresh | Open | B10: coalesced preference-relevant invalidation and appropriate background jobs; preserve immediate comparison/badge payloads, measure response latency and job completion. |
| AUD-33 | P1 | Individual photo signing remains on some paths | Partial | B01 shared web/native helper tested, including actual Expo photos. B09 convert remaining photo endpoint and measure request reduction; retain viewer isolation, failure handling and private bucket. |
| AUD-34 | P2 | Feed/home/list enrichment waterfalls | Open | B09: reusable bounded hydration with combined IDs/counts and independent query overlap; preserve visibility, grouped dedupe/cursors and response contracts. |
| AUD-35 | P1 | Pagination silently truncates searches/totals | Open | B09: full-library server search/sort, stable cursors, complete aggregates/preferences/duplicate checks beyond default caps; retain native virtualization. |
| AUD-36 | P2 | Notification polling duplicates realtime/background work | Open | B11: one state owner, coalesced refresh, visibility-aware fallback and tested suppression-aware counts; notification/alert behavior preserved. |
| AUD-37 | P2 | Fonts and eager UI work increase initial load | Open | B11: preserve typography, introduce real interaction loading boundaries; comparable startup transfer/render measurements and editor/gallery regression QC. |
| AUD-38 | P2 | Images lack consistent private responsive delivery | Open | B11: authorized derivatives/transforms, dimensions/formats/cache strategy and source/error recovery; compare feed/detail bytes without publicizing originals. |
| AUD-39 | P2 | Duplicate request/session bootstrap state | Open | B11: scoped request cache and shared session/profile bootstrap; cookie/bearer auth and account-switch isolation verified, no weaker proxy identity fallback. |
| AUD-40 | P2 | Import pipelines repeat serial lookups | Open | B12 after B08: shared normalized model, reference maps and bulk persistence; duplicates distinguish an imported row from a separate tasting. |
| AUD-41 | P2 | Generated profile caching races across instances | Open | B10: atomic expiring lease/state, bounded local cache, failure visibility and audience-aware identity; preserve old content during refresh. |
| AUD-42 | P1 | Oversized duplicate entry controllers | Open | B13 after B08: shared pure rules/state transitions, platform I/O adapters, small per-feature slices; preserve crop/lineup retries, drafts, grouping, surveys and post-save flows. |
| AUD-43 | P2 | Duplicated friends feature logic | Open | B13: one controller and shared web pieces; route/tab navigation, requests/actions and host-specific empty states verified. |
| AUD-44 | P2 | Shared schemas/constants/helpers incomplete | Partial | B01 consolidates signing only. B13: domain-specific shared bases/extensions and semantic helper consolidation; retain existing shared re-exports and platform contracts. |
| AUD-45 | P2 | Route auth/validation/errors inconsistent | Open | B13: small typed adapters, cookie/bearer auth and endpoint-specific error contracts tested; no oversized framework abstraction. |
| AUD-46 | P3 | Unused modules/pass-through layers | Open | B15: prove no dynamic/external consumers, delete bounded candidates, preserve knowledge-admin authorization and verify affected features. Source count alone is not performance evidence. |
| AUD-47 | P3 | Repeated tokens/visual primitives | Open | B13: small shared token source and stable per-platform primitives; preserve Noir Refined, native SVG/rendering and static marketing deployment. |
| AUD-48 | P1 | Regression baseline incomplete/untrustworthy | Partial | B02a: 181 tests (eight added policy tests, 56 app/database access comparisons), lint/types and browser/HTTP baseline. [QC limits](../audits/b02a-browser-database-qc-2026-09-12.md): migrated Supabase integration and native acceptance outstanding. Continue lifecycle/import/cache/scoring coverage in relevant batches. |
| AUD-49 | P2 | Nested worktrees enter tooling/watch roots | Partial | B01 excludes .claude from web lint/TypeScript. B05: Metro and remaining scan/watch boundaries still need review; preserve the user's existing nested checkout. |
| AUD-50 | P2 | Silent degradation and stale engineering context | Partial | This hub/intake/handover improves documentation only. Every batch: request/job IDs, stage latency/query counts, cache/fallback/AI usage and actionable error reporting remain implementation work. |

## New and operational findings

| ID | Priority | Finding | Status | Batch / acceptance |
|---|---|---|---|---|
| QC-01 | P1 | Mobile public feed displays raw numeric ratings | Open | B02: enforce the intended qualitative public presentation and review public payloads; preserve owner's private 1–100 input. Related AUD-01/06/44. |
| QC-02 | P2 | Web library dates shift one day in negative UTC offsets | Open | B06: one date-only formatter; same consumed date in library/detail/mobile under positive and negative UTC offsets. |
| QC-03 | P2 | Profile/menu country and friend counts disagree | Open | B06: define count semantics, reconcile query/loading behavior, prove consistent counts on shared fixtures across web and mobile. Related AUD-35/39. |
| QC-04 | P2 | Maps loader/legacy Places warnings | Open | B11: async loading and supported Places contract; location autocomplete still works, relevant warnings eliminated and load impact measured. Related AUD-37. |
| QC-05 | P2 | Expo web exposes router group titles | Open | B11: intended headers on sign-in/app screens without `(auth)`/`(app)` labels; verify native stacks when runtime available. Severity is provisional for native impact. |
| QC-06 | P2 | Mobile web pressables lack button roles | Open | B11: audit affected pressables' role/name/focus/keyboard behavior; DOM and accessible native behavior verified where available. |
| OPS-01 | P2 | Duplicate legacy Vercel project fails deployments | Open | B04: identify intended ownership/domain/deployment targets; repair or retire duplicate only after confirming routing and rollback. Preserve working primary project. |
| OPS-02 | P2 | Historical local UI reports need reconciliation | Needs triage | Intake before the relevant batch: reproduce/deduplicate the nine March topics listed below; do not import historical static “PASS” as current QC. |

### QC-01 — Public rating exposure on mobile

Discovered during B01 QC at `0e7acb0`, using the existing E2E account. Open the same public feed card on web and Expo web: the web card shows “Loved it,” while mobile shows `92/100`. Project conventions define raw ratings as private inputs. Confirmed in the mobile feed path `apps/mobile/app/(app)/feed/index.tsx`, which calls `getFeedDisplayRatingLabel` from `packages/shared/src/feed.ts`; these files were unchanged by B01. Test other public surfaces and payloads as part of the fix, not just this label. B02, unassigned, no external ticket/PR yet. Native visual reproduction remains outstanding.

### QC-02 — Date-only parsing changes the calendar day

In the New York timezone, searching `Proof Private` in web Library shows July 7 for an existing synthetic fixture whose detail and mobile show July 8. `src/components/palate/LibraryTab.tsx:48` calls `new Date(iso).toLocaleDateString(...)`, shifting midnight UTC date strings. Confirmed display mismatch; the stored value was not shown to be corrupted. B06, unassigned. Fix formatting semantics without migrating valid dates; test both date-only and timestamp contracts deliberately.

### QC-03 — Inconsistent summary counts

For `e2e_user_a` during B01 QC: web profile one country, web menu/mobile cellar two; web menu two friends, mobile menu zero. Reproduce from the same seeded relationship/entry set; distinguish count definition differences from loading fallback/race behavior. Confirmed inconsistent output, root cause not established. B06, unassigned. Do not mutate users/relationships merely to force counts to agree. Compare aggregates beyond default pagination limits too.

### QC-04 — Maps warnings when opening an existing editor

Open an existing owned entry's editor. Browser logs warn about Maps being loaded without `loading=async` and use of legacy `AutocompleteService`. Observed in B01 QC; no autocomplete outage was demonstrated. B11, unassigned. Check current official Maps documentation at implementation time and keep the existing valid configuration out of committed logs. Test selection, cleared values and absent/unavailable Maps behavior as well as loading.

### QC-05 — Router implementation labels in Expo web

Expo web shows `(auth)` above sign-in and `(app)` above the authenticated screens at phone sizes. Confirmed in screenshots, but iOS/Android behavior was not verified because no simulator was installed. B11, unassigned. Establish the intended supported web/native header behavior before changing navigation configuration; preserve back navigation and screen titles.

### QC-06 — Incomplete semantics on mobile pressables

Expo web's sign-in and several menu controls appear as generic text rather than named buttons in the accessibility tree. They can be clicked, but explicit roles and keyboard behavior need review. Confirmed web semantics issue; no screen-reader or native acceptance claim. B11, unassigned. Audit and fix controls in bounded screen groups, using meaningful labels, roles and focus behavior rather than adding implementation-only test selectors.

### OPS-01 — Duplicate deployment target

The consolidated main/implementation stage reported a successful primary `Vercel – cellar-snap` deployment and failing duplicate `Vercel – cellarsnap`. Source: [progress log](../audits/remediation-progress.md). Root cause and current project/domain ownership need inspection; no duplicate was disabled or deleted. B04, unassigned. A green primary deployment is not evidence that the duplicate is harmless, nor permission to delete it blindly.

### OPS-02 — Older claims are not present-day acceptance

The user's untracked `cellarsnap-fix-plan.md` and `cellarsnap-qa-report.md` date to March 25, 2026. They discuss nine topics: entry navigation highlight/hoisting; friend count; profile photo-grid broken images; feed loading skeleton; entry-detail empty-column layout; mobile feed columns; thumbnail error/blank handling; report dropdown Escape/outside-click/scroll dismissal; and app-wide skeleton states. The QA report explicitly skipped build/TypeScript because dependencies were absent and performed static review while declaring all nine passed.

Reconcile these against current code before a related batch: count issues likely overlap QC-03; thumbnail issues overlap AUD-38; skeleton/loading work overlaps AUD-37; other topics need present-day reproduction. Do not automatically reopen all nine or mark them closed from that report. If a distinct defect persists, allocate a new QC ID and link this intake item; retain evidence for topics verified fixed. The topics are reproduced here so continuity does not depend on preserving an untracked local file. B01 browser checks incidentally covered some layouts, but were not a dedicated rerun of all nine historical cases.

## Change history

- September 12, 2026, B02a: implemented the AUD-01 entry-row slice with an explicit B01 capability dependency, live catalog/function fixtures and policy/app tests; marked AUD-01/19 Partial, updated AUD-48, and published [handover](handovers/batch-02a.md). Known QC-02/03/04 reconfirmed; no unrelated fixes. No merge, production migration or live-fix verification.
- September 12, 2026: initialized all 50 audit IDs with explicit B01 partial/release boundaries; registered six QC and two operational/intake records. Added ordered batches, intake/completion rules and a fresh-session handover. No production implementation or schema changes in this planning pass.

For new findings, use the [intake template](README.md#finding-intake-and-local-tickets). Append the next ID rather than renumbering this inventory. For completed work, update the row and link dated verification/release evidence; preserve the record and original source.
