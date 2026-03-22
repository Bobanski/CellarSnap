# Task: Expand Wine Type Inference

**Branch:** `fix/wine-type-inference`
**Assigned to:** Codex
**Priority:** Critical — this unblocks the entire scoring algorithm

---

## Problem

`wine_type` is populated on **0% of entries** in the `wine_entries` table. Without it, `profileAssembly.ts` cannot query `base_profiles` (the first thing it does is filter by wine type), which means the entire sensory matching pipeline is dead. The scoring engine falls back to just `sigmoid(midpoint) × balance_factor + categorical_bonus` with no sensory distance calculation.

The current `inferWineType()` function in `src/server/algorithm/resolver.ts` (line 216) is a small keyword matcher that only checks `region` and `classification` strings. It catches champagne, barolo, chablis, etc. — but misses **everything grape-based**. Since 75% of entries have `primary_grapes` populated, grape-based inference is the biggest opportunity.

Meanwhile, `src/server/listScan/inference.ts` already builds a `grapeToWineType` map from the `base_profiles` table — but this map is **only used by the list scan flow**, not by the entry resolver. These two systems need to be connected.

---

## Objective

Expand `inferWineType()` to accept `primary_grapes` (and optionally `varietal`) and use grape-based lookup to determine wine type. Wire this into both `resolveEntryFields()` and `createStubResolution()` so that every entry saved — whether via list scan, manual entry, or bulk upload — gets a wine type resolved.

---

## Files to Modify

### 1. `src/server/algorithm/resolver.ts`

**Current `inferWineType` signature (line 216):**
```typescript
export function inferWineType(fields: {
  country?: string | null;
  region?: string | null;
  classification?: string | null;
}): WineType | null
```

**New signature — add `primary_grapes` and `varietal`:**
```typescript
export function inferWineType(fields: {
  country?: string | null;
  region?: string | null;
  classification?: string | null;
  primary_grapes?: string | string[] | null;
  varietal?: string | null;
}): WineType | null
```

**Implementation changes:**

1. Keep all existing region/classification checks (they are correct and should take priority for edge cases like Champagne, Sauternes, etc.)

2. After the existing checks, add grape-based inference. Build a static map of well-known grape → wine type mappings. This should be a hardcoded constant, NOT an async DB call (inferWineType must remain synchronous). Use this reference from the `base_profiles` table data:

```typescript
const GRAPE_TO_WINE_TYPE: Record<string, WineType> = {
  // Red grapes
  "cabernet sauvignon": "red",
  "merlot": "red",
  "pinot noir": "red",
  "syrah": "red",
  "shiraz": "red",
  "grenache": "red",
  "tempranillo": "red",
  "sangiovese": "red",
  "nebbiolo": "red",
  "malbec": "red",
  "zinfandel": "red",
  "cabernet franc": "red",
  "mourvedre": "red",
  "petit verdot": "red",
  "gamay": "red",
  "barbera": "red",
  "dolcetto": "red",
  "primitivo": "red",
  "nero d'avola": "red",
  "aglianico": "red",
  "touriga nacional": "red",
  "carmenere": "red",
  "pinotage": "red",
  "cinsault": "red",
  "carignan": "red",
  "nerello mascalese": "red",
  "corvina": "red",
  "montepulciano": "red",
  "carricante": "white",  // Note: this is actually white

  // White grapes
  "chardonnay": "white",
  "sauvignon blanc": "white",
  "riesling": "white",
  "pinot grigio": "white",
  "pinot gris": "white",
  "gewurztraminer": "white",
  "viognier": "white",
  "semillon": "white",
  "chenin blanc": "white",
  "gruner veltliner": "white",
  "albarino": "white",
  "vermentino": "white",
  "fiano": "white",
  "garganega": "white",
  "trebbiano": "white",
  "marsanne": "white",
  "roussanne": "white",
  "muscadet": "white",
  "melon de bourgogne": "white",
  "torrontes": "white",
  "verdejo": "white",
  "godello": "white",
  "assyrtiko": "white",
  "furmint": "white",
  "glera": "sparkling",  // Prosecco grape

  // Grapes that are ambiguous (used in both red and white) — do NOT include:
  // muscat/moscato (could be sweet, sparkling, or white)
  // grenache blanc vs grenache (different types)
};
```

