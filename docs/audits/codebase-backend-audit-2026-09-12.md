# CellarSnap codebase and backend audit

**Audit date:** September 12, 2026  
**Checkout:** `feat/marketing-site`, commit `40c6f63`, including the existing working-tree changes  
**Backend:** Supabase project `rbmkypbqavmnuycznssv`, PostgreSQL 17.6  
**Scope:** audit only. No application code, migrations, database records, policies, dependencies, or deployment settings were changed.

## Assessment

There is substantial room to simplify this project, but the best gains will come from **one implementation of each business workflow, fewer network round trips, and a trustworthy database contract**. Simply deleting large files or consolidating every component would not address the main costs.

The shared package is already useful. The web app also already batches many storage operations, lazy-loads large file parsers, caches several reference tables, and prefetches scoring reference data within batches. Those improvements should be preserved.

The larger problem is incomplete consolidation: several generations of entry workflows, schema fallbacks, scoring paths, auth patterns, and presentation components coexist. Some duplicate implementations have already diverged. Most notably:

- The live database permits broader entry/photo access than the checked-in privacy migration intends.
- The badge evaluator understands **none of the trigger names used by the 85 current badge definitions**.
- The scoring entry loader requests a nonexistent column and falls back to a projection that loses the wine type.
- A batch score-cache hit still pays for loading and reconstructing the user's preference history first.
- Mobile signs photos one at a time and loads the entire entry library in successive background pages.
- The schema cannot be faithfully reproduced from the checked-in migration directory.

These are different classes of work. Security and behavior corrections should be tracked separately from changes that preserve current behavior. This report does not authorize implementing either.

### What the measurements establish

| Measure | Result |
|---|---:|
| Application TypeScript/JavaScript files traversed | 449 |
| Application TS/JS lines, including comments and blanks | 136,693 |
| Web/server TS/JS | 82,218 lines |
| Mobile route TS/JS | 27,139 lines |
| Mobile supporting TS/JS | 21,015 lines |
| Shared TS | 6,321 lines |
| Next API route files / web page files | 81 / 40 |
| Checked-in SQL files | 73; 4,600 lines |
| Live public tables / views | 50 / 1 |
| Live public indexes / non-extension functions | 142 / 24 |
| Policies inspected | 106 across public and storage |
| Exact duplicate function groups of at least 8 lines | 74 |
| Unreferenced production module candidates | 4; 938 lines |

The duplicate detector compares TypeScript function tokens after removing whitespace/comments. It includes nested callbacks and is not a semantic clone detector. About 1,291 excess line positions were flagged after merging overlapping spans within each file; that is a screening measure, **not an additive deletion estimate**. Near-duplicate workflows offer larger opportunities but require design and parity tests.

The live table inventory reported 384 entries, 64 profiles, 473 entry photos, 99 saved scans, and 5,420 scan-wine rows. Exact aggregate entry counts were 257 public, 66 friends, and 61 private. Small current tables make many inefficient queries look inexpensive; query count and correctness are more actionable than speculative scale forecasts.

### Build and checks

| Check | Result and limits |
|---|---|
| Web TypeScript, no emit / incremental disabled | Pass |
| Mobile TypeScript | Pass |
| Mobile lint | Pass |
| Standard web lint | 6,510 findings: 1,057 errors and 5,453 warnings, dominated by a nested `.claude/worktrees/` checkout |
| Web lint excluding `.claude/**` | Pass |
| Ten selected existing suites using mocks/pure code | **149 pass, 8 fail** |
| Web unused-local/parameter diagnostic | Three unused React imports; this does not detect unused exported modules |
| Isolated production build with webpack | Pass with placeholder public Supabase configuration; no production credentials used |
| Default Turbopack build in isolated copy | Blocked by this audit harness's node_modules symlink escaping its root; not evidence of a project build defect |
| npm dependency audit, root | 13 affected package entries: 2 critical, 7 high, 3 moderate, 1 low |
| npm dependency audit, mobile | 29 affected package entries: 1 critical, 12 high, 15 moderate, 1 low |

The first isolated build without public configuration failed during prerendering; supplying nonfunctional placeholder public values allowed the webpack build to finish. This is configuration dependence, not a demonstrated production failure.

Initial script files referenced by the generated HTML, measured from that webpack build:

| Page | Script files | Raw JS KiB | Sum of independently gzipped JS KiB |
|---|---:|---:|---:|
| Login | 12 | 776.5 | 233.2 |
| Entries | 15 | 1,001.6 | 291.5 |
| Profile | 15 | 1,007.5 | 291.6 |
| Feed | 16 | 1,020.7 | 299.3 |
| Palate | 16 | 1,020.4 | 298.9 |
| New entry | 16 | 1,089.2 | 317.6 |

These totals include shared framework chunks, which can be cached between navigations. They exclude photos, fonts, API payloads, and inline document/RSC content. They are neither browser transfer measurements nor LCP/INP measurements, and do not describe the unmeasured default Turbopack output.

## Priorities and terminology

**P0:** access-control issues to address before broader use.  
**P1:** current behavior defects or high-value foundational/performance work.  
**P2:** worthwhile consolidation and scaling work.  
**P3:** lower-impact cleanup.

Effort is relative: **S** = bounded local change; **M** = several related modules or one carefully tested schema change; **L** = coordinated cross-platform or data-model work. These are not delivery commitments. Confidence labels distinguish confirmed code/catalog facts from improvements whose speed benefit still needs profiling.

## Access control and dependency findings

### 01 — P0: Live entry and photo read policies bypass the intended privacy model

**Evidence:** The live `wine_entries` SELECT policy named `Authenticated users can view wine entries` uses only `auth.role() = 'authenticated'`. The storage SELECT policy named `Authenticated users can read wine photos` similarly checks only the wine-photo bucket and authenticated role. The restrictive replacement in [supabase/sql/004_follow_privacy.sql:171](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/supabase/sql/004_follow_privacy.sql:171>) is absent from the live policy catalog.

Application filtering in [src/lib/access/entryVisibility.ts:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/lib/access/entryVisibility.ts:1>) and [src/app/api/feed/route.ts:132](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/feed/route.ts:132>) cannot protect direct Supabase reads. The database currently contains 61 entries marked private and 66 marked friends. Storage signing also relies on storage authorization; a private bucket alone does not supply per-entry privacy.

