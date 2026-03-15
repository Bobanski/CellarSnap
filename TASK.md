# TASK: List Scan Enhancement (feature/list-scan-v2)

> **Read this file at the start of every session and after every context compaction.**

## Branch Info
- **Branch**: `feature/list-scan-v2`
- **Base**: `main` (includes entry normalization + algorithm core)
- **Upstream reference**: `origin/list-scan` (friend's original work — cherry-pick the list-scan-specific files, do NOT merge the whole branch as it would regress algorithm/normalization code)

## Goal
Enhance the existing list-scan feature by:
1. Cherry-picking the list-scan code from `origin/list-scan` onto current `main`
2. Wiring up DB-powered inference (replacing hardcoded regex maps with lookups against our Supabase algorithm tables)
3. Connecting real algorithm scoring (replacing the hash-based `match_percent` stub)
4. Persisting scan results to Supabase instead of sessionStorage

## Context

### What exists on `origin/list-scan` (friend's work)
A complete list-scan feature across web + Expo mobile:

**Server** (`src/server/listScan/parse.ts` — 1,527 lines):
- OpenAI GPT-5-mini structured output for parsing wine lists from images, PDFs, and URLs
- Zod schema validation of AI response
- Deterministic post-processing: varietal inference, wine type inference, non-wine filtering
- URL source: HTML stripping, wine-section extraction, heuristic fallback parser
- Image source: sharp-based resizing, multi-image support (up to 6)
- PDF source: base64 encoding to OpenAI file input
- Rate limiting (45 requests / 15 min per user)

**Shared types** (`packages/shared/src/listScan.ts` — 389 lines):
- Full type system: ListScanResult, ListScanParsedWine, ListScanFilters, ListScanFacets
- Filtering, ranking, grouping utilities
- `createStableMatchPercent()` — **STUB**: deterministic hash producing 54–98%, NOT real scoring

**Web UI**:
- `ListScanIntakeScreen.tsx` (288 lines) — upload photos/PDF or paste URL
- `ListScanResultsScreen.tsx` (608 lines) — filterable results with facet dropdowns, price filters, match % column
- `FacetMultiSelect.tsx` (163 lines) — reusable multi-select dropdown
- `storage.ts` — sessionStorage persistence (temporary)
- API route at `POST /api/list-scan/parse`
- Home page + NavBar updated with list-scan links

**Mobile (Expo)**:
- Mirrored intake + results screens in React Native
- `MatchThresholdSlider.tsx` — native slider component
- API client calling web backend

### What's hardcoded that should use our DB
The friend hardcoded ~200 regex patterns for inference. We have richer data in Supabase:

| Hardcoded in parse.ts | Should come from DB |
|---|---|
| `EXPLICIT_VARIETAL_PATTERNS` (18 varietals) | `base_profiles` table has all grape→wine_type mappings |
| `APPELLATION_VARIETAL_INFERENCES` (30 appellations) | `base_profiles.region` + `base_profiles.primary_grapes` |
| `WINE_TYPE_BY_VARIETAL` (45 entries) | `base_profiles.wine_type` grouped by grape |
| `APPELLATION_INFERENCES` (30 entries) | `base_profiles` + `classification_tier_modifiers` |
| `createStableMatchPercent()` | Real scoring via `POST /api/algorithm/score` |

### Supabase tables available for inference
- `base_profiles` — 200+ rows: region, sub_region, country, wine_type, primary_grapes, blend_style, all 16 sensory axes
- `classification_tier_modifiers` — classification systems (AOC, DOCG, etc.) with region mappings
- `producer_modifiers` — 587 producers with region crosswalk
- `grape_sensitivity_coefficients` — grape-specific sensory adjustments

### Known gap: appellation→grape coverage
`base_profiles` covers major regions but is oriented around sensory profiles, not exhaustive appellation mapping. For example, Sancerre→Sauvignon Blanc is there, but Quincy, Reuilly, Menetou-Salon (all also Sauvignon Blanc, Loire) are not. A dedicated `appellation_grape_map` CSV/table may be provided separately. If it exists at `/home/user/workspace/wine_data_csvs/appellation_grape_map.csv` or in Supabase as `appellation_grape_map`, use it as the primary inference source and fall back to `base_profiles` for anything it doesn't cover.

### Algorithm on main (already merged)
- `src/server/algorithm/profileAssembly.ts` (969 lines) — full profile assembly with cascading fallbacks
- `src/server/algorithm/scoringEngine.ts` — cosine similarity + axis-weighted scoring
- `src/server/algorithm/resolver.ts` — entry resolution with alias lookups
- `POST /api/algorithm/score` endpoint ready to use

## Step-by-Step Plan

### Phase 1: Cherry-pick list-scan onto main
1. From `origin/list-scan`, cherry-pick ONLY the list-scan-specific files:
   - `src/server/listScan/parse.ts`
   - `src/features/listScan/*` (3 files)
   - `src/lib/listScan/storage.ts`
   - `src/app/api/list-scan/parse/route.ts`
   - `src/app/list-scan/page.tsx` + `results/page.tsx`
   - `packages/shared/src/listScan.ts`
   - Mobile files under `apps/mobile/src/screens/listScan/*`, `apps/mobile/app/(app)/list-scan/*`, `apps/mobile/src/lib/api/listScan.ts`, `apps/mobile/src/lib/listScan/storage.ts`
   - Changes to `src/app/page.tsx` (list-scan link), `src/components/NavBar.tsx` (nav item)
   - Changes to `src/server/images/openAiImage.ts` (unsupported_format error code + format helpers)
   - Changes to `packages/shared/src/index.ts` (listScan re-export)
2. Do NOT bring over: deleted algorithm files, deleted migrations, deleted docs, handler consolidation changes, or any non-list-scan modifications
3. Verify build passes after cherry-pick

### Phase 2: DB-powered inference service
1. Create `src/server/listScan/inference.ts`:
   - `loadInferenceMap()` — query `base_profiles` on startup/cache, build:
     - `appellationToGrapes`: Map<string, { grapes: string[], wineType: string }> from region/sub_region → primary_grapes + wine_type
     - `grapeToWineType`: Map<string, string> from primary_grapes → wine_type
     - `regionAliases`: Map<string, string> for common name variants (e.g., "Burgundy" → "Bourgogne")
   - `inferFromAppellation(appellation: string)` — returns { varietal?, wineType? }
   - `inferFromGrape(grape: string)` — returns { wineType }
   - Cache with 5-minute TTL (or per-request for serverless)
2. In `parse.ts`, replace hardcoded maps:
   - Keep the regex arrays as fast-path fallbacks
   - After OpenAI parse, run DB inference as an enrichment pass: for any wine with regions but missing varietals, check the DB
   - DB inference takes priority over hardcoded fallback when both match
3. Add new appellation→grape mappings our DB has that the hardcoded list misses

### Phase 3: Real algorithm scoring
1. After parse + inference, for each wine on the list:
   - Build an `AssembleWineProfileInput` from the parsed wine data
   - Call `assembleWineProfile()` to get the expected sensory profile
   - Call `scoreWineAgainstPreferences()` against the user's preference vector
   - Replace `match_percent` with the real score (0–100)
2. The user's preference vector comes from `userPreferences.ts` (already on main) — it aggregates their past entries
3. If no user preferences exist yet, fall back to the hash-based stub with a "personalized scores unlock after 5+ entries" message

### Phase 4: Persist to Supabase
1. Create migration `051_list_scan_results.sql`:
   - `list_scan_results` table: scan_id, user_id, source_type, source_label, venue_name, overall_confidence, scanned_at, raw_result (jsonb)
   - `list_scan_wines` table: id, scan_id, user_id, source_order, menu_label, producer, wine_name, vintage, wine_type, price_display, price_value, varietals (text[]), regions (text[]), match_percent, parse_confidence, rationale
   - RLS policies scoped to user_id
2. Replace sessionStorage with Supabase persistence
3. Add "My Scans" history page

### Phase 5: Polish
1. Add loading skeleton to results screen
2. Add "Scan another" button on results
3. Show warning banner when match scores are stub (< 5 entries)
4. Handle edge case: user not logged in → still allow scan but skip scoring + persistence

## Quality Checklist
- [ ] No regressions to algorithm core or entry normalization
- [ ] Build passes (`npm run build`)
- [ ] All existing tests pass
- [ ] New tests for DB inference service
- [ ] New tests for list-scan API with algorithm scoring
- [ ] Mobile app compiles with new shared types
- [ ] Rate limiting works correctly
- [ ] RLS policies on new tables verified

## Files to Create/Modify
**New:**
- `src/server/listScan/inference.ts`
- `supabase/sql/051_list_scan_results.sql`
- `src/app/list-scan/history/page.tsx` (optional)
- `e2e/ws3-list-scan.spec.ts`

**Cherry-pick from origin/list-scan:**
- All files listed in Phase 1

**Modify:**
- `src/server/listScan/parse.ts` — integrate DB inference
- `packages/shared/src/listScan.ts` — add scoring-related types
- `src/features/listScan/ListScanResultsScreen.tsx` — real scores, stub warning

## ⚠️ Branch Safety — READ THIS FIRST

This branch may be running concurrently with `feature/algorithm-ui` and `feature/pocket-sommelier`. Mistakes here can silently corrupt other branches.

**MANDATORY checks — do ALL of these:**
1. **At session start**: Run `git branch` and confirm you see `* feature/list-scan-v2`. If not, run `git checkout feature/list-scan-v2`.
2. **After every context compaction**: Re-read this file AND re-run `git branch` to confirm you're still on the right branch.
3. **Before every commit**: Run `git branch` again. Verify the output shows `* feature/list-scan-v2`.
4. **Before every push**: Run `git branch` one more time. Then `git log --oneline -3` to confirm the commits look right.
5. **Never run** `git checkout main` or switch branches unless you are explicitly told to by the user.
6. **Never run** `git merge main` or `git rebase main` without explicit user approval — this can introduce conflicts with concurrent branches.
7. **If using worktrees**: Confirm your working directory path includes `list-scan-v2` before any git operation.

**If you are unsure what branch you're on, STOP and check. Do not guess.**

- Never run `git commit` or `git push` without explicit user approval
