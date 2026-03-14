# TASK.md — WS2: Entry Normalization

> **READ THIS FILE** at session start and after every context compaction.
> It is your single source of truth for this branch.

## Branch

`feature/entry-normalization` — PR #1 is already open against `main`.

## Goal

Replace the stub resolver in `src/server/algorithm/resolver.ts` with a real implementation that resolves raw wine entry fields to canonical forms using the alias tables in Supabase. When a user creates or updates an entry, the resolver must look up the alias tables, populate canonical fields on `wine_entries`, and log the outcome to `scan_resolution_log`.

## What Already Exists (DO NOT recreate)

- `src/server/algorithm/resolver.ts` — stub resolver with types, fallback level logic, `inferWineType()`, `isValidWineType()`
- `src/server/entries/schema.ts` — entry schemas with `wine_type` field
- `src/types/wine.ts` — `WineType` type and `WINE_TYPE_VALUES`
- `src/app/api/entries/route.ts` — POST handler already calls `resolveEntryFields()` and writes canonical fields + scan_resolution_log (fire-and-forget)
- `e2e/ws2-entry-normalization.spec.ts` — 284 lines of existing tests
- `supabase/sql/049_entry_canonical_fields.sql` — migration adding canonical columns to wine_entries (ALREADY APPLIED to production DB)
- `supabase/sql/050_scan_resolution_log.sql` — migration creating scan_resolution_log table (ALREADY APPLIED to production DB)

## Supabase Connection

```
Host: aws-0-us-west-2.pooler.supabase.com
Port: 6543
Database: postgres
User: postgres.rbmkypbqavmnuycznssv
Password: <see Supabase dashboard → Settings → Database>
SSL: require
```

REST API:
```
URL: https://rbmkypbqavmnuycznssv.supabase.co
Service Role Key: <see Supabase dashboard → Settings → API → service_role key>
```

## Alias Tables in Supabase (already populated)

### `region_aliases` (715 rows)
| Column | Type | Description |
|---|---|---|
| id | BIGINT | Auto-increment PK |
| alias | TEXT | The input string to match against (e.g., "Napa", "Côtes du Rhône") |
| canonical_region | TEXT | Resolved region (e.g., "Napa Valley", "Northern Rhône") |
| canonical_sub_region | TEXT | Resolved sub-region (nullable) |
| canonical_country | TEXT | Resolved country (e.g., "USA", "France") |
| alias_type | TEXT | One of: `exact`, `abbreviation`, `colloquial`, `sub_region_of`, `misspelling` |

### `producer_aliases` (1,695 rows)
| Column | Type | Description |
|---|---|---|
| id | BIGINT | Auto-increment PK |
| alias | TEXT | The input string to match against |
| canonical_producer_name | TEXT | Resolved producer name |
| alias_type | TEXT | One of: `exact`, `abbreviation`, `short_name`, `colloquial` |

### `grape_varieties` (93 rows) and `grape_aliases` (131 rows)
These are pre-existing app tables (UUID PKs). Used for grape normalization.
- `grape_varieties`: `id` (UUID), `slug`, `name`, `created_at`
- `grape_aliases`: `id` (UUID), `variety_id` (FK), `alias`, `alias_normalized`, `created_at`

## Structured Plan

### Phase 1: Alias Lookup Functions

Create `src/server/algorithm/aliasLookup.ts`:

1. **`lookupRegionAlias(rawRegion: string): Promise<RegionMatch | null>`**
   - Query `region_aliases` with case-insensitive match on `alias`
   - Return `{ canonical_region, canonical_sub_region, canonical_country, alias_type, matched: true }` or `null`
   - Use the Supabase client from the request context (NOT a new client)

2. **`lookupProducerAlias(rawProducer: string): Promise<ProducerMatch | null>`**
   - Query `producer_aliases` with case-insensitive match on `alias`
   - Return `{ canonical_producer_name, alias_type, matched: true }` or `null`

3. **`lookupGrapeAlias(rawGrape: string): Promise<GrapeMatch | null>`**
   - Query `grape_aliases` with case-insensitive match on `alias` or `alias_normalized`
   - Join to `grape_varieties` to get canonical name
   - Return `{ canonical_name, variety_id, matched: true }` or `null`

**Key implementation details:**
- All lookups must be case-insensitive (use `.ilike()` or lowercase both sides)
- Trim whitespace before lookup
- If no match found, return `null` — the resolver preserves the raw value as-is per D12
- Use the Supabase JS client (already available in route handlers), NOT raw SQL

### Phase 2: Upgrade the Resolver

Modify `src/server/algorithm/resolver.ts`:

1. Make `resolveEntryFields()` **async** — it now does DB lookups
2. Accept a Supabase client parameter for DB access
3. Implement the full D11 fallback hierarchy (currently only levels 4-6):

```
Level 1: sub_region × varietal × wine_type  → confidence 0.95
Level 2: sub_region × wine_type             → confidence 0.85
Level 3: region × varietal × wine_type      → confidence 0.75
Level 4: region × wine_type                 → confidence 0.60
Level 5: country × wine_type               → confidence 0.50
Level 6: wine_type only / no info           → confidence 0.00 (below threshold)
```

