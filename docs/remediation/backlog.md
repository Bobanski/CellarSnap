# Canonical remediation backlog

Updated September 13, 2026. **68 records: all 50 original audit findings, sixteen browser/mobile QC findings, and two operational/reconciliation items.** This file is the work queue; do not maintain competing unchecked lists in successive handovers.

Read the [batch plan and workflow](README.md) and the latest handover linked there first. Original `AUD-NN` IDs map directly to section NN of the [September 12 audit](../audits/codebase-backend-audit-2026-09-12.md), which supplies detailed evidence and recommendations. QC sources are the [browser/mobile report](../audits/batch-1-browser-mobile-qc-2026-09-12.md). This index adds status, remaining scope, batch and a closure test; it does not replace those technical details.

**Ownership / external tickets:** unassigned unless a row links a PR or active branch. B01 PR #80 and B02a PR #82 are merged/deployed. B02b1's photo/group metadata slice is [PR #86](https://github.com/Bobanski/CellarSnap/pull/86), tracked with [issue #81](https://github.com/Bobanski/CellarSnap/issues/81) on `codex/b02b1-photo-group-privacy`. B02b2 Storage/share authorization is [PR #87](https://github.com/Bobanski/CellarSnap/pull/87) on `codex/b02b2-storage-privacy`, merged after #86 and referencing #81. Both are deployed; release commit `fd391aa`. There is no GitHub umbrella; these stable local IDs remain canonical. Issue #70 is closed brand/design work, not this backlog's umbrella.

**Release boundary:** AUD-02/03 are Closed. B02b1/B02b2 are merged, both exact SQL files are applied, and the primary web release is verified live. The broad authenticated Storage read policy has been removed. AUD-01 remains Partial for measured cache/revocation and supported-client acceptance; see [release handover](handovers/sql-rollout-b02b.md) and [live QC](../audits/b02b-production-rollout-qc-2026-09-12.md). Native binaries/OTA were not released. Recheck current deployment state when resuming.

## Original audit

