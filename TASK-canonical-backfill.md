# Task: Backfill Canonical Fields on Existing Entries

**Branch:** `fix/canonical-backfill`
**Assigned to:** Perplexity Computer (self)
**Priority:** Critical — entries have raw data but canonical fields are empty

---

## Problem

The `wine_entries` table has 118 real entries with good raw field coverage:
- `region`: 81% populated
- `country`: 81% populated  
- `primary_grapes`: 75% populated
- `producer`: 85% populated
- `classification`: 27% populated
- `vintage`: 89% populated

But the canonical/resolved fields are nearly empty:
- `wine_type`: 0% populated
- `canonical_region`: 12% populated
- `canonical_country`: 13% populated
- `canonical_sub_region`: 12% populated

This means the scoring algorithm cannot function — `profileAssembly.ts` needs `wine_type` to query base profiles, and `scoringEngine.ts` needs canonical fields for categorical matching.

---

## Approach

Write a Supabase SQL migration or edge function that:

1. Reads all `wine_entries` rows
2. For each row, resolves canonical fields using the existing alias tables and inference logic
3. Infers `wine_type` from grapes/region/classification (using the same logic as the enhanced `inferWineType()` from the `fix/wine-type-inference` branch, but as a SQL/plpgsql implementation or a batch script)
4. Updates each row with the resolved values
5. Logs a summary of what was resolved and what gaps remain

---

## Implementation Plan

### Option A: Node.js batch script (preferred)

Create `scripts/backfill-canonical-fields.ts` that:

```typescript
// Pseudocode structure:
// 1. Connect to Supabase with admin client
// 2. Fetch all wine_entries
// 3. For each entry, call resolveEntryFields() from resolver.ts  
// 4. Also infer wine_type using the grape map
// 5. Batch update entries with resolved values
// 6. Log summary stats
```

This reuses the existing resolver infrastructure and will pick up any improvements from the `fix/wine-type-inference` branch once merged.

### Option B: SQL migration

Create `supabase/sql/050_backfill_canonical_fields.sql` that does the resolution in pure SQL using the alias tables.

---

## Sequencing Note

This task should ideally run AFTER `fix/wine-type-inference` merges (so the improved `inferWineType` with grape support is available). However, we can start writing the backfill script now and run it twice — once with current inference, and once after the improved inference merges.

---

## Success Criteria

- `wine_type` populated on 70%+ of entries (up from 0%)
- `canonical_region` populated on 60%+ of entries (up from 12%)
- `canonical_country` populated on 70%+ of entries (up from 13%)
- Summary log showing exactly which entries couldn't be resolved and why