4. Fallback level is derived from what canonical fields were resolved:
   - If alias lookup found a `canonical_sub_region` → can attempt level 1 or 2
   - If alias lookup found a `canonical_region` → can attempt level 3 or 4
   - If we have `canonical_country` (from alias or raw input) → level 5
   - Otherwise → level 6

5. Keep `resolution_source` values: `"exact"` (alias matched), `"alias_map"` (alias matched with different alias_type), `"stub"` (no match, passthrough)

6. Enhance `inferWineType()`:
   - Add more classification-based inferences (e.g., "Prosecco" → sparkling, "Port" → sweet, "Amarone" → red)
   - Add region-based inferences where highly certain (e.g., "Barolo" → red, "Chablis" → white)
   - Keep conservative — only infer when certainty is very high

### Phase 3: Wire Into Entry Routes

Update `src/app/api/entries/route.ts`:

1. The POST handler already calls `resolveEntryFields()` — update it to:
   - Pass the Supabase client to the resolver
   - `await` the result (it's now async)
   - Move resolution out of fire-and-forget into the main flow (canonical fields should be set before the response returns, so the client gets accurate data back)

2. Add resolution to the PATCH/PUT handler for entry updates:
   - When region, producer, classification, or wine_type change, re-run resolution
   - Update canonical fields and re-log to scan_resolution_log

3. Ensure the resolution never blocks or crashes entry creation — wrap in try/catch, fall back to stub behavior on any error.

### Phase 4: Tests

Expand `e2e/ws2-entry-normalization.spec.ts`:

1. **Unit tests for alias lookups:**
   - Region alias: "Napa" → canonical_region: "Napa Valley", canonical_country: "USA"
   - Region alias: "Côtes du Rhône" → canonical_region: "Northern Rhône" (or Southern — verify against data)
   - Producer alias: "DRC" → canonical: "Domaine de la Romanée-Conti" (verify against data)
   - No match: "Unknown Region XYZ" → null

2. **Unit tests for upgraded resolver:**
   - All 6 fallback levels produce correct confidence scores
   - Resolution with alias match returns `resolution_source: "alias_map"`
   - Resolution without alias match returns `resolution_source: "stub"` and preserves raw values

3. **Integration test for entry creation:**
   - Create entry with raw region "Napa" → verify canonical_region is populated
   - Create entry with no region → verify fallback_level is 5 or 6
   - Create entry with unknown region → verify raw value preserved, fallback_level appropriate

4. **Integration test for entry update:**
   - Update entry's region → verify canonical fields are re-resolved

### Phase 5: QA Validation

Run the following checks before marking this branch as complete:

```bash
# 1. Lint
npm run lint

# 2. Type check
npx tsc --noEmit

# 3. Existing tests still pass
npm run e2e

# 4. New tests pass
E2E_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/ws2-entry-normalization.spec.ts

# 5. Verify no regressions in entry creation (manual or via test)
```

## Files You Will Touch

| File | Action |
|---|---|
| `src/server/algorithm/aliasLookup.ts` | CREATE — alias lookup functions |
| `src/server/algorithm/resolver.ts` | MODIFY — make async, add real alias lookups, full fallback hierarchy |
| `src/app/api/entries/route.ts` | MODIFY — await resolver, add resolution to update handler |
| `e2e/ws2-entry-normalization.spec.ts` | MODIFY — add tests for alias lookups and integration |
| `src/types/wine.ts` | POSSIBLY MODIFY — add resolver-related types if needed |

## Files You Must NOT Touch

- Anything in `apps/mobile/` — mobile is a separate workstream
- `supabase/sql/049_*` or `050_*` — migrations are already applied
- `src/features/` — no UI work in this branch
- Any algorithm scoring logic — that's WS1 (feature/algorithm-core), not this branch

## Definition of Done

- [ ] `resolveEntryFields()` queries alias tables in Supabase for region, producer, and grape resolution
- [ ] All 6 fallback levels from D11 are implemented with correct confidence values
- [ ] Entry POST persists canonical fields synchronously (not fire-and-forget)
- [ ] Entry UPDATE re-runs resolution when relevant fields change
- [ ] `scan_resolution_log` captures every resolution outcome
- [ ] `inferWineType()` handles at least 10+ well-known classifications/regions
- [ ] All existing tests still pass
- [ ] New tests cover alias lookup, fallback levels, and entry integration
- [ ] `npm run lint` and `npx tsc --noEmit` pass clean
- [ ] No `any` types introduced
- [ ] PR is rebased on latest main before marking ready

## Design Constraints (from palate_profiles_design_decisions.md)

- Keep all sensory scoring on a 1-5 scale
- Preserve raw extracted values alongside normalized canonical values
- Log fallback level and normalization outcomes for every scoreable scan
- If no alias is found, preserve the raw extracted value and continue with fallback logic
- Confidence is a separate signal — it does not modify the taste-match score
- Minimum confidence to show a score: 50%