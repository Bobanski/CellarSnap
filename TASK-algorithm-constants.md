# Task: Rebalance Algorithm Weights & Add Wine Age Factor

**Branch:** `fix/algorithm-constants`
**Assigned to:** Claude Code
**Priority:** High — data-backed calibration improvements

---

## Context

We ran a comprehensive statistical analysis on 118 real wine entries (21 users, test accounts excluded) correlating feature inputs with user enjoyment. The analysis revealed several misalignments between the current algorithm weights and what actually predicts enjoyment. This task implements the data-backed corrections.

### Key Analysis Findings

| Signal | Current Weight | Data Says | Action |
|--------|---------------|-----------|--------|
| Region (categorical) | 8× multiplier | Strongest categorical (VR=0.418) | Increase to 12× |
| Varietal (categorical) | 12× multiplier | Second strongest (VR=0.141) | Decrease to 8× |
| Country (categorical) | 5× multiplier | Third strongest (VR=0.241) | Increase to 6× |
| Classification (categorical) | Not in formula | Quality gradient exists (VR=0.031) | Add at 4× |
| Alcohol perception (sensory) | 0.8 | Strongest sensory predictor (imp=0.392) | Increase to 1.0 |
| Body (sensory) | 1.2 | Moderate predictor (imp=0.246) | Decrease to 1.0 |
| Acidity (sensory) | 1.2 | Weakest sensory signal (imp=0.089) | Decrease to 0.9 |
| Tannin (sensory) | 1.2 | Weak predictor (imp=0.117) | Decrease to 1.0 |
| Sigmoid k | 0.8 | Score distribution too compressed | Decrease to 0.65 |
| Sigmoid midpoint | 3.0 | Scores cluster too high | Increase to 3.5 |
| Wine age | Not in algorithm | #1 overall predictor (rho=+0.40, p=0.011) | Add factor |

---

## Files to Modify

### 1. `src/server/algorithm/constants.ts`

**Current values → New values:**

```typescript
// BEFORE:
export const DEFAULT_AXIS_WEIGHTS: Record<SensoryAxis, number> = {
  body: 1.2,           // → 1.0
  acidity: 1.2,        // → 0.9
  tannin: 1.2,         // → 1.0
  fruit_ripeness: 1.2, // keep
  oak_presence: 1.0,   // keep
  concentration: 1.0,  // keep
  complexity: 1.0,     // keep
  aromatic_intensity: 1.0, // keep
  finish_length: 1.0,  // keep
  freshness: 1.0,      // keep
  earthy: 0.8,         // keep
  mineral: 0.8,        // keep
  savory: 0.8,         // keep
  alcohol_perception: 0.8, // → 1.0
  sweetness_perception: 0.6, // keep
  bitterness_phenolic_grip: 0.6, // keep
};

// AFTER:
export const DEFAULT_AXIS_WEIGHTS: Record<SensoryAxis, number> = {
  body: 1.0,
  acidity: 0.9,
  tannin: 1.0,
  fruit_ripeness: 1.2,
  oak_presence: 1.0,
  concentration: 1.0,
  complexity: 1.0,
  aromatic_intensity: 1.0,
  finish_length: 1.0,
  freshness: 1.0,
  earthy: 0.8,
  mineral: 0.8,
  savory: 0.8,
  alcohol_perception: 1.0,
  sweetness_perception: 0.6,
  bitterness_phenolic_grip: 0.6,
};
```

```typescript
// BEFORE:
export const SIGMOID_K = 0.8;
export const SIGMOID_MIDPOINT = 3.0;

// AFTER:
export const SIGMOID_K = 0.65;
export const SIGMOID_MIDPOINT = 3.5;
```

### 2. `src/server/algorithm/scoringEngine.ts`

#### A. Rebalance categorical bonus weights

In `computeCategoricalBonus()` (around line 103–126), the current multipliers are:
```typescript
return roundScore(
  varietalMatch * 12 * categoryVector.weights.varietal +      // 12 → 8
    regionMatch * 8 * categoryVector.weights.region +          // 8 → 12
    countryMatch * 5 * categoryVector.weights.country          // 5 → 6
);
```

**Change to:**
```typescript
return roundScore(
  varietalMatch * 8 * categoryVector.weights.varietal +
    regionMatch * 12 * categoryVector.weights.region +
    countryMatch * 6 * categoryVector.weights.country
);
```

#### B. Add classification bonus to categorical scoring

Classification tier shows a quality gradient (Premier Cru mean=94.8 vs IGT mean=60.0). Add it to the categorical bonus. This requires:

1. Add `classification` to the `EffectiveWineProfile.metadata` type in `src/server/algorithm/types.ts`:
   ```typescript
   // In the metadata type, add:
   classification: string | null;
   ```

2. Add classification affinity to `CategoricalPreferenceVector` in `src/server/algorithm/types.ts`:
   ```typescript
   export type CategoricalPreferenceVector = {
     varietals: Record<string, number>;
     regions: Record<string, number>;
     countries: Record<string, number>;
     classifications: Record<string, number>;  // NEW
     weights: {
       varietal: number;
       region: number;
       country: number;
       classification: number;  // NEW
     };
   };
   ```