**Recommendation:** Reconcile both live policy sets with the intended owner/friend/block/test-account rules. Verify the parent entry, photo-specific privacy, shared copies, and grouped slides through direct Data API and Storage tests. Do not remove application visibility checks until the database contract is verified.

**Confidence:** confirmed catalog and source mismatch; no attempt to retrieve another user's private content. **Effort:** M. **Risk:** high if policies are changed without cross-user tests.

### 02 — P0: Public-assets write policies are public despite their service-role names

**Evidence:** Live storage policies `Service role can upload to public-assets` and `Service role can update public-assets` apply to the `public` role and only test `bucket_id = 'public-assets'`. Both anon and authenticated have the underlying INSERT/UPDATE grants. This bucket is public. No bucket-specific MIME or file-size restrictions were configured.

**Recommendation:** Restrict asset writes to the intended backend authority; retain public reading if required. Treat policy expressions and role lists as authoritative, not policy names. Add upload/update denial tests and document this bucket in migrations.

**Confidence:** confirmed live grants/policies; no uploads or changes attempted. **Effort:** S–M. **Risk:** low with public reads preserved.

### 03 — P0: Users can set their own privileged test-account flag

**Evidence:** `profiles` grants allow authenticated INSERT/UPDATE of `is_test_account`; own-profile RLS checks only the profile ID. There are no live profile triggers protecting the flag. `public.is_test_account` reads it, and `can_view_entry` grants test viewers additional access. The application also trusts it in [src/lib/access/testAccounts.ts:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/lib/access/testAccounts.ts:1>) and [src/lib/access/privateBetaFeatures.ts:28](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/lib/access/privateBetaFeatures.ts:28>).

**Recommendation:** Separate backend-controlled account capabilities from editable profile fields, or enforce column privileges and protected writes. Preserve ordinary profile editing. Audit the legacy metadata-based backfill in [supabase/sql/041_test_account_visibility.sql:7](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/supabase/sql/041_test_account_visibility.sql:7>) before reusing it.

**Confidence:** confirmed privilege chain; no flag changed. **Effort:** M. **Risk:** coordinate internal testers and admin tooling.

### 04 — P0: Personal entry embeddings share a globally readable/searchable knowledge table

**Evidence:** `wine_knowledge_chunks` has authenticated SELECT `USING (true)`. Of 3,521 live chunks, 172 have `source_table = 'wine_entries'`. [src/server/sommelier/ingest.ts:697](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/sommelier/ingest.ts:697>) embeds user notes and ratings and stores owner/entry IDs in JSON metadata. The live `match_wine_knowledge` searches all source types, and [src/server/sommelier/retrieval.ts:137](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/sommelier/retrieval.ts:137>) calls it with an admin client.

This permits direct authenticated reads of personal chunks and allows the general RAG branch to retrieve another user's entry text. Restricting only `match_user_entries` would not close those paths. Entry/account deletion also lacks a direct FK-backed cleanup for this polymorphic text source ID; there were zero orphan entry chunks at inspection time, so retention is a design gap rather than observed orphan data.

**Recommendation:** Separate personal entry embeddings from curated knowledge, with a real owner and entry FK, owner-aware retrieval, and deletion/update propagation. At minimum enforce equivalent isolation in both table access and every retrieval branch.

**Confidence:** confirmed policies, data categories, function definitions, and call paths; no private chunk contents exported. **Effort:** L. **Risk:** preserve retrieval quality with fixed relevance fixtures.

### 05 — P1: Identifier resolution exposes email and phone mappings

**Evidence:** Four live SECURITY DEFINER RPCs—`get_email_for_username`, `get_email_for_phone`, `get_phone_for_username`, and `get_phone_for_email`—are executable by anon and authenticated. They return contact fields without caller authorization. Separately, [src/app/api/auth/resolve-identifier/route.ts:100](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/auth/resolve-identifier/route.ts:100>) returns both fields before authentication.

The Next route's limiter does not cover direct RPC calls. [src/lib/rateLimit.ts:62](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/lib/rateLimit.ts:62>) also includes a caller-controlled user-agent in anonymous bucket identity, permitting bucket churn; distributed failures fall back to process-local limits.

**Recommendation:** Resolve identifiers inside the authentication/recovery service, return a non-enumerating result, and restrict contact lookup RPC execution appropriately. Keep deliberately public availability checks separate. Use stable anonymous abuse limits and observable fallback behavior.

**Confidence:** confirmed. **Effort:** M. **Risk:** test username/email/phone login and recovery parity.

### 06 — P1: Public profile projection exposes more identity than its display preference implies

**Evidence:** Live `public_profiles` is a definer view over all profiles. Although `display_name` honors `name_display_preference` and email is nulled, it still returns raw `first_name`, `last_name`, and the test-account flag. Its view definition has no viewer filter. See [supabase/sql/043_name_display_preference.sql:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/supabase/sql/043_name_display_preference.sql:1>).

**Recommendation:** Define a deliberate public identity projection. Expose only fields needed by public UI and apply block/test visibility where required. Do not mechanically set `security_invoker=true`: the underlying profiles SELECT is owner-only, which would break legitimate public-profile reads. Redesign projection and privileges together.

**Confidence:** confirmed catalog; whether full names are intended public needs a product contract. **Effort:** M.

### 07 — P1: Wine-list URL fetching lacks destination validation and a complete body deadline

**Evidence:** [src/server/listScan/parse.ts:3533](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/listScan/parse.ts:3533>) accepts any HTTP(S) host, follows redirects, and clears its abort timer once response headers arrive. Subsequent body reads occur outside that timeout. There is no private-address/loopback validation in this path.

**Recommendation:** Put remote-source fetching behind one bounded utility with destination and redirect checks, a deadline covering the whole response, and byte limits for each supported input. Retain arbitrary legitimate restaurant/menu domains. Network exploitability depends on hosting egress restrictions, which were not probed.

**Confidence:** code-confirmed exposure surface; deployment reachability untested. **Effort:** M.

### 08 — P1: Dependency advisories need a reviewed upgrade pass

**Evidence:** Both current lockfiles return the audit counts above. Root Next is 16.2.7; root sharp is 0.34.5. sharp is also loaded directly by [src/server/images/openAiImage.ts:70](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/images/openAiImage.ts:70>), despite being obtained transitively rather than declared as an application dependency.