3. Parse `primary_grapes` into a list (handle both `string` and `string[]`, split on `,;/|`). For each grape, normalize (lowercase, trim, strip accents) and look up in the map. If ALL grapes in the list map to the same wine type, return that type. If grapes are mixed (e.g., a blend field like "Cabernet Sauvignon, Chardonnay"), return `null` rather than guessing wrong.

4. Also check the `varietal` field the same way as a fallback.

**Update the two call sites in `resolveEntryFields()` and `createStubResolution()`:**

Both currently call `inferWineType` with only `{ country, region, classification }`. Update them to also pass `primary_grapes` and `varietal`:

In `createStubResolution` (~line 123):
```typescript
const effectiveWineType =
  input.wine_type ??
  inferWineType({
    country: canonical_country,
    region: canonical_region,
    classification: canonical_classification,
    primary_grapes: input.varietal,  // ResolverInput has varietal but not primary_grapes
    varietal: input.varietal,
  });
```

In `resolveEntryFields` (~line 172):
```typescript
const effectiveWineType =
  input.wine_type ??
  inferWineType({
    country: canonical_country,
    region: canonical_sub_region ?? canonical_region ?? input.region,
    classification: canonical_classification,
    primary_grapes: input.varietal,
    varietal: canonical_varietal ?? input.varietal,
  });
```

### 2. `src/server/algorithm/resolver.ts` — Update `ResolverInput` type

The current `ResolverInput` only has `varietal?: string | null`. Evaluate whether we also need to add `primary_grapes?: string | string[] | null` to `ResolverInput`. Check the call sites in `persistEntryResolution.ts` and the entry save flow to see if `primary_grapes` is available at resolution time. If it is, add it to `ResolverInput` and pass it through. If not, `varietal` alone is sufficient since it comes from the same grape data.

### 3. `src/server/algorithm/persistEntryResolution.ts`

**Check:** The `wine_type` column on `wine_entries` needs to be populated with the inferred value. Currently `persistEntryResolution` saves `raw_wine_type` but may not be writing the resolved `wine_type` enum value back. Verify this and fix if needed — the resolved wine type MUST be persisted to the `wine_type` column on the entry row so that `profileAssembly.ts` and `userPreferences.ts` can use it.

Look at the `buildEntryResolutionPayload` function — it currently writes `raw_wine_type` but we need to also write `wine_type` (the enum column) with the resolved effective wine type.

---

## ResolverInput Reference

The `ResolverInput` type currently:
```typescript
export type ResolverInput = {
  region: string | null;
  producer: string | null;
  classification: string | null;
  wine_type: WineType | null;
  country: string | null;
  varietal?: string | null;
};
```

---

## Testing

1. Verify the existing `inferWineType` tests in `e2e/ws1-algorithm-core.spec.ts` still pass
2. Add test cases for grape-based inference:
   - `inferWineType({ primary_grapes: "Pinot Noir" })` → `"red"`
   - `inferWineType({ primary_grapes: "Chardonnay" })` → `"white"`
   - `inferWineType({ primary_grapes: "Cabernet Sauvignon, Merlot" })` → `"red"` (both red)
   - `inferWineType({ primary_grapes: "Cabernet Sauvignon, Chardonnay" })` → `null` (mixed)
   - `inferWineType({ region: "Champagne", primary_grapes: "Pinot Noir" })` → `"sparkling"` (region takes priority)
3. Run `pnpm test` and `pnpm typecheck` to verify no regressions

---

## Important Constraints

- `inferWineType()` MUST remain synchronous (no async, no DB calls). It's called in both sync and async contexts.
- The grape map should be a compile-time constant, not loaded from the database at runtime.
- Do NOT modify `src/server/listScan/inference.ts` — that file's async `grapeToWineType` map serves a different purpose (list scan enrichment) and should remain independent.
- Preserve all existing keyword checks — they handle edge cases correctly (e.g., Champagne region → sparkling even though the grapes are Pinot Noir).