3. In `computeCategoricalBonus()`, add classification matching:
   ```typescript
   const classificationMatch = scoreAffinityText(
     wine.metadata.classification,
     categoryVector.classifications
   );

   return roundScore(
     varietalMatch * 8 * categoryVector.weights.varietal +
       regionMatch * 12 * categoryVector.weights.region +
       countryMatch * 6 * categoryVector.weights.country +
       classificationMatch * 4 * categoryVector.weights.classification
   );
   ```

4. Update `computeMatchScore`'s max possible score comment/validation if one exists — the max categorical bonus is now `8 + 12 + 6 + 4 = 30` points (up from 25).

#### C. Add wine age factor

Add a modest wine-age-based score multiplier. The data shows older wines are consistently rated higher (Spearman rho=+0.40). A conservative multiplier prevents overcorrection for selection/occasion bias.

1. Add to `src/server/algorithm/types.ts` — extend `EffectiveWineProfile.metadata`:
   ```typescript
   vintage: number | null;  // NEW — the vintage year
   ```

2. In `src/server/algorithm/scoringEngine.ts`, add a helper function:
   ```typescript
   /**
    * Conservative wine-age score modifier.
    * Older wines tend to score higher (selection bias + aging benefit).
    * Range: 0.95 (very young, < 2 years) to 1.08 (20+ years).
    * Wines without vintage data get 1.0 (neutral).
    */
   function computeAgeFactor(vintage: number | null): number {
     if (vintage === null) {
       return 1.0;
     }

     const currentYear = new Date().getUTCFullYear();
     const age = currentYear - vintage;

     if (age < 0 || age > 100) {
       return 1.0; // Invalid vintage
     }

     if (age <= 1) return 0.95;
     if (age <= 3) return 0.97;
     if (age <= 5) return 1.0;
     if (age <= 10) return 1.02;
     if (age <= 20) return 1.05;
     return 1.08;
   }
   ```

3. Apply the age factor in `computeMatchScore()` — multiply `preBalanceScore` by the age factor before applying balance and categorical bonus:
   ```typescript
   const ageFactor = computeAgeFactor(wine.metadata.vintage ?? null);
   const finalScore = clamp(
     preBalanceScore * balanceFactor * ageFactor + categoricalBonus,
     0,
     100
   );
   ```

4. Add `age_factor` to the `MatchScore` return type in `types.ts`:
   ```typescript
   export type MatchScore = {
     score: number;
     band: MatchBand;
     confidence: number;
     balance_factor: number;
     age_factor: number;  // NEW
     pre_balance_score: number;
     axis_contributions: Record<SensoryAxis, AxisContribution>;
   };
   ```

   And return it in `computeMatchScore`:
   ```typescript
   return {
     score: roundScore(finalScore),
     band: classifyScore(finalScore),
     confidence,
     balance_factor: balanceFactor,
     age_factor: ageFactor,
     pre_balance_score: roundScore(preBalanceScore),
     axis_contributions: axisContributions,
   };
   ```

---

## Other Files That May Need Updates

### `src/server/algorithm/profileAssembly.ts`

Check `normalizeProfileMetadata()` (~line 755) — it builds `EffectiveWineProfile.metadata`. Ensure it now populates:
- `classification`: from `input.classification` or `input.quality_tier`
- `vintage`: from `input.vintage`

These fields should already be available on `AssembleWineProfileInput` — just make sure they flow through to the metadata output.

### `src/server/algorithm/userPreferences.ts`

If you added `classifications` and `classification` weight to `CategoricalPreferenceVector`, you need to update `buildCategoricalSummary()` and the merge functions to handle the new classification affinity. Follow the same pattern as the existing varietal/region/country accumulators. The classification data comes from the entry's `classification` field.

### E2E Tests: `e2e/ws1-algorithm-core.spec.ts`

Update test expectations that assert specific scores — the rebalanced weights and sigmoid will shift computed values. Focus on:
- Tests that check exact `score` values
- Tests that check `band` classifications (thresholds didn't change, but scores will shift)
- Tests that assert `balance_factor` or `pre_balance_score`

Add new test cases:
- Wine with `vintage: 2000` should have `age_factor: 1.08`
- Wine with `vintage: 2024` should have `age_factor: 0.97`
- Wine with `vintage: null` should have `age_factor: 1.0`
- Classification bonus: wine with matching classification should score higher than without

---

## Testing

1. `pnpm typecheck` — must pass with all type changes
2. `pnpm test` — update expected values in existing tests
3. `pnpm build` — verify no build errors
4. Manually verify: a wine with (region match + country match + varietal match + classification match) should produce a categorical bonus up to 30 points max

---

## Important Constraints

- Do NOT modify `profileAssembly.ts` beyond wiring `classification` and `vintage` into metadata — the profile assembly logic itself is correct
- Do NOT change `SCORE_BANDS` thresholds — those are UX decisions outside this task
- Do NOT change `SHRINKAGE_CONSTANT` or `FALLBACK_LEVEL_CONFIDENCE` — those are tuned separately
- Keep the age factor conservative (0.95–1.08 range) — we know the signal is real but confounded by selection bias
- The classification categorical weight (4×) is intentionally low — coverage is only 27% of entries