npm severity is not equivalent to demonstrated exploitability. For example, one critical Next advisory concerns Windows hosting, which does not describe the documented Vercel deployment; other advisories have different feature prerequisites. [Next's upstream advisory](https://github.com/vercel/next.js/security/advisories/GHSA-6gpp-xcg3-4w24) illustrates why build mode and feature exposure must be checked. Mobile's automated fix suggestions include major **downgrades** of Expo/router and should not be applied blindly.

**Recommendation:** Upgrade supported compatible framework/Expo dependency sets, explicitly declare directly imported runtime dependencies, and test scanning, image handling, auth, and native builds. Keep build-tool vulnerabilities distinct from shipped-app exposure. No packages were installed or upgraded during this audit.

**Confidence:** live npm advisory results; exploitation not tested. **Effort:** M.

## Behavior defects caused or amplified by architectural drift

### 09 — P1: Badge definitions and evaluator are incompatible

**Evidence:** [packages/shared/src/badges.ts:37](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/packages/shared/src/badges.ts:37>) defines `entry_count`, `grape_match`, `region_match`, `rating_ratio`, `compound`, and other triggers. [src/server/badges/evaluator.ts:197](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/badges/evaluator.ts:197>) handles only `count_logs`, `count_filtered`, `percentage`, and `qpr`. Evaluating the exported definitions locally found **85 definitions, zero recognized trigger types**.

The evaluator's locally invented types and dynamic require conceal this mismatch. Latent old code also uses `rating >= 4` in a 1–100 rating system and ignores parts of compound filters. Live `user_badges` permits users to insert their own award rows, bypassing server evaluation. Existing awards do not prove the current evaluator works.

**Recommendation:** Use the shared discriminated union with exhaustive evaluation, backend-controlled awards, one aggregate fact load per evaluation, and fixtures for every supported trigger. Validate upsert errors before reporting awards. Preserve all defined badge features; dormant branches are not evidence that those features should be removed.

**Confidence:** confirmed local execution and catalog. **Effort:** L. **Risk:** behavior correction, not mechanical cleanup.

### 10 — P1: A missing score-loader column forces a fallback that loses wine type

**Evidence:** Live `wine_entries` has no `quality_tier`. [src/app/api/algorithm/score/handler.ts:170](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/algorithm/score/handler.ts:170>) selects it; its fallback projection omits `wine_type` and returns `wine_type: null`. A cache miss for an entry-ID-only score therefore reaches the “wine type required” response even if the actual entry has a type. Cached results and direct field overrides can mask this.

`ai_notes_summary` is also absent live despite [supabase/sql/020_ai_notes_summary.sql:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/supabase/sql/020_ai_notes_summary.sql:1>). The public schema-health checker does not cover either scoring requirement.

**Recommendation:** Decide the authoritative classification/tier mapping, make the query reflect it, preserve valid fields on fallback, and add schema contract tests. Do not add a duplicate tier column solely to satisfy stale code without a data-model decision.

**Confidence:** confirmed schema plus deterministic code path; no production score endpoint invoked. **Effort:** S–M.

### 11 — P1: Score refresh and on-demand scoring use different preference inputs

**Evidence:** On-demand single/batch scoring reads the distilled palate record and supplies a seed to `buildUserPreferenceVector`. [src/server/algorithm/cacheRefresh.ts:203](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/algorithm/cacheRefresh.ts:203>) builds preferences without that seed, then writes into the same score cache. Results can therefore depend on whether a score came from post-save refresh or a later cache miss.

**Recommendation:** Extract one scoring service used by single, batch, refresh, and list-scan adapters. Include the same preference/model/reference-data version in cache identity. Test seeded and unseeded users through all paths.

**Confidence:** confirmed code divergence; numeric impact depends on the user's profile. **Effort:** M.

### 12 — P2: Cache hits do not round-trip the full score response

**Evidence:** [src/server/algorithm/scoreCache.ts:45](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/algorithm/scoreCache.ts:45>) reconstructs cached responses with `balance_factor: 0`, `age_factor: 1`, `enjoyment_factor: 1`, and `pre_balance_score: 0`. Those are not serialized from the computed response. The primary score survives, but explanatory metadata changes.

**Recommendation:** Persist the versioned response fields actually promised by the API, or explicitly separate score-only cache data from detailed explanations. Test cold and warm response equivalence.

**Confidence:** confirmed. **Effort:** S–M.

### 13 — P1: Web and mobile do not share an entry lifecycle contract

**Evidence:** Web creation performs validation, canonical resolution, sensory materialization, cache work, and badge evaluation in [src/app/api/entries/handler.ts:348](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/entries/handler.ts:348>). Mobile uses direct inserts through [apps/mobile/src/lib/entryFlow/entryPersistence.ts:20](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/lib/entryFlow/entryPersistence.ts:20>) and an independent workflow, with a separate badge API call. Mobile library loading at [apps/mobile/app/(app)/entries/index.tsx:773](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/entries/index.tsx:773>) does not filter consumed entries, even though cellar entries are stored in the same table.

**Recommendation:** Make entry commands and side effects authoritative in one server service or equivalent shared transactional boundary. Preserve native photo I/O and drafts. Define consumed/cellaring/shared-copy/group membership consistently for library, feed, scoring, and badges.

**Confidence:** confirmed divergent paths; comprehensive UI parity needs runtime tests. **Effort:** L.

### 14 — P1: Drinking from the cellar is a non-atomic read/decrement/clone

**Evidence:** [src/app/api/cellar/drink/route.ts:60](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/cellar/drink/route.ts:60>) reads quantity, writes `currentQuantity - 1`, then inserts a consumed entry. A compensating update restores the old quantity on failure. Concurrent requests can both observe one bottle, both create consumed entries, and overwrite each other's quantity changes; compensation can overwrite a later valid update.

**Recommendation:** One transactional, ownership-checked operation with conditional decrement or row locking and a request idempotency key. Include grape cloning and the required lifecycle effects.

**Confidence:** confirmed concurrency design defect; no live concurrent mutations tested. **Effort:** M.

### 15 — P1: Other multi-table mutations depend on compensation and positional assumptions

**Evidence:** Entry/group creation, bulk imports, and scan persistence write related tables through independent calls. [src/app/api/entries/bulk-group/handler.ts:114](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/entries/bulk-group/handler.ts:114>) compensates after failures. [src/app/api/cellar/import/route.ts:242](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/cellar/import/route.ts:242>) maps returned inserted IDs back to original rows by array position. [src/server/listScan/persistence.ts:28](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/listScan/persistence.ts:28>) inserts a summary then separately replaces wine rows.

**Recommendation:** Define atomic command boundaries and stable client-generated row/request IDs. Make retry behavior explicit. This can remove compensation branches while preserving partial-import reporting where it is intentional.

**Confidence:** confirmed implementation; frequency of real failures unknown. **Effort:** L.

### 16 — P1: Generic import mapping can discard custom field types

**Evidence:** [src/app/api/cellar/import/route.ts:8](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/cellar/import/route.ts:8>) puts `z.object({ target: z.string() })` before the custom-field branch in a union. It accepts `{target:"custom",field_type:"number"}` and strips the unknown field before the more specific branch is considered; subsequent code defaults it to text.

This route also accepts `rosé` and lower-case bottle formats that are not the canonical values used by the entry schema. Those normalizers are independently defined again in import code.

**Recommendation:** Use a discriminated or otherwise unambiguous mapping schema and one canonical input-normalization layer. Verify date, number, grape, bottle-format, and currency behavior across both importers.

**Confidence:** confirmed Zod structure and code path. **Effort:** S–M.

### 17 — P1: Explore grape queries use a nonexistent column

**Evidence:** [src/app/api/explore/[type]/[slug]/route.ts:568](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/explore/[type]/[slug]/route.ts:568>) and line 1083 query `entry_primary_grapes.grape`. Live and checked-in schema expose `variety_id`, with names in `grape_varieties`. Errors are discarded, so personal grape statistics/community QPR can appear empty.

**Recommendation:** Reuse the same typed grape join/query helper used elsewhere. Keep the QPR `mid`→`spot_on` presentation mapping explicit; it is already handled and is not itself a defect.

**Confidence:** confirmed schema mismatch. **Effort:** S.

### 18 — P2: Request validation is inconsistent on remaining write paths

**Evidence:** [src/app/api/taste-survey/route.ts:50](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/taste-survey/route.ts:50>) trusts a TypeScript annotation on raw JSON and writes arrays/text without runtime shape/size validation. [src/app/api/badges/evaluate/route.ts:26](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/badges/evaluate/route.ts:26>) casts JSON and treats malformed bodies as empty evaluation input. In contrast, most entry routes use Zod.

**Recommendation:** Shared runtime schemas for these payloads, bounded collections/text, and consistent 400 responses. Preserve supported values and avoid replacing partial updates with indiscriminate defaults.

**Confidence:** confirmed. **Effort:** S–M.

## Database structure and reproducibility

### 19 — P1: Migration files and production are not a reproducible source of truth

**Evidence:** The repository uses `supabase/sql/manifest.txt`, but CLI configuration has no schema paths and the conventional `supabase/migrations/` directory is absent. Fifteen live tables have no CREATE TABLE in the checked-in SQL, including `friend_notifications` and 14 reference tables. Live migration history lists 30 entries, many seed chunks, while the manifest has 73 files.

Some later changes exist live without matching recorded history. Others, including the notification index in migration 096 and the AI-summary column, are absent. The old wide entry policy is particularly consequential.

**Recommendation:** Capture and review a baseline of the actual schema, grants, policies, functions, triggers, and essential seed contracts; then establish one forward migration workflow with disposable-database replay and drift detection. Keep historical files as evidence until the baseline is verified. Do not rerun all old scripts against production to “catch up.”

**Confidence:** confirmed catalog/file comparison. **Effort:** L.

### 20 — P1: Compatibility code needs an explicit retirement plan

**Evidence:** 107 files contain missing-schema/fallback logic or references. Some fallbacks use broad message matches for “column,” “relation,” or a field name; mobile insertion can remove payload fields and retry five times. See [src/server/db/compat.ts:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/db/compat.ts:1>), [apps/mobile/src/lib/entryFlow/entryPersistence.ts:20](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/lib/entryFlow/entryPersistence.ts:20>), and [src/app/api/entries/bulk-group/handler.ts:29](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/entries/bulk-group/handler.ts:29>).

**Recommendation:** After schema reconciliation, declare a minimum supported schema and old-mobile support window. Instrument which fallback branches execute, then delete obsolete branches in bounded batches. Preserve input-format recovery and nullable-data fallbacks; those are not schema baggage. Missing-field fallback must never quietly relax privacy or discard intended user inputs.

**Confidence:** confirmed; retirement eligibility varies by branch. **Effort:** L. **Benefit:** one of the largest plausible code reductions.

### 21 — P1: Generate database types and keep domain/API types separate

**Evidence:** Supabase clients are unparameterized by a generated `Database` type. Handwritten query builders, `Record<string,unknown>`, and double casts are widespread. The nonexistent `quality_tier` and `grape` queries pass TypeScript. See [src/server/algorithm/aliasLookup.ts:6](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/algorithm/aliasLookup.ts:6>), [src/server/algorithm/scoreCache.ts:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/algorithm/scoreCache.ts:1>), and [src/lib/supabase/server.ts:11](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/lib/supabase/server.ts:11>).

**Recommendation:** Generate types from the reviewed schema, adopt them in shared client factories, and derive query-result types. Keep public DTOs and validation distinct from physical database rows. Avoid copying generated types into multiple apps.

**Confidence:** confirmed. **Effort:** M–L. **Benefit:** removes stub types and catches schema regressions before runtime.

### 22 — P2: Clarify ownership of duplicated entry/photo/group data before normalizing it

**Evidence:** Entry rows contain legacy label/place/pairing paths; `entry_photos` adds ordered photos; `entry_group_slides` stores another presentation layer; shared copies use `root_entry_id`; collections retain explicit snapshots. Wine text also exists as raw, canonical, and display values. Resolvers in [src/server/entries/groupPosts.ts:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/entries/groupPosts.ts:1>) and [src/server/collections/service.ts:44](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/collections/service.ts:44>) have to reconcile these representations.

**Recommendation:** Document a canonical write owner for each representation and make derived writes centralized. Backfill and reconcile before retiring legacy image columns. Preserve raw OCR provenance, independently rated tasting copies, and collection snapshots unless their product semantics are intentionally changed. They are not automatically redundant data.

**Confidence:** confirmed structural overlap; deletion requires usage/data analysis. **Effort:** L.

### 23 — P2: Consolidate RLS policy work and optimize auth predicates

**Evidence:** Supabase's live performance advisor reports 78 per-row auth-function findings and 37 multiple-permissive-policy findings. Some overlap is intentional, but public table roles and redundant owner/public SELECT paths create repeated work.

**Recommendation:** Repair access semantics first, then combine equivalent permissive paths where safe, target roles explicitly, and wrap row-independent auth calls where suitable. Use representative EXPLAIN plans and allow/deny tests. Supabase documents the [RLS performance patterns](https://supabase.com/docs/guides/database/postgres/row-level-security-performance).

**Confidence:** advisor-confirmed opportunities, not 115 distinct demonstrated bottlenecks. **Effort:** M.

### 24 — P2: Apply query-driven index changes, including an already-written missing index

**Evidence:** The live `wine_notifications_user_unseen_idx` is absent although [supabase/sql/096_notifications_index.sql:25](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/supabase/sql/096_notifications_index.sql:25>) defines it. The advisor identifies 11 FK columns without covering indexes; the evidence appendix lists them. The vintage lookup index begins `(country,region,vintage)`, while [src/server/algorithm/profileAssembly.ts:866](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/algorithm/profileAssembly.ts:866>) queries by vintage alone. Alias lookup uses ILIKE while its unique index is on `lower(alias)`.

**Recommendation:** Reconcile the pending notification index; prioritize FK indexes used in deletion/join workloads; align selective vintage and normalized-alias queries with indexes. Confirm representative query plans before adding speculative indexes to tiny tables.

**Confidence:** confirmed structures; speed gains unbenchmarked. **Effort:** S–M. [FK advisor remediation](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

### 25 — P3: Remove proven duplicate indexes, not every “unused” index

**Evidence:** `general_knowledge_chunks` has both a UNIQUE index and a nonunique index on `(document_id,chunk_index)`. The live `wine_profiles` lookup index also overlaps its unique type/slug/audience-mode access path. The advisor flags 13 unused indexes.

**Recommendation:** Compare constraints, index definitions, predicates, and usage before removing redundant nonunique indexes. Keep uniqueness, FK support, and low-frequency operational indexes even when scan counts are zero. An unused HNSW index warrants a query-plan investigation, not immediate deletion.

**Confidence:** exact document-index overlap confirmed; other candidates need individual verification. **Effort:** S.

### 26 — P2: Define retention and refresh metadata for derived records

**Evidence:** `api_rate_limits` reuses buckets but has no cleanup policy for abandoned subjects. Scan raw JSON and normalized scan rows duplicate the result. Six live tables with `updated_at` lack noninternal update triggers, even though migration 096 intends to add them. `wine_entries` has no update timestamp, which [src/server/algorithm/palateDistillation.ts:192](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/algorithm/palateDistillation.ts:192>) explicitly works around.

**Recommendation:** Retention for rate buckets/resolution logs, versioned schema for scan snapshots, and authoritative update timestamps. Prefer incremental embedding updates keyed by source hash rather than full re-embedding. Include deletion of personal derived data in the lifecycle in finding 04. Keep raw scan provenance if it is useful for recovery/debugging.

**Confidence:** confirmed gaps; retained-volume policy requires product/operations decisions. **Effort:** M.

## Loading, request volume, and computation

### 27 — P1: Batch score-cache hits still reconstruct preference history

**Evidence:** [src/app/api/algorithm/score/batch/handler.ts:190](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/algorithm/score/batch/handler.ts:190>) loads preference entries and the palate record **before** reading cached scores. Preference loading performs joins/reference fetches and per-entry profile assembly. The single-score handler correctly checks its cache first.

**Recommendation:** Read eligible score cache entries first, return an all-hit batch immediately, and load preferences once only if misses remain. Preserve override semantics and result order.

**Confidence:** confirmed avoidable work. **Effort:** S–M. **Expected gain:** substantial reduction in work for warm batches, without changing scores.

### 28 — P1: Batch scoring still has per-entry database loads

**Evidence:** On cache misses, [src/app/api/algorithm/score/batch/handler.ts:239](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/algorithm/score/batch/handler.ts:239>) calls the individual entry loader per item. That loader performs one entry query and a separate primary-grape query. A 50-item miss batch can require approximately 100 entry/grape requests before shared reference assembly.

**Recommendation:** Load all authorized entries in one bounded query and all grape links in another, then preserve per-item errors and ordering in memory. Existing batch reference prefetch and bulk score writes should remain.

**Confidence:** confirmed request structure; actual count depends on misses/overrides. **Effort:** M.

### 29 — P1: Materialized sensory profiles are rebuilt instead of reused consistently

**Evidence:** [src/app/api/algorithm/score/handler.ts:252](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/algorithm/score/handler.ts:252>) does not select `assembled_sensory`; it reconstructs every rated entry's profile with producer/classification omitted. The palate route reads materialized values instead. These paths therefore differ in both cost and inputs.

**Recommendation:** Choose one versioned assembly contract and reuse matching materialized profiles. Recompute only missing/stale records. Do **not** blindly substitute stored values into current scoring: different inputs can change recommendations and need numeric parity fixtures.

**Confidence:** confirmed. **Effort:** M–L. **Benefit:** removes repeated work and inconsistent preference inputs.

### 30 — P2: Extend the existing reference cache rather than adding another one

**Evidence:** Six hot reference reads already have a ten-minute in-process cache in [src/server/algorithm/profileAssembly.ts:786](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/algorithm/profileAssembly.ts:786>). Aging curves and vintage modifiers do not. Its miss path stores only fulfilled values, so concurrent misses duplicate work. By contrast, [src/server/listScan/inference.ts:284](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/listScan/inference.ts:284>) already deduplicates in-flight requests.

**Recommendation:** Reuse one cache strategy with in-flight promise deduplication, bounded/versioned keys, and the remaining stable lookup categories. In-process caches still do not span server instances. Consider a distributed cache only after measurements justify that complexity.

**Confidence:** confirmed implementation. **Effort:** S–M.

### 31 — P1: Palate reads synchronously perform backfill writes

**Evidence:** [src/app/api/palate/route.ts:138](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/palate/route.ts:138>) finds unresolved entries, calls bulk sensory resolution, then refetches them before returning. There are 183 live entries with null materialized sensory data, though not all have enough information to resolve. The bulk resolver updates one row at a time and increments its resolved count without checking the Supabase update error.

**Recommendation:** Move normal materialization to the entry lifecycle and backfill via a bounded, observable job. Make the read path return its existing fallback promptly. Check each persistence result and retry only retryable failures.

**Confidence:** confirmed. **Effort:** M. **Risk:** ensure eventual data is equivalent and UI readiness remains accurate.

### 32 — P1: Entry responses wait for broad cache invalidation and eager refresh

**Evidence:** [src/app/api/entries/handler.ts:671](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/entries/handler.ts:671>) starts optional processing but awaits it before responding at line 748. Updates/deletes similarly invalidate all user scores and refresh six recent entries; the refresh loop assembles and writes scores serially.

**Recommendation:** Separate required save data from derived cache refresh. Coalesce refreshes across a bulk operation; avoid work when an edit cannot affect preferences. Use tracked post-response work for short best-effort jobs and a durable queue where retries/completion matter. Preserve immediate comparison/badge payloads if the UI needs them. Next's [after API](https://nextjs.org/docs/app/api-reference/functions/after) extends response lifetime but is not a durable job system.

**Confidence:** confirmed blocking path. **Effort:** M–L.

### 33 — P1: Mobile and some web endpoints still sign each image individually

**Evidence:** [apps/mobile/src/lib/storage/signedUrls.ts:46](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/lib/storage/signedUrls.ts:46>) uses Promise.all over individual `createSignedUrl` calls. [src/app/api/entries/[id]/photos/route.ts:102](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/entries/[id]/photos/route.ts:102>) does the same. The shared server utility already supports bulk `createSignedUrls`.

**Recommendation:** Use bulk signing with deduplication and bounded chunking through platform adapters. Add short-lived viewer-scoped URL reuse only if expiry and access revocation are handled. Keep the bucket private.

**Confidence:** confirmed. **Effort:** S–M. **Expected gain:** replaces N storage HTTP requests with approximately one per batch.

### 34 — P2: Feed/home/list enrichment contains avoidable request waterfalls

**Evidence:** [src/app/api/feed/route.ts:486](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/feed/route.ts:486>) loads grouped posts, grapes, profiles, photos, settings, reactions, commenters, and signing in multiple successive phases. [src/app/api/home/route.ts:280](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/home/route.ts:280>) has similar hydration, and [src/app/api/entries/handler.ts:266](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/entries/handler.ts:266>) serializes several independent enrichments.

**Recommendation:** Create a reusable entry-card hydration service with an explicit dependency graph. Batch independent queries and combine all needed profile IDs once. Aggregate counts in SQL where appropriate. Preserve the existing privacy, shared-copy deduplication, and cursor behavior.

**Confidence:** confirmed dependency structure; actual critical-path reduction needs timings. **Effort:** M.

### 35 — P1: Pagination contracts are inconsistent and some queries silently cap data

**Evidence:** Mobile library loading fetches every 100-row page and enriches it before continuing. Server cellar loading is unpaginated. Preference loading and notification unread-row collection rely on the API row cap; palate explicitly takes 1,000 rows without ordering. Import duplicate detection also reads the user's existing entries without pagination.

**Recommendation:** Server-side filtering/sorting with stable cursors for browse lists; aggregate queries or deliberate complete pagination for totals/preferences/duplicate checks. Preserve the meaning of “search my whole library”—filtering only a partially loaded client subset is not equivalent. Keep native FlatList virtualization, which already exists for the flat mobile library.

**Confidence:** confirmed query patterns; large-library truncation not observed at current scale. **Effort:** L.

### 36 — P2: Notifications poll independently of realtime and visibility

**Evidence:** [src/components/AlertsMenu.tsx:329](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/components/AlertsMenu.tsx:329>) polls every 25 seconds while also subscribing to realtime and focus/visibility events. Its interval itself is not paused when hidden. [apps/mobile/src/components/AppTopBar.tsx:308](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/components/AppTopBar.tsx:308>) has another 25-second interval without AppState gating. The count-only endpoint fetches notification rows and resolves suppressed tags rather than performing one count.

**Recommendation:** One notification state owner per app, coalesced refreshes, realtime-primary where reliable, and visibility-aware fallback polling. Move suppression-aware counting into a tested query/service and bound result lists.

**Confidence:** confirmed. **Effort:** M. **Benefit:** lower background traffic and fewer redundant auth/storage-related reads.

### 37 — P2: Reduce initial page work through font delivery and actual loading boundaries

**Evidence:** The build measurements above show approximately 292–318 KiB of compressed initial scripts on main logged-in pages. New entry's route-specific chunk alone is 99 KiB raw / 24 KiB gzipped. [src/app/globals.css:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/globals.css:1>) loads fonts through a CSS Google Fonts import. Large screens statically import conditional dialogs and form sections.

**Recommendation:** Self-host the existing fonts or use the framework font loader while preserving typography; load substantial conditional editors/modals at the interaction boundary. Decompose rendering so typing in a field does not involve unrelated gallery/social UI. File splitting alone does not defer downloaded JavaScript. Next documents [lazy-loading boundaries](https://nextjs.org/docs/app/guides/lazy-loading).

**Confidence:** build/source-confirmed; user-device impact unmeasured. **Effort:** M.

### 38 — P2: Establish a private, responsive image delivery strategy

**Evidence:** [src/components/AppImage.tsx:10](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/components/AppImage.tsx:10>) intentionally uses raw img elements for signed/arbitrary origins. [src/components/Photo.tsx:15](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/components/Photo.tsx:15>) already provides lazy loading. Native screens use the same stored-photo concept at very different display sizes. No general thumbnail/derivative contract is present in the inspected image path.

**Recommendation:** Generate/reuse fit-for-display derivatives or use an authorized transform service, with stable dimensions, suitable formats, and explicit cache behavior. Add image-error and source-change handling to Photo so a failed load does not leave a permanent skeleton. Measure bytes on feed cards versus detail galleries.

**Confidence:** code-confirmed opportunity; real image payload distribution not downloaded. **Effort:** M–L. **Constraint:** signed/private media must not become publicly accessible for caching convenience.

### 39 — P2: Centralize client request/session state and avoid repeated bootstrap queries

**Evidence:** Mobile API modules repeatedly acquire tokens, build URLs, fetch, decode JSON, and map errors; collections alone is 461 lines. Web pages independently bootstrap auth/profile/feature access. [src/proxy.ts:55](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/proxy.ts:55>) makes an auth call and often a profile query before page-level loading starts. [src/lib/access/usePrivateBetaFeatureAccess.ts:17](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/lib/access/usePrivateBetaFeatureAccess.ts:17>) performs a further lookup even though many backend beta gates and the mobile gate were removed.

**Recommendation:** Thin shared API contracts with transport adapters, a client-side request cache/deduplication layer, and one session/profile bootstrap per app. Keep server authorization per request; never share private results across users. Resolve remaining web/mobile feature-gate intent before removing checks. Stop treating `getSession()` fallback in proxy as validated server identity.

**Confidence:** confirmed duplication; which bootstrap query dominates latency needs tracing. **Effort:** M–L.

### 40 — P2: Bulk imports contain serial lookups and duplicated pipelines

**Evidence:** [src/app/api/cellar/import/route.ts:111](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/cellar/import/route.ts:111>) makes up to two grape queries per distinct imported value. Both importers then independently look up/create custom fields and synchronously enrich imported entries. [src/app/api/cellar/import-cellartracker/route.ts:237](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/cellar/import-cellartracker/route.ts:237>) duplicates much of the pipeline.

**Recommendation:** Normalize both source formats into one internal import model. Load reference maps once, bulk-fetch existing field definitions, use stable IDs, and persist in chunks/transactions. A unified duplicate-detection contract should distinguish another tasting from a duplicate import; do not impose uniqueness on wine name alone.

**Confidence:** confirmed. **Effort:** M–L.

### 41 — P2: Generated profile caching needs a cross-instance claim and bounded lifecycle

**Evidence:** [src/app/api/explore/[type]/[slug]/route.ts:724](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/explore/[type]/[slug]/route.ts:724>) keeps result/in-flight maps. It writes a placeholder using upsert and starts work with after, which is already better than untracked fire-and-forget. However, concurrent instances can both observe a cache miss and both upsert a placeholder before generating. The result map has no general eviction.

**Recommendation:** Atomic generation claim/lease with an expiry and explicit state, plus bounded local caching and observable failures. Apply the same idea to expensive palate distillation. Preserve audience mode in cache identity and existing cached content while refreshing.

**Confidence:** confirmed race opportunity; duplicate live generations not measured. **Effort:** M.

## Consolidation and code reduction

### 42 — P1: Extract reusable entry workflows from the largest controllers

**Evidence:** Mobile detail is 6,642 lines with 81 useState calls and 15 effects; web new entry is 4,906 lines with 49 useState calls; mobile new entry is 3,396 lines; web edit is 3,106 lines. They mix crop geometry, image I/O, analysis, form state, persistence, surveys, and render trees.

Exact copied crop handlers appear at [apps/mobile/src/screens/entries/NewEntryScreenContainer.tsx:1464](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/entries/NewEntryScreenContainer.tsx:1464>) and [apps/mobile/app/(app)/entries/[id].tsx:2575](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/entries/[id].tsx:2575>).

**Recommendation:** Share pure crop/selection rules and workflow state transitions, keep web/native I/O adapters, and give each UI section its own state boundary. Consolidate persistence through finding 13. Preserve multi-photo/lineup retries, drafts, shared tastings, grouping, and post-save surveys.

**Confidence:** confirmed. **Effort:** L. **Benefit:** largest maintainability opportunity; line reduction depends on parity work.

### 43 — P2: Friends UI logic is copied within the web app

**Evidence:** [src/app/friends/page.tsx:80](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/friends/page.tsx:80>) and [src/components/palate/FriendsTab.tsx:79](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/components/palate/FriendsTab.tsx:79>) duplicate loading, search, request/response/cancel logic and rendering. The same sendRequest function also exists in [src/app/profile/page.tsx:472](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/profile/page.tsx:472>).

**Recommendation:** One friends feature controller and shared web presentation pieces, embedded in the different route/tab shells. Keep navigation and empty states appropriate to each host.

**Confidence:** exact-token duplicates confirmed. **Effort:** M. **Benefit:** a concrete reduction target with limited domain risk.

### 44 — P2: Finish shared domain schemas, constants, and pure helper consolidation

**Evidence:** Entry Zod validation is independently defined in [packages/shared/src/entries.ts:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/packages/shared/src/entries.ts:1>) and [src/server/entries/schema.ts:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/entries/schema.ts:1>), including an identical 39-line price refinement. Wine types, photo types, and multiple normalization helpers are repeated. Exact clones include normalizeVariety in four places, toOrdinal in four places, list-scan progress/filter summaries across platforms, and AI JSON extraction in four server files.

**Recommendation:** One shared base schema per domain, with explicit create/update/import extensions and platform adapters. Consolidate helpers by semantic contract—not merely by function name. Existing `src/lib/advancedNotes.ts` and `wineText.ts` are re-exports of shared logic, not duplicate implementations.

**Confidence:** confirmed. **Effort:** M–L. **Benefit:** meaningful deletion plus fewer future discrepancies.

### 45 — P2: Standardize route auth, validation, and error envelopes without a large framework

**Evidence:** Many API routes use requireRequestAuth, while feed/notifications/photo handlers use cookie-only clients. JSON errors can be strings, flattened Zod objects, raw database messages, or feature-specific result unions. Test dependency wiring also preserves older auth branches. [src/server/algorithm/cacheRefresh.ts:15](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/algorithm/cacheRefresh.ts:15>) imports service functionality upward from a route handler.

**Recommendation:** Small composable helpers for request auth, body validation, and typed errors; feature services beneath routes; one mobile/web decoding contract. Keep route handlers simple adapters and retain endpoint-specific semantics. Changing to one auth entry point must be tested for bearer and cookie clients.

**Confidence:** confirmed. **Effort:** M.

### 46 — P3: Remove verified unused modules and redundant pass-through layers

**Evidence:** Static import traversal and reference searches found no production consumers for:

| Candidate | Lines |
|---|---:|
| [src/components/BrandIcons.tsx:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/components/BrandIcons.tsx:1>) | 43 |
| [src/components/NavBar.tsx:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/components/NavBar.tsx:1>) | 268 |
| [src/components/PriceCurrencySelect.tsx:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/components/PriceCurrencySelect.tsx:1>) | 97 |
| [src/components/palate/TasteTab.tsx:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/components/palate/TasteTab.tsx:1>) | 530 |

The native BrandIcons is used and is a different file. The unreferenced notesNlp test should be **discovered and run**, not deleted. New/edit entry Screen wrappers merely forward to Container wrappers, while routes forward to Screen wrappers.

**Recommendation:** Confirm no external consumers/dynamic registration, then remove the four modules and unnecessary forwarding layers. Remove no-op references to retired beta imports in API handlers after preserving the still-used knowledge-admin access checks.

**Confidence:** strong static candidates, no deletion performed. **Effort:** S. **Benefit:** roughly 938 module lines; much of this code is likely already absent from bundles, so expect source cleanup rather than a major load-time gain.

### 47 — P3: Share design tokens and repeated visual primitives, not whole web/native render trees

**Evidence:** Web CSS, mobile theme/styles, inline styles in major screens, and the standalone marketing site repeat colors, type choices, cards, pills, and headings. The 1,250-line mobile new-entry stylesheet is especially large. The static marketing site is intentionally a separately deployable six-file site.

**Recommendation:** A small shared token source and a few stable per-platform primitives. Preserve platform-specific rendering, badge SVG adapters, and the static site's no-framework deployment. Extract repeated semantic content where it drifts; do not add a large universal UI abstraction to save a few styles.

**Confidence:** confirmed duplication; priority is maintainability. **Effort:** M.

## Verification and ongoing engineering cost

### 48 — P1: Restore a trustworthy regression suite before large deletions

**Evidence:** The selected suite run failed eight tests. Three failures are missing mock methods for bulk signing/query filtering; two expect the old resolver payload without primary_grapes; two expect old score weights/contributions; one palate-style expectation differs. These are not eight proven production bugs, but they prevent a green behavior baseline.

[src/server/algorithm/notesNlp.test.ts:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/algorithm/notesNlp.test.ts:1>) sits outside Playwright's configured e2e testDir and is not discovered. Documentation calls tests Vitest although the actual suites use Playwright. No checked-in CI workflow or database policy suite was found.

**Recommendation:** Reconcile expected behavior rather than blindly updating snapshots, make all tests discoverable, and gate lint/types/build/unit tests in CI. Add narrow parity tests for single/batch/refresh scoring, web/mobile entry commands, cold/warm caches, import types, and cross-user database/storage policies. Use disposable backend data for mutation tests.

**Confidence:** measured failures and configuration evidence. **Effort:** M–L.

### 49 — P2: Exclude nested AI worktrees from lint, watching, and other repository scans

**Evidence:** Standard web lint traverses the existing untracked `.claude/worktrees/agent-a251821a0b01f63dc/` and produces 6,510 findings; excluding it makes lint pass. [eslint.config.mjs:10](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/eslint.config.mjs:10>) omits this ignore. Mobile Metro watches the entire repository root in [apps/mobile/metro.config.js:9](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/metro.config.js:9>). Root tsconfig has broad includes and an existing user modification.

**Recommendation:** Put auxiliary worktrees outside the app checkout where practical and explicitly scope tooling/watch roots. Keep web and mobile install/TypeScript configuration intentional; root TS is 5.9.3 and mobile declares ~6.0.3. A workspace migration may help dependency management but is not required merely to remove duplicate files.

**Confidence:** lint impact measured; watcher/build overhead otherwise unmeasured. **Effort:** S–M.

### 50 — P2: Instrument silent degradation and keep engineering context accurate

**Evidence:** [src/server/log.ts:27](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/log.ts:27>) has a no-op reporting hook. Some former silent catches now log, but sensory persistence, cache refresh, badge-query errors, and generated-profile writes still discard failures. A resolved counter can increment after a rejected database write. Historical engineering docs describe fixes as pending or implemented without reliably matching production.

**Recommendation:** Add request/job identifiers, per-stage latency and query counts, cache-hit/fallback counters, external AI usage, and actionable error reporting. Keep graceful degradation but make it visible. Maintain a short architecture/schema contract and mark older audits as historical. The marketing README's contact-email description is already stale relative to its HTML; long duplicated handoff documents should not become runtime specifications.

**Confidence:** confirmed. **Effort:** M. **Benefit:** future optimization can target actual bottlenecks instead of code-size guesses.

## What to preserve

- The existing shared package and inexpensive re-export adapters.
- Batch reference prefetch and bulk score-cache writes.
- Existing reference-data TTL caching and in-flight deduplication in list-scan inference.
- Dynamic imports of exifreader, papaparse, read-excel-file, and server-side PDF parsing.
- Explicit photo laziness and native FlatList virtualization.
- Separate wine ratings and algorithm match scores; both must retain their existing intended scales.
- Raw OCR/scan evidence versus canonical interpretation.
- Independent users' tasting records and collection snapshots.
- Private storage; URL obscurity is not a replacement for authorization.
- RAG tables versus numeric sensory reference tables: those serve different retrieval/computation purposes.
- The lightweight static marketing site. Its presence is not responsible for the app's initial JS.
- Historical migrations until a replayable baseline and reconciliation are complete.

## Suggested order for later implementation

1. **Establish the contract:** fix high-risk live policy/grant issues, reconcile production schema, generate DB types, and create cross-user tests.
2. **Correct divergent behavior:** badges, score loader, consistent scoring inputs, import mappings, cellar transactions, and authoritative entry lifecycle.
3. **Take low-risk performance wins:** batch-cache early return, batch entry/grape loading, bulk photo signing, in-flight reference-cache deduplication, and visibility-aware polling.
4. **Consolidate workflows:** shared entry commands, friends controller, import pipeline, domain schemas, and entry-card hydration.
5. **Change larger loading/data structures only with measurements:** server-side library filtering/pagination, derived-data jobs, image derivatives, lazy UI boundaries, and incremental indexing.
6. **Delete retired code in small verified batches:** unused modules first; compatibility branches only after deployment and usage evidence show they are obsolete.

There is no defensible “delete 30% with no risk” estimate from this audit. The identified unused modules and exact clones provide a modest, concrete starting point. Removing multiple generations of workflow and schema support could save much more, but that reduction is conditional on preserving the contracts above.

## Scope and limitations

This was a repository-wide static inventory and import/function analysis, targeted manual tracing across every major subsystem, local non-production build/check execution, and live read-only schema/advisor/aggregate/query-stat inspection. It was not a claim that every line has been formally verified.

No authenticated production browser journey, real mobile-device profiling, mutation/penetration test, paid AI call, load test, or fresh database replay was run. The numerical SQL history dates back to February 7 and mixes previous releases; it cannot isolate the current cache implementation's effect. A role-switch count attempt returned no useful rows from the connector and is not used as proof; access findings rely on the live grants/policies/function definitions.

Existing user changes were preserved. Only audit documents/evidence are added in the repository; temporary build and check artifacts are under `/tmp/cellarsnap-audit/`.

See the [evidence appendix](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/docs/audits/codebase-backend-audit-2026-09-12-evidence.md>) for schema inventory, selected live definitions, advisor details, duplicated functions, and test failures.