| ID | Priority | Finding | Status | Batch / next acceptance evidence |
|---|---|---|---|---|---|
| AUD-01 | P0 | Entry/photo policies bypass privacy | Partial | B02a/B02b1/B02b2 entry, metadata/group and Storage/share repairs are merged/migrated/deployed; release `fd391aa`. [Live QC](../audits/b02b-production-rollout-qc-2026-09-12.md): fresh authorization, signing, hosted transforms, desktop/phone and Expo galleries passed. Broad Storage read removed. New share URLs last one hour. Remaining: define/verify revocation window for previously authorized SDK CDN hits, old signed URLs and supported installed clients; native coverage unavailable. Preserve prior B02a/B02b1/B02b2 implementation history in linked handovers. |
| AUD-02 | P0 | PUBLIC can write public-assets | Closed | B01 deployed as `20260912211719`. Live anon/auth upload, replacement and upsert denied; public reads and backend upload/update retained. Disposable object cleanup verified. [Live QC](../audits/sql-rollout-qc-2026-09-12.md). |
| AUD-03 | P0 | Client-editable privileged test-account flag | Closed | Enabled SECURITY INVOKER guard deployed in B01. Live escalation, privileged insert and tester revocation denied; ordinary profile edit and backend assignment/revocation passed. Existing flags fingerprint unchanged. [Live QC](../audits/sql-rollout-qc-2026-09-12.md). |
| AUD-04 | P0 | Personal embeddings globally readable/searchable | Closed | B03a/B03b [PR #90](https://github.com/Bobanski/CellarSnap/pull/90)/[PR #91](https://github.com/Bobanski/CellarSnap/pull/91) merged, all three SQL migrations live, primary production `63712c3` verified. Owner/curated boundaries, FK cleanup, synchronous invalidation and stale-publication rejection passed; 212 tests, live HTTP/concurrency/browser/Expo evidence. 384 original entries/384 personal chunks, zero orphan/stale/legacy personal chunks; curated 3,349 retained. [Release handover](handovers/b03-release.md). Native tooling unavailable; unchanged RPCs support existing clients. Broader retention/QC-09 remain separate. |
| AUD-05 | P1 | Identifier lookup exposes email/phone mappings | Closed | B04a PR #94 merged/deployed `db402fe`, exact SQL live `20260913020752`; 20 production checks and browser login passed. [Release evidence](handovers/batch-04b.md). Service-only RPCs, constant retired resolver, server login/recovery and stable shared limits; deliberate availability booleans retained. Native/delivery limitations documented. |
| AUD-06 | P1 | Public identity projection overexposes fields | Open | B02: explicit public DTO/projection honoring identity preferences and visibility, verified on web/mobile without breaking legitimate profile reads. Related QC-01. |
| AUD-07 | P1 | Unbounded/unsafe wine-list URL fetching | Closed | B04b/#95 released as `c83a5cb`: public DNS-pinned destinations/redirects, full-body deadline and byte caps. 250 tests plus production denials and legitimate 48-wine parse; [release](handovers/b04-release.md). Existing script-rendered empty extraction stays QC-11. |
| AUD-08 | P1 | Dependency advisories and undeclared runtime imports | Partial | B04c `588d49a`, [PR #98](https://github.com/Bobanski/CellarSnap/pull/98), issue #97: compatible Next 16/Expo 56 updates, declared Sharp, tar/Metro patches; root audit 13 → 0, mobile 29 → 14 moderate (no high/critical). 256 tests and web/mobile export/QC evidence in [handover](handovers/batch-04c.md). Merged/deployed/live-verified at `a0a9564`: [release](handovers/b04c-release.md). B04d `bd40acd`, [PR #100](https://github.com/Bobanski/CellarSnap/pull/100), repairs both remaining advisory roots with 7 installed-consumer contracts; root/mobile audits zero. [QC/handover](handovers/batch-04d.md). Merged #100 as `3527208`; combined web release `960caaa` live-verified. [Release](handovers/b04d-b05a-release.md). Native acceptance/distribution remains outstanding. |
| AUD-09 | P1 | Badge trigger/evaluator incompatibility and award authority | Partial | B06b #113 merged/live: 53 stored-fact definitions supported, 32 explicitly deferred; server-only award writes deployed and verified. [Release](handovers/b06b-b06d-release.md), [contract](b06-badge-contract.md), issue #112. B06e #117 authority SQL applied; hosted concurrency/HTTP and desktop/phone QC pass; merged `65a4c1c`, live web acceptance pending. [QC](../audits/b06e-qc-2026-09-13.md). QC-16 separately tracks missing Expo controls. Remaining deferred facts/semantics, historical review and native acceptance. Preserve all 85 definitions. |
| AUD-10 | P1 | Score-loader/schema drift | Partial | B01 fixes nonexistent quality_tier query and preserves wine_type, with tests/QC in PR #80. B07 still must resolve absent ai_notes_summary and the newly reproduced absent grape_aliases.alias_type resolver query, and prove the schema/loader contract. See merge-review evidence below. |
| AUD-11 | P1 | Refresh and on-demand scoring use different preferences | Open | B07: identical versioned inputs for seeded/unseeded single, batch, refresh and list-scan paths; numerical parity fixtures. |
| AUD-12 | P2 | Cached responses lose promised score fields | Open | B07: cold/warm response equivalence including explanation/confidence fields, or an explicit compatible score-only versus detail contract. |
| AUD-13 | P1 | Web/native entry lifecycle diverges | Open | B08: authoritative command/side-effect contract covering consumed/cellared/shared/group entries; parity across clients while preserving drafts and native I/O. |
| AUD-14 | P1 | Cellar drink/decrement/clone is non-atomic | Open | B08: ownership-checked transaction, conditional decrement/locking and idempotency; concurrent last-bottle/retry tests with grape cloning and side effects. |
| AUD-15 | P1 | Multi-table mutations rely on compensation/positions | Open | B08: stable request/row IDs, atomic boundaries, rollback/retry tests; retain intentional partial-import reporting. |
| AUD-16 | P1 | Import mapping discards custom types | Open | B08 correctness; B12 consolidation: preserve date, number, grape, bottle-format and currency custom fields across both import formats with round-trip fixtures. |
| AUD-17 | P1 | Explore grape query uses nonexistent column | QC passed — release pending | Merged B01 PR #80 fixes variety join; primary code deployment succeeded; schema query and browser community pulse passed. Positive disposable personal-grape fixture now passed in desktop/phone browser (1 wine, 92.0 average), and returned to empty after deletion. Release/live checks remain. |
| AUD-18 | P2 | Inconsistent validation on write paths | Open | B08: shared bounded runtime schemas, meaningful 400s and partial-update semantics; unsupported input rejected without erasing omitted valid fields. |
| AUD-19 | P1 | Migration history does not reproduce production | Partial | B05b [PR #105](https://github.com/Bobanski/CellarSnap/pull/105), issue #104, merged/live-verified `c93e172`: complete public/private schema captured, PGlite and actual PostgreSQL 17.6 replay/catalog equality plus drift/access checks passed; live structural checker matches. [Handover](handovers/batch-05b.md). Remaining: managed-service provisioning, reviewed seed/corpus restore and full fresh-product setup. No production DDL. Prior work: B02a captured affected live policies/grants and executable entry-helper fixtures; documented text-vs-enum drift in the [access contract](b02a-access-contract.md). Targeted real PostgreSQL 17/PostgREST replay passed in merge review. B01/B02a are now deployed with exact SQL checksum/version mapping in the [rollout handover](handovers/sql-rollout-b01-b02a.md). B02b1 adds fresh photo/group policies, schema metadata and actual targeted PostgreSQL/PostgREST replay in [PR #86](https://github.com/Bobanski/CellarSnap/pull/86). B02b2 adds captured Storage policies/path-shape aggregates and real Storage v1.77.0 migration/service replay in [PR #87](https://github.com/Bobanski/CellarSnap/pull/87). B02b1/B02b2 are now deployed with exact remote checksum mapping in the [release handover](handovers/sql-rollout-b02b.md); hosted managed Storage ownership required a checked RLS prerequisite instead of redundant ALTER TABLE. B03 adds captured knowledge catalog, actual pgvector policy/lifecycle tests, hosted rolled-back rehearsal and three checksum-mapped live migrations ([release](handovers/b03-release.md)). B05b supplies reviewed app baseline/replay/drift and captured triggers/history; seed and full-platform reconciliation remain. Never replay historical SQL on production. |
| AUD-20 | P1 | Compatibility branches lack retirement contract | Open | B05 supported schema/mobile window; B15 deletion: instrument fallback usage and remove only obsolete schema branches while preserving nullable/input recovery and access controls. |
| AUD-21 | P1 | Database types drift from schema/domain DTOs | Partial | B05c [PR #106](https://github.com/Bobanski/CellarSnap/pull/106), issue #104, merged/live-verified `c93e172`: one generated source, typed web/mobile factory bridges and grape/producer browse query adoption. [Contract](b05-type-adoption.md). QC passed within [B05c scope](handovers/batch-05c.md); [release evidence](handovers/b05b-b05c-release.md). Unadopted clients/queries remain explicit. B05: generate one type source from reviewed schema, adopt client factories/query result typing, keep public DTOs/validators distinct and CI-check drift. |
| AUD-22 | P2 | Duplicated entry/photo/group representations lack ownership | Open | B08: document canonical writer and derived copies, reconcile before retirement; retain OCR provenance, separate tasting ratings and collection snapshots. |
| AUD-23 | P2 | RLS policy overhead and redundant predicates | Open | B14 after B02/B05: equivalent allow/deny behavior plus representative plans; role targeting and optimized row-independent auth calls. |
| AUD-24 | P2 | Missing/query-misaligned indexes | Open | B14 or justified earlier slice: reconcile notification/FK/query indexes; representative before/after plans rather than speculative indexes on tiny tables. |
| AUD-25 | P3 | Proven duplicate indexes | Open | B14: compare definitions, predicates, constraints and workloads; drop only demonstrated redundancy while preserving uniqueness/FK/operational needs. |
| AUD-26 | P2 | Retention and derived refresh metadata undefined | Partial | B03b personal embedding snapshot ownership, edit/delete invalidation and bounded publication are merged/deployed/live-verified. [Release](handovers/b03-release.md). B10 still needs broader retention, derived-context cleanup (related QC-09), incremental/background refresh and provenance/version contracts. |
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
| AUD-48 | P1 | Regression baseline incomplete/untrustworthy | Partial | Current released B04d/B05a baseline: 266 tests (256 isolated, including six real Sharp codec cases, plus 7 dependency and 3 tooling contracts), live web and actual Fast Refresh QC; prior released B04 baseline: 250 tests, including database auth/grant tests and 31 streaming/DNS/deadline cases; 20 live auth checks, six live menu checks and desktop/phone/Expo QC. [Release](handovers/b04-release.md). Earlier Storage/knowledge evidence remains valid in B01–B03 reports. Native, recovery delivery and future import/cache/scoring coverage remain explicit obligations. |
| AUD-49 | P2 | Nested worktrees enter tooling/watch roots | Closed | B01 lint/TypeScript exclusions plus B05a PR #102 Metro/Tailwind/Git boundaries; merged/live web `960caaa`. Real file map 660 → 0 agent files, shared sources retained, actual watch/class-scan tests and browser Fast Refresh/desktop/phone/Expo checks. [Release](handovers/b04d-b05a-release.md). Existing checkout preserved; no native distribution needed for the development-tooling contract. |
| AUD-50 | P2 | Silent degradation and stale engineering context | Partial | B04 adds full-download timing/bytes and explicit bounded-input failures; auth limiter failures close protected paths with sanitized warnings. Current handover/intake records QC-10/11/12 and prior QC-09. Request/job IDs, query counts, cache/fallback/AI usage and broader actionable error reporting remain work. |

## New and operational findings

| ID | Priority | Finding | Status | Batch / acceptance |
|---|---|---|---|---|
| QC-01 | P1 | Mobile public feed displays raw numeric ratings | Open | B02: enforce the intended qualitative public presentation and review public payloads; preserve owner's private 1–100 input. Related AUD-01/06/44. |
| QC-02 | P2 | Web library dates shift one day in negative UTC offsets | Partial | B06a PR #110 / `d4e5cd2`: web fix merged/live-verified, shared mobile source and Expo desktop/phone QC passed, six timezone contracts passed. Native runtime/distribution pending; #109 stays open. [Release](handovers/b05d-b06a-release.md). |
| QC-03 | P2 | Profile/menu country and friend counts disagree | Partial | B06c #114 merged/live: shared complete own-summary, cookie/bearer and desktop/phone/Expo count parity passed. [Release](handovers/b06b-b06d-release.md), issue #112. B06f unknown-count routing repaired; desktop/phone outage, zero and recovery QC passed, release pending. [Handover](handovers/batch-06f.md). Native runtime/distribution remain; broader average/top statistics and session ownership stay AUD-35/39. |
| QC-04 | P2 | Maps loader/legacy Places warnings | Open | B11: async loading and supported Places contract; location autocomplete still works, relevant warnings eliminated and load impact measured. Related AUD-37. |
| QC-05 | P2 | Expo web exposes router group titles | Open | B11: intended headers on sign-in/app screens without `(auth)`/`(app)` labels; verify native stacks when runtime available. Severity is provisional for native impact. |
| QC-06 | P2 | Mobile web pressables lack button roles | Open | B11: audit affected pressables' role/name/focus/keyboard behavior; DOM and accessible native behavior verified where available. |
| QC-07 | P1 | Mobile entry details read an absent grape table | Open | B08 with AUD-13/21: use canonical relation, surface query failures, retain grapes during unrelated edits; positive web/mobile detail/save fixture. See evidence below. |
| QC-08 | P2 | Event card details link differs from selected wine slide | Partial | B06d #115 merged/live: stable selected slide controls caption/details, deliberate context behavior; web/Expo A/B/context/reordered/restricted checks pass. [Release](handovers/b06b-b06d-release.md), issue #112. Native runtime/distribution remains. |
| QC-09 | P2 | Sommelier makes unsupported cellar/write claims | Needs triage | B10/AUD-50 follow-up: after fixture deletion, chat denied the note but claimed the bottle was listed and offered to save a note without a write tool. Distinguish stale context from generation error; ground existence and capabilities. [Evidence below](#qc-09--unsupported-sommelier-existence-and-write-claims). |
| QC-10 | P2 | Expo recovery retains a displaced page scroll after navigation | Open | B04c fixed 390×844 single-tab retest reproduced root top -160/scrollY 160 and light gap. B11: restore full-height background/navigation scroll and verify available native behavior. [QC](../audits/b04c-dependency-qc-2026-09-12.md). |
| QC-11 | P2 | Script-rendered menu reports successful empty scan | Open | B11 bounded parser follow-up: reject empty/unreadable results with upload guidance; preserve supported server-rendered menus. |
| QC-12 | P2 | Expo single-photo feed cards render loaded images at zero height | Open | B11: reproduce/fix static Image sizing under Pressable; candidate and prior B04c export both reproduce. Related AUD-38/OPS-02; see detail below. |
| QC-13 | P1 | Grape search rejects native bearer authentication | Closed | B05d PR #108 / `719ad1d`, live-verified again at `d4e5cd2`: typed cookie/bearer parity, alias/name/limit/failure contracts and cookie-stripped Expo passed. No native binary needed for the server fix; native device acceptance remains unavailable. [Release](handovers/b05d-b06a-release.md). |
| QC-16 | P2 | Expo featured-badge handler has no reachable UI control | Open | B06g / AUD-09; bearer legacy authority passes but no client feature/clear interaction exists. See detail below. |
| QC-15 | P2 | Transient local profile JSON parse failure | Not reproducible | B06e resume: clean production build and dev 3004 repeated profile loads pass, no JSON errors. Original cause unknown; retain reproduction history and reopen on recurrence. [QC](../audits/b06e-qc-2026-09-13.md). |
| QC-14 | P2 | Seeded grape alias normalization drops uppercase letters | Partial | B05e repair applied `20260913080026`; 130 valid keys, unchanged varieties/entry joins, web/cookie/bearer QC passed. Mobile manual alias search implemented and Expo-tested; source merge/native distribution pending. [Handover](handovers/batch-05e.md). |
| OPS-01 | P2 | Duplicate legacy Vercel project fails deployments | Open | Missing Supabase env confirmed at prerender. B04: identify intended ownership/domain/deployment targets; repair or retire duplicate only after confirming routing and rollback. Preserve working primary project. |
| OPS-02 | P2 | Historical local UI reports need reconciliation | Needs triage | Intake before the relevant batch: reproduce/deduplicate the nine March topics listed below; do not import historical static “PASS” as current QC. |

### QC-01 — Public rating exposure on mobile

Discovered during B01 QC at `0e7acb0`, using the existing E2E account. Open the same public feed card on web and Expo web: the web card shows “Loved it,” while mobile shows `92/100`. Project conventions define raw ratings as private inputs. Confirmed in the mobile feed path `apps/mobile/app/(app)/feed/index.tsx`, which calls `getFeedDisplayRatingLabel` from `packages/shared/src/feed.ts`; these files were unchanged by B01. Test other public surfaces and payloads as part of the fix, not just this label. B02, unassigned, no external ticket/PR yet. Native visual reproduction remains outstanding.

### QC-02 — Date-only parsing changes the calendar day

In the New York timezone, searching `Proof Private` in web Library shows July 7 for an existing synthetic fixture whose detail and mobile show July 8. `src/components/palate/LibraryTab.tsx:48` calls `new Date(iso).toLocaleDateString(...)`, shifting midnight UTC date strings. Confirmed display mismatch; the stored value was not shown to be corrupted. B06, unassigned. Fix formatting semantics without migrating valid dates; test both date-only and timestamp contracts deliberately.

### QC-03 — Inconsistent summary counts

**September 13 update — Partial:** #114 merged and live-verified; [release evidence](handovers/b06b-b06d-release.md). Complete owner consumed-entry/country/friend/badge contract replaces divergent page-based counts. Native runtime/distribution and browser outage visual acceptance remain; broader stats/session ownership deferred. Original discovery follows.

For `e2e_user_a` during B01 QC: web profile one country, web menu/mobile cellar two; web menu two friends, mobile menu zero. Reproduce from the same seeded relationship/entry set; distinguish count definition differences from loading fallback/race behavior. Confirmed inconsistent output, root cause not established. B06, unassigned. Do not mutate users/relationships merely to force counts to agree. Compare aggregates beyond default pagination limits too.

### QC-04 — Maps warnings when opening an existing editor

Open an existing owned entry's editor. Browser logs warn about Maps being loaded without `loading=async` and use of legacy `AutocompleteService`. Observed in B01 QC; no autocomplete outage was demonstrated. B11, unassigned. Check current official Maps documentation at implementation time and keep the existing valid configuration out of committed logs. Test selection, cleared values and absent/unavailable Maps behavior as well as loading.

### QC-05 — Router implementation labels in Expo web

Expo web shows `(auth)` above sign-in and `(app)` above the authenticated screens at phone sizes. Confirmed in screenshots, but iOS/Android behavior was not verified because no simulator was installed. B11, unassigned. Establish the intended supported web/native header behavior before changing navigation configuration; preserve back navigation and screen titles.

### QC-06 — Incomplete semantics on mobile pressables

Expo web's sign-in and several menu controls appear as generic text rather than named buttons in the accessibility tree. They can be clicked, but explicit roles and keyboard behavior need review. Confirmed web semantics issue; no screen-reader or native acceptance claim. B11, unassigned. Audit and fix controls in bounded screen groups, using meaningful labels, roles and focus behavior rather than adding implementation-only test selectors.

### QC-07 — Mobile entry detail reads an absent grape table

- Priority / status: P1 / Open; B08 with AUD-13/21; unassigned, no implementation PR.
- Discovered: September 12 merge review of `01a3fdd` product code (test additions `d6a6da7`); production Expo web 390/320px. `apps/mobile/app/(app)/entries/[id].tsx:1029` is unchanged from main `778e43c`.
- Evidence: load a disposable private entry with one canonical `entry_primary_grapes` → Cabernet Sauvignon link. Web detail/grape statistics show the grape; Expo detail shows “Not set.” Its `wine_entry_primary_grapes` query returns PGRST205; live `to_regclass` is null. Errors are discarded. That screen derives selected editor grapes from the empty result, then replaces canonical links on save.
- Impact: confirmed missing details; possible grape loss during an unrelated mobile save is source-evidenced but not exercised. Existing data was not edited. Related schema/type drift AUD-21 and lifecycle parity AUD-13.
- Acceptance: load the canonical ordered grape relation, expose meaningful failure state, verify existing multiple grapes survive a notes-only edit and deliberate grape edits persist across web/mobile. Test positive/empty/failed reads with disposable fixtures and native when available.
- Deployment / recovery: future mobile code release, no migration assumed. Review historical damage separately before any backfill. [QC report](../audits/merge-readiness-qc-2026-09-12.md).

### QC-08 — Event card links to a different wine than its selected slide

- Priority / status: P2 / Partial; B06d #115 merged and live-verified September 13. [Release](handovers/b06b-b06d-release.md); native runtime/distribution remains. Original discovery is preserved below.
- Discovered: September 12 B02b1 QC, implementation `256a76f` based on main `a122d70`; unchanged `src/app/entries/page.tsx:299` and `:384`. In-app web desktop 1365×900 and phone 390×844.
- Reproduction: create a disposable group whose representative library row is a later private sibling, while slide 1 is the public anchor. Open My Events and select the public wine. Its caption names the public wine, but the `Open details` link targets the private sibling because it uses `entry.id`, not `activeSlide.entry_id`. A context slide falls back to the same unrelated representative wine caption. See [QC report](../audits/b02b1-photo-group-qc-2026-09-12.md).
- Expected / actual: a wine slide's details action should identify/open that selected wine; current navigation and caption can disagree. For context slides, define a deliberate event/anchor fallback rather than accidentally choosing a representative row.
- Impact / confidence: confirmed web navigation correctness defect. No new access-control bypass demonstrated; row RLS still denies unauthorized detail. Mobile has similar source logic, but the interactive selected-slide mismatch was not verified because touch navigation was unavailable.
- Related IDs / dependencies: AUD-13/42 (group workflow parity), QC-06 (mobile control semantics); not the AUD-01 metadata root cause.
- Acceptance: public/private/mixed and reordered group fixtures; selected wine A/B opens its own authorized detail; context behavior is clear; desktop, phone and available native tests. Do not remove grouped events.
- Deployment / recovery: future web/mobile code release; no migration assumed. B02b1 did not edit this UI file. Preserve finding until implementation and relevant release checks are recorded.

### AUD-10 — Additional merge-review resolver evidence

The B01 score-loader correction remains implemented; do not overwrite its history. A successful disposable web notes save logged `persistEntryResolution` fallback to stub. The unchanged `src/server/algorithm/aliasLookup.ts:164` selects `grape_aliases.alias_type`, which is absent from the live column catalog. Authenticated direct reproduction returns 42703. The resolver catches this through its existing fallback; TypeScript/build do not catch it. B07/B05 acceptance must reconcile this query with the reviewed deployed contract, test a successful grape alias resolution and failure handling, and retain raw inputs/normal saves. It was not silently fixed in this privacy review. Related AUD-19/21/50; [evidence](../audits/merge-readiness-qc-2026-09-12.md).

### OPS-01 — Duplicate deployment target

The consolidated main/implementation stage reported a successful primary `Vercel – cellar-snap` deployment and failing duplicate `Vercel – cellarsnap`. Source: [progress log](../audits/remediation-progress.md). Merge review inspected failed deployment `Dtt79wpzaCQPy9hZzu193dahWLo9`: `/entries/new` prerender throws `Missing Supabase environment variables.` Duplicate project ID is `prj_gmWfsDsFQ2AlcPhBH5myZdyzxUAr`; primary `cellar-snap` succeeds. Current domain/ownership disposition still needs inspection; no duplicate was disabled or deleted. B04, unassigned. A green primary deployment is not evidence that the duplicate is harmless, nor permission to delete it blindly.

### OPS-02 — Older claims are not present-day acceptance

The user's untracked `cellarsnap-fix-plan.md` and `cellarsnap-qa-report.md` date to March 25, 2026. They discuss nine topics: entry navigation highlight/hoisting; friend count; profile photo-grid broken images; feed loading skeleton; entry-detail empty-column layout; mobile feed columns; thumbnail error/blank handling; report dropdown Escape/outside-click/scroll dismissal; and app-wide skeleton states. The QA report explicitly skipped build/TypeScript because dependencies were absent and performed static review while declaring all nine passed.

Reconcile these against current code before a related batch: count issues likely overlap QC-03; thumbnail issues overlap AUD-38; skeleton/loading work overlaps AUD-37; other topics need present-day reproduction. Do not automatically reopen all nine or mark them closed from that report. If a distinct defect persists, allocate a new QC ID and link this intake item; retain evidence for topics verified fixed. The topics are reproduced here so continuity does not depend on preserving an untracked local file. B01 browser checks incidentally covered some layouts, but were not a dedicated rerun of all nine historical cases.

## Change history

- September 12, 2026, B03a/B03b: merged #90/#91, deployed three checksum-verified SQL migrations and primary web release `63712c3`, regenerated personal vectors, completed live access/concurrency/browser/Expo QC and fixture cleanup. Closed AUD-04; AUD-26/19/48/50 remain Partial for their broader scope. Added QC-09 (Needs triage). [Release handover](handovers/b03-release.md).

- September 12, 2026, B02b2: source-authorized Storage and anonymous share signing implemented in [PR #87](https://github.com/Bobanski/CellarSnap/pull/87), stacked on #86. 196 tests, 148 actual isolated object-service HTTP checks and desktop/phone/Expo QC passed with explicit limits. Reclassification, eight slide-only members and stale share authorization addressed under AUD-01. SQL/code not deployed; live fixtures removed. [Handover](handovers/batch-02b2.md).

- September 12, 2026, B02b1: implemented photo/group metadata policies and web/mobile pre-sign filtering in [PR #86](https://github.com/Bobanski/CellarSnap/pull/86); 189 tests, 54 isolated HTTP checks and browser/Expo QC passed with documented limits. AUD-01 remains Partial; new SQL not deployed. Added QC-08 and corrected stale backlog count/release prose. [Handover](handovers/batch-02b1.md).

- September 12, 2026, authorized SQL rollout: both exact migrations deployed and recorded; live API/Storage/web/Expo checks passed and fixtures cleaned. Closed AUD-02/03, kept AUD-01 Partial for B02b, and recorded remote version/checksum mappings for AUD-19. [Handover](handovers/sql-rollout-b01-b02a.md).

- September 12, 2026, approved merge: #80 merged as `25f14e1`, then #82 as `c22a45c` after retarget/recheck. Primary production code deployment succeeded; SQL remains undeployed and live policy acceptance outstanding. Partial/release-pending findings remain open. [Merged handover](handovers/merged-b01-b02a.md).

- September 12, 2026, merge review: completed targeted real HTTP integration and production web/Expo QC, added positive personal-grape fixture coverage, confirmed OPS-01 env failure, recorded QC-07 and additional AUD-10 drift. Code recommended for final owner review; no merge, migration deployment or live-fix verification. [Handover](handovers/merge-readiness.md).

- September 12, 2026, B02a: implemented the AUD-01 entry-row slice with an explicit B01 capability dependency, live catalog/function fixtures and policy/app tests; marked AUD-01/19 Partial, updated AUD-48, and published [handover](handovers/batch-02a.md). Known QC-02/03/04 reconfirmed; no unrelated fixes. No merge, production migration or live-fix verification.
- September 12, 2026: initialized all 50 audit IDs with explicit B01 partial/release boundaries; registered six QC and two operational/intake records. Added ordered batches, intake/completion rules and a fresh-session handover. No production implementation or schema changes in this planning pass.

For new findings, use the [intake template](README.md#finding-intake-and-local-tickets). Append the next ID rather than renumbering this inventory. For completed work, update the row and link dated verification/release evidence; preserve the record and original source.

### AUD-01 — Hosted cached-download residual after B02b rollout

- Priority / status: P0 / Partial; original ID preserved. Fresh source authorization is remediated; immediate cached-byte revocation is not.
- Discovered: September 12, 2026 (September 13 UTC), actual production `fd391aa` and exact deployed B02b SQL.
- Evidence: designated non-owner B first downloads an authorized disposable public label with SDK `download()`. Owner sets label privacy private. Same SDK URL returns 200, `cf-cache-status: HIT`, `Cache-Control: public, max-age=3600`; unique query key and explicit authenticated route return 400/BYPASS, RPC false and new signing denied. Already-issued signed URL also remains valid. [Full reproduction, failed check and retest](../audits/b02b-production-rollout-qc-2026-09-12.md).
- Scope: confirmed same previously authorized request cache behavior; no claim of fresh unauthorized-user access. Do not infer a universal one-hour expiry, global signature TTL cap, native coverage or automatic old-URL invalidation.
- Target / acceptance: bounded B02 cache/delivery follow-up. Define intended revocation window; measure same/new JWT through expiry, signed and transformed delivery, old installed clients; verify chosen compatible changes without losing legitimate owner/shared photo flows. AUD-04/B03 remains urgent independent work.
- Release / recovery: current RLS/helper/share release remains deployed; no broad read restoration, bulk object invalidation or ordinary session revocation. All disposable fixtures removed and profile flags restored.

### AUD-26 — B03b publication latency found during QC

Actual 386-source regeneration on September 12 took about one minute with one publication HTTP request per entry. This regression in the new lifecycle writer is corrected within B03b by a 100-entry service-only batch wrapper retaining per-entry locks/snapshot checks and transactional rollback. It reduces publication requests to four; actual 386-entry retest took 25.448 seconds with zero skips. Merged/deployed in PR #91; see the release handover. Existing incremental refresh/job/retention scope remains B10. [Evidence](../audits/b03b-knowledge-lifecycle-qc-2026-09-12.md).

### QC-09 — Unsupported sommelier existence and write claims

- Priority / status: P2 / Needs triage (observed response confirmed; underlying cause not established).
- Discovered: September 12, 2026, production `63712c3`, in-app browser 390×844.
- Source / reproduction: create a disposable B03 Blue Lantern entry for designated account B, save a note, delete it through the production entry API, reload `/sommelier`, ask whether the account has a tasting note for that wine. SQL confirmed no source entry/chunk; the fresh reply correctly denied having a note, but said it could see the bottle listed and offered to save a note. `src/server/sommelier/chat.ts` supplies the general chat prompt; the tested endpoint does not expose a note-saving tool.
- Expected / actual: qualify unavailable cellar information and accurately describe capabilities. Actual reply overstated both. No deleted tasting-note text was returned; this is not evidence of a renewed cross-user leak.
- Impact / confidence: may mislead users about cellar state or edits; response observed, stale-context versus model-generation cause needs triage.
- Related IDs / dependencies: AUD-26 broader derived-context retention, AUD-50 observability; AUD-04 embedding isolation remains independently verified.
- Target batch / owner / issue / PR: bounded sommelier grounding follow-up in B10 / unassigned / none / none. Does not displace urgent AUD-05/B04.
- Acceptance: capture sanitized assembled context for controlled existing/deleted/unknown wines; validate existence claims and never claim to save without an implemented authorized action. Deterministic prompt/contract tests plus browser/mobile fallback retests.
- Deployment / rollback: no fix implemented. Preserve current privacy policies/FKs.
- Verification / residual work: [B03 release handover](handovers/b03-release.md); screenshot `/tmp/cellarsnap-b03-qc/production-phone-deleted.png`. Reproduction above is independent of local artifacts.

### AUD-05 — B04a identifier/contact containment
- Priority / status: P1 / Closed for hosted authority/API scope.
- Branch / issue / PR: `codex/b04a-identifier-privacy` / #93 / #94; product head `4870c37`.
- Evidence: [QC report](../audits/b04a-auth-privacy-qc-2026-09-12.md), [handover](handovers/batch-04a.md), captured live catalog and actual migration role tests.
- Acceptance implemented: no unauthenticated contact projection, backend-only lookup/availability RPCs, existing session API for web/mobile, uniform recovery response shapes, stable shared anonymous limits and protected-path failure containment.
- Release: PR #94 / main `db402fe` deployed before exact migration `20260913014834_restrict_contact_resolution.sql` was applied as `20260913020752`, MD5 `0a15926a59392db0f4906d5be3c30dcc`. Twenty live assertions and production browser username login passed. [Release handover](handovers/b04-release.md). Old web tabs require reload. Availability booleans remain deliberately public through limited APIs. No native runtime, live delivery or password-change coverage.

### QC-10 — Expo recovery scroll/background gap after responsive navigation
- Priority / status: P2 / Open (confirmed Expo web; native impact unverified).
- Discovered: September 12, 2026, B04a `4870c37`, fresh Expo production web export in in-app browser at 390×844.
- Reproduction: sign in/sign out, switch desktop to phone viewport, submit unknown username recovery. Reset form appeared with a light gap below its dark screen. DOM showed root height 844 but top -136; reload restored top 0.
- Expected / actual: recovery screen should fill viewport; a displaced root exposed page background. No input or data loss observed.
- Impact / confidence: B04c `588d49a` reproduced after a fresh sign-in-page reload and recovery-link navigation at a fixed 390×844 single-tab viewport, without resizing between steps. Root top -160, height 844, scrollY 160; light bottom gap and document overflow. Confirmed Expo web navigation/scroll defect; native behavior remains unverified. Preserves the original uncertain B04a report; distinct from QC-05 route headings.
- Target batch / owner / issue / PR: B11 / unassigned / none / none.
- Acceptance: reproduce at a fixed phone viewport, verify recovery navigation/keyboard dismissal and full-screen background on browser plus available native runtime; close as harness-only if not reproducible outside resizing.
- Deployment / rollback: no product change made. Reload cleared the observed offset. Optional screenshot `/tmp/cellarsnap-b04-qc/expo-recovery-phone.png`; textual reproduction above is canonical.

### AUD-07 — B04b bounded remote menu transport
- Priority / status: P1 / Closed for remote transport scope; branch `codex/b04b-bounded-menu-fetch`, issue #93 / PR #95; final product `bc8ac20`, released main `c83a5cb`.
- Scope and acceptance: public-only DNS-pinned sockets, every redirect validated, full download deadline and encoded/decoded byte caps; preserve legitimate menu/PDF/image inputs.
- Evidence: 250 isolated tests, type/lint/build, real HTTPS HTML/PDF parsing and desktop/phone/Expo scanning. [QC report](../audits/b04b-remote-menu-qc-2026-09-12.md). [Current handover](handovers/batch-04b.md).
- Release: PR #95 merged; primary production `dpl_3xyryoBujFvufLxw7Gf3aibBChDY` Ready with cellarsnap.app alias. Six live API checks and production phone rejection/filter plus desktop/phone results passed; no migration required. Five session QC scans removed with baseline retained. [Release handover](handovers/b04-release.md). AUD-08 remains open; adding the pinned address parser does not remediate the advisory backlog.

### QC-11 — Script-rendered wine list reports success with no wines
- Priority / status: P2 / Open; confirmed during B04b against main `db402fe` plus bounded fetch changes.
- Source / reproduction: scan `https://restaurantbeck.com/wine.html` in Expo web. HTTP 200 scan persisted zero wines; results show 0/0 and misleading scoring-unavailable copy even though the public website lists wines. Wine objects are inside a script that the existing HTML extractor removes.
- Regression check: original fetch and bounded downloader produced identical 35,257-byte documents, SHA-256 `bbdfbffd66090f8a147ab0669015f9055fb6ab16e019c151113dee5d853bb9d8`; existing extraction/model behavior, not a destination/transport failure. No browser-script execution was added to the scanner.
- Expected / actual: unreadable or empty parsed sources should show a useful upload/readability fallback, not a saved successful empty scan or claim a scoring outage. Do not promise all JS sites can be safely rendered by the server.
- Related IDs / target batch / owner / issue / PR: AUD-07 compatibility evidence, separate B11 scanner correctness follow-up / unassigned / none / none.
- Acceptance: server-rendered menu continues to parse; scripted/empty sources fail clearly or use a deliberately supported safe extraction path; browser/Expo results show accurate error state and do not persist empty successes. Add route/parser regression fixtures.
- Deployment / rollback: no fix added to B04b. Disposable empty scan removed during release cleanup. Screenshot optionally `/tmp/cellarsnap-b04-qc/expo-scripted-menu-empty.png`; reproduction and evidence above are durable.

### AUD-08 — B04c compatible dependency slice
- Priority / status: P1 / Partial; `codex/b04c-dependencies`, product `588d49a`, issue #97 / PR #98.
- Evidence: [advisory snapshot](evidence/b04c-dependencies.json), [QC report](../audits/b04c-dependency-qc-2026-09-12.md), [handover](handovers/batch-04c.md). Root full/production audit zero, mobile 14 moderate propagated entries from two roots. Compatible updates and directly declared Sharp merged in PR #98, deployed/live-verified at `a0a9564`; [release handover](handovers/b04c-release.md) records eight live HTTP checks, desktop/phone QC and cleanup. Native binary/OTA and acceptance remain pending.
- Remaining runtime exposure: Expo Router uses query-string 7 CommonJS and vulnerable decode-uri-component 0.2.2. The repaired 0.5 decoder is ESM; implement an explicit compatible integration and test malformed external URLs, routing/auth callbacks and native deep links. No blind ESM override or Expo downgrade.
- Remaining tooling exposure: xcode 3 uses uuid 7 v4 without a supplied output buffer; advisory concerns v3/v5/v6 buffer bounds, so inspected consumer does not establish an exploit path. Deliberate upgrade/override contract remains; do not claim the mobile audit is clean.
- Acceptance: preserve web/mobile behavior, remove or explicitly resolve residual advisory roots with current upstream evidence, pass clean installs/isolated/build/browser/native checks as available, then record merge/deployment/live verification. Retire tar and aligned Metro patch overrides when parent packages support repaired versions.
- Scope boundary: QC-10 confirmed under its existing ID; no unrelated B11 layout repair, SQL migration or hosting change included.

### B04d active slice — AUD-08
- September 13, 2026 UTC: `codex/b04d-mobile-dependency-contracts`, based on `05d9e7b`, issue #97. In progress: explicitly package the upstream patched decoder for the CommonJS router and validate the xcode/uuid tooling contract. Native acceptance/distribution remains separate. B05a watcher boundaries follow after this checkpoint.

### QC-12 — Expo single-photo feed image has zero rendered height
- Priority / status: P2 / Open; confirmed Expo web, native impact unverified.
- Discovered: September 13, 2026 UTC, B04d `bd40acd`; prior B04c production export `588d49a` reproduces with the same account and viewport.
- Source / reproduction: `apps/mobile/app/(app)/feed/index.tsx:840`, static Image under Pressable. Sign into exported Expo web using designated A, open All feed at 390×844. First single-photo card reserves a blank photo area; image has naturalWidth 3024, rendered height 0. Desktop blank also observed. Next renders the same loaded photo correctly.
- Expected / actual: photo visible after authorized bytes load; actual single-photo Image is zero height. Suspected percentage height under unsized Pressable requires focused layout confirmation. This is not an authorization failure or established B04d regression.
- Related IDs / batch / owner / issue / PR: AUD-38, OPS-02 historical blank-image intake / B11 / unassigned / none / discovered in #100.
- Acceptance: disposable single/multiple/grouped photo fixtures; visible image bounds and gallery interaction at phone/desktop plus available native runtime; preserve source authorization.
- Deployment / rollback: no fix in B04d; no data changes. [QC evidence](../audits/b04d-mobile-dependency-qc-2026-09-13.md).
- Verification / residual: prior-build comparison confirms existing Expo web behavior, not native behavior; underlying sizing fix remains open.

### B04d QC checkpoint — AUD-08 / QC-10
- Product `bd40acd`, PR #100: 256 isolated + 7 dependency contracts, clean mobile install, root/mobile audits zero, web/mobile type/lint, Next build, all Expo exports and disposable SDK 56 iOS prebuild passed. See [handover](handovers/batch-04d.md). Merge/release pending, native acceptance/distribution outstanding.
- The upstream decoder still hit regex-size limits on a long malformed run; equivalent literal replacement fixed and retested within AUD-08. The installed-consumer test catches broken npm local-file resolution even when audit reports zero.
- QC-10 remains Open: this fixed-phone recovery run had rootTop/scrollY 0 but scrollWidth 450 versus viewport 390. Existing displaced-root history retained; B11 should inspect decorative overflow as part of the same recovery viewport contract.

### B05a active slice — AUD-49
- September 13, 2026 UTC: `codex/b05a-tooling-boundaries`, issue #101, stacked on B04d `0619dd1`. In progress: Metro file-map/watch and Tailwind source exclusion of nested `.claude` checkouts; preserve default exclusions and shared package refresh. AUD-19/21 remain separate.

### B04d/B05a released — September 13, 2026
- PR #100 merged as `3527208`; PR #102 merged as `960caaa`; primary web `dpl_73JpFDVgvoe9LSJwoUfx6LDTDhrr` Ready on cellarsnap.app. Live desktop/phone login/feed/images/filter/sign-out and four HTTP smoke checks passed. No migration or data mutations. [Release handover](handovers/b04d-b05a-release.md).
- AUD-08 remains Partial: both dependency roots repaired and root/mobile audits zero; no working native simulator/emulator or native rebuilt-client distribution. Issue #97 remains open. Historical residual-analysis paragraphs above describe pre-B04d state and are superseded for implementation status by the release handover.
- AUD-49 Closed for its stated tooling contract. Three actual Metro/Tailwind contracts join seven dependency tests and 256 isolated checks in CI; shared-source watch events retained. Issue #101 / PR #102. Broader B05 AUD-19/21 remain pending.
- QC-10: auth decoration overflow also observed on sign-in, viewport/document 390/450 and 1440/1500. Same auth shell/viewport family; retain prior scroll displacement evidence and resolve deliberately in B11. QC-12 remains a separate image-sizing finding.

### QC-13 — Grape autocomplete ignores valid native bearer sessions
- Priority / status: P1 / Closed for server auth parity after B05d release.
- Discovered: September 13, 2026, B05c candidate based on `e52caf0`; unchanged route authentication reproduced against live pre-B05c production.
- Source / reproduction: `src/app/api/grapes/route.ts` creates a cookie-only server client and calls `auth.getUser()` without reading Authorization. Mobile Explore Browse, taste-survey and cellar-add send bearer headers to this route. Sign in as a designated account, issue a cookie-free `GET /api/grapes?q=nebbiolo&limit=8` with that valid token: local and production both return 401; `/api/taste-survey` with the same token returns 200. No account details or tokens are part of the evidence.
- Expected / actual: valid native sessions should receive authorized grape results; actual API-only/native callers are rejected. Web cookie search passes. Same-host Expo web can inherit web cookies and mask the defect, so separate bearer-only HTTP verification is required.
- Impact / confidence: confirmed existing cross-platform search correctness defect, not introduced by type adoption. No access-control bypass demonstrated.
- Related IDs / dependencies: AUD-39 auth/bootstrap consistency, AUD-21 typed route adoption.
- Target batch / owner / GitHub issue / PR: B05d bounded authenticated query slice / unassigned / #104 / none.
- Acceptance: shared request auth with typed cookie/bearer clients; valid bearer and cookie lookup parity, invalid/anonymous 401, alias/name/ranking/limit regressions, browser and Expo autocomplete checks with no cookie masking; native acceptance when available.
- Deployment / rollback: route code only; no SQL/data migration required. Preserve missing-reference-table 503 semantics.
- Verification / residual work: no fix in B05c; deterministic source and HTTP reproduction above are sufficient to resume.

### B05d active slice — QC-13 / AUD-21
- September 13, 2026: `codex/b05d-grape-auth`, based on `2ce30ce`, issue #104. Typed request-auth cookie/bearer clients and grape lookup parity; no SQL. Preserve existing cookie fallback semantics and missing-reference-table errors.

### B06a active slice — QC-02
- September 13, 2026: `codex/b06a-consumed-dates`, stacked on B05d `e724161`. Reproduced existing Proof Private fixtures displaying Jul 7 in Library before the fix; shared calendar-day formatter for web and mobile entry library/detail. No stored date migration or timestamp-contract rewrite.

### QC-14 — Seeded grape aliases lose uppercase letters
- Priority / status: P2 / Open; confirmed existing data/seed defect, independent of QC-13 auth.
- Discovered: September 13, 2026, B05d `e724161` against the existing hosted reference data.
- Evidence: authenticated alias rows contain `abernet auvignon`, `erlot`, `abernet ranc`; cookie and bearer `q=abernet auvignon` resolve Cabernet Sauvignon. Web `q=shiraz` returns no suggestion. Historical `supabase/sql/019_entry_classification_and_primary_grapes.sql:214,264` and `022_add_grape_varieties.sql:38` apply `regexp_replace(..., '[^a-z0-9]+', ...)` before `lower`, deleting uppercase characters. The seed contains Shiraz, so the normal search key cannot match the damaged value.
- Expected / actual: case-normalized aliases should remain searchable by their ordinary spelling; capital letters are dropped before normalization. Canonical name matches can mask the damage.
- Related IDs / target: AUD-19 reviewed seed/reference restoration, AUD-10 resolver compatibility; bounded B05e data repair, unassigned. No change to historical manifest/baseline, SQL or hosted aliases in this session.
- Acceptance: inventory affected aliases, review normalized-key collisions and accent/punctuation policy, preserve canonical IDs/joins and legitimate synonyms, prepare a forward-only repair plus corrected fresh-seed contract, and test ordinary alias-only lookups with cookie/bearer/browser/Expo. Record exact deployment and live verification separately. Do not replay historical migrations.

### B05d / B06a released — September 13, 2026
- B05d PR #108 merged as `719ad1d`; B06a PR #110 as `d4e5cd2`. Primary production `dpl_32qQaMVqVsFmAffYh6nCLkiv35kP` Ready on cellarsnap.app; live cookie/bearer HTTP parity, phone autocomplete, desktop/phone Library and detail dates, login/sign-out passed. [Release handover](handovers/b05d-b06a-release.md), [QC](../audits/b05d-b06a-qc-2026-09-13.md).
- QC-13 Closed for the server repair: valid bearer-only requests now return 200 with cookie-equivalent results; anonymous/invalid requests remain 401. Typed factory/resolver adoption extends AUD-21, which stays Partial. Existing default limit bug repaired within this lookup contract. No SQL or native binary rollout.
- QC-02 Partial: web date shift fixed/live, shared mobile source merged and Expo-tested; native runtime/distribution still pending under #109. No stored dates changed. B06 AUD-09/QC-03/QC-08 remain open.
- AUD-48: 279 isolated checks, five schema/source tests, database compile contracts, web/mobile types/lint, Next build and all Expo exports passed. GitHub CI also retained seven dependency and three tooling tests. These checks do not certify native runtime behavior or unrelated features.
- AUD-39/QC-03: after sign-out, directly revisiting the palate shell can show zero/unknown profile defaults while APIs return 401 (local and production cleanup). Explicit sign-out navigation reaches login; fresh production login/data passed. Retain for session/bootstrap/count work, not a date regression.
- New QC-14 tracks the confirmed historical alias normalization defect. No alias/seed repair included. Existing privacy and hosting findings remain unchanged. The user's merge/close permission was for this session only.

### B06b active slice — AUD-09
- September 13, 2026; `codex/b06b-badge-contract`, base `eb36ee0`, issue #112. Live grants/policies confirm own-award insertion. Repair server-only award writes and stored consumed-entry trigger families; all 85 definitions retained. Explicit deferred classification for rating/sensory/social/manual contracts, without inventing thresholds or evidence. Counts/QC-03 and event navigation/QC-08 stay separate slices. Migration, QC and release pending.

### B06b / B06c / B06d released — September 13, 2026
- #113 merged as `f06fd7f`, #114 as `a75cb89`, #115 as `b51ae78`; primary deployment `dpl_2mmNXsfTW4ztLghCRgmVDoUuCiJ7` Ready and scoped live verification passed. [Handover](handovers/b06b-b06d-release.md), [QC](../audits/b06b-b06d-qc-2026-09-13.md).
- AUD-09 Partial: supported 53/85 definitions, explicit 32 deferrals, checked server award writer. Forward privilege migration deployed as `20260913064845`; direct client writes deny, legitimate concurrent awards occur once, historical awards unchanged. Featured-profile direct editing still needs earned-award authority; no retrospective award reclassification.
- QC-03/QC-08 Partial: desktop/phone web and cookie-stripped Expo success flows pass; complete summary and selected-slide navigation live. No native runtime/binary/OTA acceptance. Summary-outage reverse proxy did not hydrate Next; isolated failure tests pass but browser failure visual acceptance is unverified.
- 385 isolated checks, five schema/source checks, database compile contracts, web/mobile types/lint/build/exports and all three GitHub CI runs pass. Disposable fixture cleanup and baseline count restoration verified. Existing security advisors unchanged; OPS-01 duplicate hosting remains. User-local files/design #75 preserved.

### B06e active slice — AUD-09
- September 13, 2026; `fix/b06e-featured-badge-authority`, base `ac8045a`, issue #112. Earned-only single/array profile writes, legacy synchronization and transactional revoked-award cleanup implemented. Nine schema/source tests pass; hosted migration and browser/Expo QC pending. [Checkpoint](handovers/batch-06e.md). Deferred trigger/historical/native scope remains Partial.

### B06e paused — September 13, 2026
- Implementation `63cb2c6`, draft [#117](https://github.com/Bobanski/CellarSnap/pull/117), issue #112. User requested pause. 385 isolated checks, nine schema/source tests, web/mobile lint, web types and database compile contracts pass. Forward featured-authority SQL NOT applied; browser/Expo/concurrency acceptance and release pending. AUD-09 remains Partial. [Resume handover](handovers/batch-06e.md). B05e/QC-14 and summary-outage follow-up unimplemented.

### QC-15 — Transient local profile JSON parse failure
- Priority / status: P2 / Needs triage; not a confirmed product regression.
- Discovered: September 13, 2026; local Next dev 3001, B06e `63cb2c6` (no application source edits).
- Source / reproduction: designated-account login, navigate `/profile`; server emitted one `SyntaxError: Unexpected end of JSON input` at JSON.parse, page `/profile`, HTTP 500, followed by multiple 200s. Exact failing parse site unknown. Optional terminal evidence was captured during shutdown; no durable stack beyond those fields.
- Expected / actual: profile consistently renders; observed transient server error. No badge writes were attempted and migration was not applied.
- Impact / confidence: local-only observation; may be concurrent build/test generated-output interference, unproven. No production evidence.
- Related IDs / batch / owner / issue / PR: AUD-48 regression obligation; B06e QC intake / unassigned / #112 / #117. Do not silently implement unrelated profile work in the authority slice.
- Acceptance: reproduce with isolated dev/build output and a fresh login; locate failing JSON parse, distinguish artifact interference from application data, repair/test if confirmed or retain evidence if not reproducible; desktop/phone profile interactions and server/browser error checks.
- Deployment / rollback: no fix or rollout; triage before changes.
- Verification / residual: user paused before triage. Do not call B06e browser QC complete.

### QC-16 — Expo has no reachable featured-badge mutation control
- Priority / status: P2 / Open.
- Discovered: September 13, 2026, B06e resume at `3df3298`; current Expo production web export, 390×844.
- Evidence: `apps/mobile/src/screens/badges/BadgesScreen.tsx:87` defines `setFeaturedBadge` but never calls it; earned cards only navigate to detail. `BadgeDetailScreen.tsx` contains no feature/clear control. Browsed collection and First Pour detail with designated account; no feature action appears.
- Expected / actual: supported mobile users should be able to feature/clear earned awards; the API works with bearer legacy payloads, but current UI cannot initiate them.
- Related / target / issue: AUD-09, separate B06g client slice / #112. This predates B06e and is not a database-authority regression.
- Acceptance: accessible feature/clear actions, persisted state and useful failure feedback; cookie-stripped Expo browser interaction and available native acceptance. Preserve multi-selection compatibility and all historical awards.
- Deployment / rollback: future mobile source/runtime release; no data migration required by this finding.

### QC-03 follow-up — B06f summary-outage routing
- September 13, 2026, `3df3298`: production-build reverse proxy returning only `/api/profile/summary` 503 now hydrates. Profile identity/gallery and unknown count dashes survive, but `(wineCount ?? 0)` incorrectly routes a 71-wine account to `/taste-survey` and claims survey-only DNA. Same unknown-versus-zero contract as QC-03; repair in separate B06f, with desktop/phone outage/recovery verification. No live service failure injected.

### B06f checkpoint
- QC-03 profile null-as-zero routing repaired and desktop/phone outage/empty/recovery retested; source release pending. [Handover](handovers/batch-06f.md). Native scope remains Partial; no database or fixture mutations.

### B05e active — QC-14
- Branch `fix/b05e-grape-alias-keys`, issue #104. Reviewed hosted inventory: 131 damaged ASCII aliases for 93 varieties, one same-variety collision (`Xarel-lo` / `Xarel Lo`), zero alias-ID FK consumers. Canonical spelling retained with one normalized key; both queries resolve identically. Preserve all canonical IDs/entry joins and surviving alias IDs/timestamps.
- Forward migration `20260913075619_repair_grape_alias_keys.sql`, corrected reviewed seed generator and rollback/collision/repeatability tests pass; 12 schema tests and actual PostgreSQL catalog/authority replay pass. No historical SQL rewrite. Migration/live lookup QC pending at this checkpoint. [Seed contract](../../supabase/reference/README.md).
- B05e Expo QC found the manual grape picker only queried canonical `grape_varieties.name`, so the repaired aliases still returned no suggestions. This directly fails QC-14's cross-client acceptance: manual mobile typeahead now calls authenticated `/api/grapes` with validated response and stale-result/error handling. Keep OCR suggested-grape resolver parity under AUD-10/B07; it is a separate automatic selection workflow. Retest Expo alias selection and outage/recovery before release.

### B05e QC checkpoint
- Repair applied and exact row preservation verified; schema/types/lint/385 isolated checks and fresh all-platform Expo exports pass. Web desktop/phone, production alias search and Expo failure/recovery pass. Source release pending; native distribution remains explicit. [Handover](handovers/batch-05e.md).
