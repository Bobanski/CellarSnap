# TASK: Back-Derive User Sensory Preferences from Base Profiles

**Branch:** `feat/back-derive-preferences`
**Assigned to:** Codex
**Priority:** High — this is the core algorithm improvement for Phase 2

---

## ⚠️ PARALLEL AGENT WARNING

You are working in parallel with other agents on different branches. **Before every git operation:**

```bash
# Verify you're on the correct branch
git branch --show-current
# Expected output: feat/back-derive-preferences

# If not on the right branch:
git checkout feat/back-derive-preferences

# NEVER commit to main. NEVER merge into main yourself.
# If you need to pull latest main:
git fetch origin main
git rebase origin/main
```

**Other branches being worked on simultaneously:**
- `feat/composite-enjoyment` (Claude Code) — touches `scoringEngine.ts`, `PostSaveSurveyModal`, survey types
- `feat/nlp-tasting-notes` (Codex) — adds a new module for NLP, may touch `userPreferences.ts`

**Your files (should NOT overlap with other branches):**
- `src/server/algorithm/userPreferences.ts` — PRIMARY target
- `src/app/api/algorithm/score/handler.ts` — `defaultLoadUserPreferenceEntries()`
- `src/server/algorithm/cacheRefresh.ts` — may need similar changes to handler
- `src/server/algorithm/profileAssembly.ts` — READ ONLY (you call into this, don't modify it)

---

## Problem Statement

The current `buildPreferenceSummary()` in `userPreferences.ts` (line 320-373) builds sensory preferences ONLY from `advanced_notes` — manual tasting input the user provides per entry. This is fundamentally broken because:

- Only **20/118 entries** have `advanced_notes` at all
- Of those 20, only **5 of 16 sensory axes** are ever populated
- The result: `event_count` is extremely low, `observedAxes` is nearly empty, and the algorithm falls back to defaults for almost every axis

The fix: for each rated wine entry, look up its **base profile** via `assembleWineProfile()` from `profileAssembly.ts`. This gives us a full 16-axis sensory vector derived from the Palate Profiles reference database. Weight each profile by the user's rating to build a rich preference vector.

## Architecture

### Current Flow (broken)
```
wine_entries (with rating) → extract advanced_notes → buildPreferenceSummary()
                                    ↓
                        Only 5 axes populated for 20/118 entries
```

### Target Flow
```
wine_entries (with rating) → assembleWineProfile() for each entry → full 16-axis profile
                                    ↓
                        Weight by rating → buildPreferenceSummary()
                                    ↓
                        All 16 axes populated for ~107/118 entries
                        (those with wine_type, the prerequisite for profile assembly)
```

### Hybrid approach
Keep `advanced_notes` as a HIGH-CONFIDENCE override. When a user manually sets body=5, that's a stronger signal than the base profile's body=3.2. The logic should be:

1. For each rated entry, call `assembleWineProfile()` to get the base profile sensory vector
2. If the entry also has `advanced_notes`, use those values as overrides (they're direct user input)
3. Weight everything by `normalizeRatingWeight(entry.rating)` as before
4. Accumulate across all entries to produce the preference summary

## Files to Modify

### 1. `src/server/algorithm/userPreferences.ts`

#### Modify `PreferenceSourceEntry` type (line 42-54)
Add an optional field for the assembled profile:
```typescript
export type PreferenceSourceEntry = {
  rating: number | null;
  advanced_notes: AdvancedNotes | null;
  wine_type?: WineType | null;
  canonical_region?: string | null;
  canonical_sub_region?: string | null;
  canonical_country?: string | null;
  region?: string | null;
  appellation?: string | null;
  country?: string | null;
  primary_grapes?: string | string[] | null;
  classification?: string | null;
  // NEW: pre-assembled sensory profile from base profiles DB
  assembled_sensory?: Partial<SensoryVector> | null;
};
```

#### Modify `buildPreferenceSummary()` (line 320-373)
Currently iterates entries and only extracts from `advanced_notes`. Change to:

```typescript
function buildPreferenceSummary(entries: PreferenceSourceEntry[]): PreferenceSummary {
  const accumulators = new Map<SensoryAxis, PreferenceAccumulator>();
  let eventCount = 0;

  entries.forEach((entry) => {
    const noteWeight = normalizeRatingWeight(entry.rating);
    let contributed = false;

    // Step 1: Start with assembled base profile values (broad coverage)
    if (entry.assembled_sensory) {
      (Object.keys(entry.assembled_sensory) as SensoryAxis[]).forEach((axis) => {
        const value = entry.assembled_sensory?.[axis];
        if (typeof value !== "number") return;

        const current = accumulators.get(axis) ?? { weightedSum: 0, weightTotal: 0 };
        current.weightedSum += value * noteWeight;
        current.weightTotal += noteWeight;
        accumulators.set(axis, current);
        contributed = true;
      });
    }

    // Step 2: Override with advanced_notes where available (higher confidence)
    if (entry.advanced_notes) {
      (Object.keys(ADVANCED_NOTE_AXIS_MAP) as Array<keyof typeof ADVANCED_NOTE_AXIS_MAP>).forEach(
        (noteKey) => {
          const numericValue = levelToValue(noteKey, entry.advanced_notes?.[noteKey] ?? null);
          if (numericValue === null) return;

          const axis = ADVANCED_NOTE_AXIS_MAP[noteKey];
          // For overrides: replace the base profile contribution for this axis
          // Use a higher weight multiplier (1.5x) to prioritize manual input
          const overrideWeight = noteWeight * 1.5;
          const current = accumulators.get(axis) ?? { weightedSum: 0, weightTotal: 0 };
          
          // If base profile already contributed, subtract it and add the override
          // Simpler approach: just add with boosted weight — the weighted average
          // will naturally lean toward the manual value
          current.weightedSum += numericValue * overrideWeight;
          current.weightTotal += overrideWeight;
          accumulators.set(axis, current);
          contributed = true;
        }
      );
    }

    if (contributed) {
      eventCount += 1;
    }
  });

  // ... rest unchanged (compute sensory and observedAxes from accumulators)
}
```

**Important design note:** The override approach above adds the manual value alongside the base profile value with a boosted weight, rather than replacing. This means if base profile says body=3.2 and user manually says body=5, the effective value will lean heavily toward 5 due to the 1.5x multiplier. This is intentional — we want both signals, but user input wins.

### 2. `src/app/api/algorithm/score/handler.ts`

#### Modify `defaultLoadUserPreferenceEntries()` (line 236-298)
This function loads all rated entries for preference building. It needs to also assemble profiles for each entry.

Current flow: query `wine_entries` → fetch grapes → return `PreferenceSourceEntry[]`

New flow: query `wine_entries` → fetch grapes → **assemble profiles** → return enriched `PreferenceSourceEntry[]`

```typescript
export async function defaultLoadUserPreferenceEntries(
  supabase: RequestSupabaseClient,
  userId: string
): Promise<PreferenceSourceEntry[]> {
  // ... existing query logic stays the same ...
  
  const rows = ((result.data ?? []) as unknown) as PreferenceEntryRow[];
  const grapeMap = await fetchPrimaryGrapesByEntryId(
    supabase as unknown as Parameters<typeof fetchPrimaryGrapesByEntryId>[0],
    rows.map((row) => row.id)
  );

  // NEW: Assemble profiles for entries that have wine_type
  const referenceSupabase = createSupabaseAdminClient();
  const entriesWithType = rows.filter((row) => isWineType(row.wine_type));
  
  // Use batchPrefetchProfileData for efficiency
  const wineTypes = entriesWithType
    .map((row) => row.wine_type as WineType)
    .filter(Boolean);
  const vintages = entriesWithType
    .map((row) => row.vintage ? parseInt(row.vintage, 10) : null)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  
  const prefetchedData = await batchPrefetchProfileData(
    createSupabaseProfileAssemblyDataSource(referenceSupabase),
    wineTypes,
    vintages
  );
  const prefetchedDataSource = createPreFetchedProfileDataSource(prefetchedData);
  
  // Assemble profiles in parallel
  const profileMap = new Map<string, EffectiveWineProfile>();
  await Promise.all(
    entriesWithType.map(async (row) => {
      try {
        const grapes = grapeMap.get(row.id)?.map((g) => g.name).join(", ") ?? null;
        const profile = await assembleWineProfileWithDataSource(
          {
            wine_type: row.wine_type as WineType,
            canonical_region: row.canonical_region ?? row.region ?? null,
            canonical_sub_region: row.canonical_sub_region ?? row.appellation ?? null,
            canonical_country: row.canonical_country ?? row.country ?? null,
            primary_grapes: grapes,
            vintage: row.vintage ? parseInt(row.vintage, 10) || null : null,
            producer: null, // Not needed for preference building
            classification: null,
            quality_tier: null,
          },
          prefetchedDataSource
        );
        profileMap.set(row.id, profile);
      } catch {
        // Entry couldn't be profiled — will use advanced_notes only
      }
    })
  );

  return rows.map((row) => {
    const profile = profileMap.get(row.id);
    return {
      rating: row.rating ?? null,
      advanced_notes: normalizeAdvancedNotes(row.advanced_notes),
      wine_type: isWineType(row.wine_type) ? row.wine_type : null,
      canonical_region: row.canonical_region ?? row.region ?? null,
      canonical_sub_region: row.canonical_sub_region ?? row.appellation ?? null,
      canonical_country: row.canonical_country ?? row.country ?? null,
      region: row.region ?? null,
      appellation: row.appellation ?? null,
      country: row.country ?? null,
      primary_grapes:
        grapeMap.get(row.id)?.map((grape) => grape.name).join(", ") ?? null,
      // NEW
      assembled_sensory: profile?.sensory ?? null,
    };
  });
}
```

**Performance note:** `batchPrefetchProfileData()` and `createPreFetchedProfileDataSource()` already exist in `profileAssembly.ts` (lines 1009-1128). They pre-fetch all reference data in one pass, then each `assembleWineProfileWithDataSource()` call is essentially free (no DB queries). This is critical — we're calling it for potentially 100+ entries.

### 3. `src/server/algorithm/cacheRefresh.ts`

Apply the same pattern here. The `loadRecentScoreableEntries` function builds preference entries similarly. It should also assemble profiles. Follow the same pattern as handler.ts.

### 4. Import additions

You'll need to add these imports to handler.ts:
```typescript
import {
  assembleWineProfileWithDataSource,
  createSupabaseProfileAssemblyDataSource,
  createPreFetchedProfileDataSource,
  batchPrefetchProfileData,
} from "@/server/algorithm/profileAssembly";
import type { EffectiveWineProfile } from "@/server/algorithm/types";
```

And import `SensoryVector` in userPreferences.ts if not already there.

## Testing

### Unit test expectations
The existing tests in `e2e/ws1-algorithm-core.spec.ts` should still pass — the function signatures don't change, only the internal behavior of `buildPreferenceSummary`.

### Manual validation
After implementation, a quick smoke test:
1. An entry with `advanced_notes` + base profile should produce preferences weighted toward the manual notes
2. An entry with NO `advanced_notes` but with `wine_type` should still contribute to preferences via its base profile
3. `event_count` should jump from ~20 to ~107 (entries with wine_type)
4. All 16 sensory axes should have non-null preference values

### Edge cases
- Entries without `wine_type` (11 of 118) — no profile can be assembled, these only contribute via `advanced_notes` (same as before)
- Entries with `wine_type` but no matching base profile — `assembleWineProfile()` throws; the try/catch handles this gracefully
- The bourbon entry (McKenna) — has no wine_type, correctly excluded from profile assembly

## Dependencies
- `profileAssembly.ts` — READ ONLY, do not modify
- `scoringEngine.ts` — being modified on `feat/composite-enjoyment` branch, do NOT touch
- `constants.ts` — already updated in Phase 1, do NOT touch
- `types.ts` — you may need to add `assembled_sensory` to `PreferenceSourceEntry` if it's re-exported there (check)

## Definition of Done
- [ ] `buildPreferenceSummary()` uses assembled base profiles as primary sensory data source
- [ ] `advanced_notes` serve as high-confidence overrides with boosted weight
- [ ] `defaultLoadUserPreferenceEntries()` in handler.ts assembles profiles using batch prefetch
- [ ] Same pattern applied in `cacheRefresh.ts`
- [ ] No changes to `profileAssembly.ts` or `scoringEngine.ts`
- [ ] Existing tests pass
- [ ] `SensoryVector` import added to `userPreferences.ts`
- [ ] Clean TypeScript compilation (`npx tsc --noEmit`)
