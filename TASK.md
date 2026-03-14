# TASK.md — WS1: Algorithm Core (Scoring Engine)

> **READ THIS FILE** at session start and after every context compaction.
> It is your single source of truth for this branch.

## Branch

`feature/algorithm-core` — new branch off `main`.

## Goal

Build the deterministic wine scoring engine that assembles an effective wine profile from base profiles + modifier layers, then scores it against a user's per-type preference vector. This is the heart of the CellarSnap recommendation system.

The engine must be a pure backend service — no UI work in this branch.

## What Already Exists on Main

- `docs/palate_profiles_design_decisions.md` — the locked design spec (THIS IS YOUR BIBLE)
- `CLAUDE.md` — repo conventions
- `src/server/algorithm/resolver.ts` — canonical resolution service (WS2, separate branch — do NOT modify this file)
- `src/types/wine.ts` — `WineType` type and values
- All Supabase tables are populated and ready

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

## Data Tables in Supabase (all populated)

### Core Profile Data
| Table | Rows | Purpose |
|---|---|---|
| `base_profiles` | 174 | Regional wine profiles — the identity anchor for every wine |
| `vintage_weather_modifiers` | 2,150 | Per-region, per-vintage weather impact deltas |
| `classification_tier_modifiers` | 55 | Quality tier profile deltas (e.g., Grand Cru vs Village) |
| `classification_tier_aging_modifiers` | 40 | Quality tier aging window shifts |
| `producer_modifiers` | 705 | Producer-specific style deltas |
| `aging_curve_baselines` | 40 | Aging trajectory definitions per wine family |
| `grape_sensitivity_coefficients` | 14 | How grape varieties respond to weather conditions |
| `producer_region_crosswalk` | 91 | Maps producer_modifiers regions to base_profile regions |

### Taxonomy / Reference
| Table | Rows | Purpose |
|---|---|---|
| `taxonomy_master_v2` | 89 | Controlled vocabulary for all terms and scales |
| `taxonomy_classification_tiers` | 133 | Classification systems by country/region |
| `taxonomy_price_ranges` | 8 | Price range definitions |

### Alias Tables (used by WS2, but useful for reference)
| Table | Rows | Purpose |
|---|---|---|
| `region_aliases` | 715 | Region name normalization |
| `producer_aliases` | 1,695 | Producer name normalization |

### Key Schema Details

**base_profiles columns** (the 15 sensory axes):
`body`, `acidity`, `tannin`, `alcohol_perception`, `fruit_ripeness`, `oak_presence`, `earthy`, `mineral`, `savory`, `aromatic_intensity`, `sweetness_perception`, `bitterness_phenolic_grip`, `finish_length`, `concentration`, `freshness`

Plus 5 balance scores: `balance_body_acid`, `balance_sweet_acid`, `balance_tannin_fruit`, `balance_alcohol_body`, `balance_oak_fruit`, `overall_balance`

Plus descriptors: `primary_aroma_clusters`, `secondary_aroma_clusters`, `tertiary_aroma_clusters`, `oak_character`, `texture`, `style_families`

Lookup key: `country`, `region`, `sub_region`, `wine_type`, `primary_grapes`, `quality_tier`

**vintage_weather_modifiers columns:**
Lookup: `country`, `region`, `sub_region`, `vintage`
Deltas: `red_delta_*` and `white_delta_*` for each sensory axis (separate deltas for red and white wines)
Aging shifts: `youth_end_shift`, `development_end_shift`, `peak_end_shift`, `decline_end_shift`

**producer_modifiers columns:**
Lookup: `producer_name`, `region`
Deltas: `delta_body`, `delta_acidity`, `delta_tannin`, `delta_fruit_ripeness`, `delta_oak_presence`, `delta_concentration`, `delta_earthy`, `delta_aromatic_intensity`

**classification_tier_modifiers columns:**
Lookup: `classification_system`, `tier_name`
Deltas: `delta_*` for each sensory axis, plus `price_range_override`, `drinking_window_override`

## Structured Plan

### Phase 1: Types and Constants

Create `src/server/algorithm/types.ts`:

```typescript
// The 15 sensory axes used throughout the system
export const SENSORY_AXES = [
  'body', 'acidity', 'tannin', 'alcohol_perception', 'fruit_ripeness',
  'oak_presence', 'earthy', 'mineral', 'savory', 'aromatic_intensity',
  'sweetness_perception', 'bitterness_phenolic_grip', 'finish_length',
  'concentration', 'freshness'
] as const;

export type SensoryAxis = typeof SENSORY_AXES[number];

// A vector of sensory values (1-5 scale)
export type SensoryVector = Record<SensoryAxis, number>;

// The effective wine profile after all modifiers applied
export type EffectiveWineProfile = {
  sensory: SensoryVector;
  balance: {
    body_acid: number;
    sweet_acid: number;
    tannin_fruit: number;
    alcohol_body: number;
    oak_fruit: number;
    overall: number;
  };
  metadata: {
    base_profile_id: number;
    fallback_level: number;
    modifiers_applied: string[];  // e.g., ["vintage:2019", "producer:Opus One", "classification:First Growth"]
    aroma_clusters: { primary: string[]; secondary: string[]; tertiary: string[] };
    texture: string;
    style_families: string[];
  };
};

// Match score output
export type MatchScore = {
  score: number;             // 0-100
  band: 'excellent' | 'strong' | 'decent' | 'not_your_style';
  confidence: number;        // 0-1
  balance_factor: number;    // 0.85-1.00
  pre_balance_score: number; // before balance multiplier
  axis_contributions: Record<SensoryAxis, {
    user_value: number;
    wine_value: number;
    weight: number;
    contribution: number;  // weighted squared diff
  }>;
};

// User preference vector (per wine type)
export type UserPreferenceVector = {
  wine_type: WineType;
  sensory: Partial<SensoryVector>;  // may be sparse for users with few ratings
  weights: Partial<Record<SensoryAxis, number>>;
  event_count: number;  // number of wines rated for this type
};
```

Create `src/server/algorithm/constants.ts`:

```typescript
// D5: Axis Weights — expert priors
export const DEFAULT_AXIS_WEIGHTS: Record<SensoryAxis, number> = {
  body: 1.2, acidity: 1.2, tannin: 1.2, fruit_ripeness: 1.2,
  oak_presence: 1.0, concentration: 1.0, aromatic_intensity: 1.0,
  finish_length: 1.0, freshness: 1.0,
  earthy: 0.8, mineral: 0.8, savory: 0.8, alcohol_perception: 0.8,
  sweetness_perception: 0.6, bitterness_phenolic_grip: 0.6,
};

// D7: Balance factor mapping
export const BALANCE_FACTOR_MAP: Record<number, number> = {
  5: 1.00, 4: 0.96, 3: 0.92, 2: 0.88, 1: 0.85,
};

// D6: Score normalization bands
export const SCORE_BANDS = {
  EXCELLENT: { min: 90, label: 'excellent' },
  STRONG: { min: 75, label: 'strong' },
  DECENT: { min: 60, label: 'decent' },
  NOT_YOUR_STYLE: { min: 0, label: 'not_your_style' },
} as const;

// D8: Minimum confidence to show score
export const MIN_DISPLAY_CONFIDENCE = 0.50;

// D10: Cross-category shrinkage constant
export const SHRINKAGE_CONSTANT = 10;
```

### Phase 2: Profile Assembly Engine

Create `src/server/algorithm/profileAssembly.ts`:

This is the core function. Given a wine's canonical identity, it:

1. **Selects the base profile** using the D11 fallback hierarchy:
   - Query `base_profiles` trying most specific match first
   - Fall through: sub_region×varietal×wine_type → sub_region×wine_type → region×varietal×wine_type → region×wine_type → country×wine_type → wine_type only
   - Use tiebreakers: primary grape overlap, matching blend style, higher overall balance

2. **Applies aging curve deltas** (if vintage provided):
   - Look up `aging_curve_baselines` for the wine's region/type
   - Calculate current age = current_year - vintage
   - Determine phase (youth/development/peak/decline/past)
   - Apply the phase-specific deltas

3. **Applies vintage weather deltas** (if vintage provided):
   - Look up `vintage_weather_modifiers` for region + vintage
   - Use `red_delta_*` or `white_delta_*` based on wine_type
   - Apply `grape_sensitivity_coefficients` as multipliers on the weather deltas

4. **Applies classification tier deltas** (if classification provided):
   - Look up `taxonomy_classification_tiers` to identify the classification system
   - Look up `classification_tier_modifiers` for the tier
   - Apply deltas

5. **Applies producer deltas** (if producer provided):
   - Look up `producer_modifiers` by producer_name
   - Use `producer_region_crosswalk` if the producer's region field doesn't exactly match base_profile regions
   - Apply deltas

6. **Applies the relative clamp** (D3 — ONCE after all deltas accumulated):
   ```
   if delta >= 0:
     ceiling = base + (5 - base) * 0.5
     effective = min(base + delta, ceiling)
   if delta < 0:
     floor = base - (base - 1) * 0.5
     effective = max(base + delta, floor)
   ```

7. Returns the `EffectiveWineProfile`

**Function signature:**
```typescript
export async function assembleWineProfile(
  input: {
    canonical_region: string | null;
    canonical_sub_region: string | null;
    canonical_country: string | null;
    wine_type: WineType;
    primary_grapes: string | null;
    vintage: number | null;
    producer: string | null;
    classification: string | null;
    quality_tier: string | null;
  },
  supabase: SupabaseClient
): Promise<EffectiveWineProfile>
```

### Phase 3: Scoring Engine

Create `src/server/algorithm/scoringEngine.ts`:

1. **`computeMatchScore(wine: EffectiveWineProfile, user: UserPreferenceVector): MatchScore`**
   - Calculate weighted Euclidean distance (D4):
     ```
     distance = sqrt(sum(w_i * (user_i - wine_i)^2))
     ```
   - Apply sigmoid normalization (D6):
     ```
     score = 100 / (1 + e^(k * (distance - midpoint)))
     ```
     Start with `k = 0.8`, `midpoint = 3.0` (these are tuning params)
   - Apply balance multiplier (D7):
     ```
     final_score = sigmoid_score * balance_factor
     ```
   - Classify into band
   - Return per-axis contribution breakdown

2. **`buildUserPreferenceVector(entries: WineEntry[], wineType: WineType): UserPreferenceVector`**
   - For now, this can use advanced_notes from entries (body, acidity, tannin, sweetness, alcohol)
   - Weight by rating (higher-rated wines contribute more to preference)
   - Apply cross-category shrinkage (D10) for sparse types

### Phase 4: API Route

Create `src/app/api/algorithm/score/route.ts`:

**POST** endpoint that accepts:
```json
{
  "entry_id": "uuid",
  // OR direct fields:
  "wine_type": "red",
  "canonical_region": "Napa Valley",
  "canonical_country": "USA",
  "vintage": 2019,
  "producer": "Opus One",
  "classification": "First Growth"
}
```

Returns:
```json
{
  "score": 87,
  "band": "strong",
  "confidence": 0.75,
  "balance_factor": 0.96,
  "effective_profile": { ... },
  "axis_contributions": { ... },
  "modifiers_applied": ["vintage:2019", "producer:Opus One"]
}
```

The route:
1. Authenticates the user
2. If `entry_id` provided, loads the entry and uses its canonical fields
3. Calls `assembleWineProfile()` to build the effective wine vector
4. Loads the user's preference vector for the wine type
5. Calls `computeMatchScore()` to score
6. Returns the structured result

### Phase 5: Tests

Create `e2e/ws1-algorithm-core.spec.ts`:

**Profile Assembly tests:**
1. Known wine lookup — "Bordeaux, Red, Left Bank" returns base_profiles row 1 (body:4, acidity:3, tannin:4...)
2. Fallback hierarchy — region×wine_type match when sub_region has no match
3. Vintage modifier applied — 2019 Napa red gets weather-adjusted sensory values
4. Producer modifier applied — Opus One gets producer-specific deltas
5. Classification modifier — Grand Cru gets quality tier boost
6. Relative clamp — deltas don't push values past the 0.5×remaining ceiling/floor
7. Multiple modifiers stack correctly — vintage + producer + classification

**Scoring tests:**
8. Perfect match (user vector = wine vector) → score ~100
9. Complete mismatch → score < 60
10. Balance factor reduces score correctly (overall_balance=3 → 0.92 multiplier)
11. Per-axis contributions sum correctly
12. Score bands are assigned correctly

**Edge cases:**
13. Wine with no vintage → aging and vintage modifiers skipped
14. Wine with unknown producer → producer modifier skipped
15. Wine type "orange" or "sweet" with few base profiles → graceful degradation
16. Empty user preference vector → return score with low confidence

Create `e2e/ws1-algorithm-api.spec.ts`:

**API route tests:**
17. POST with direct fields → returns valid score
18. POST with entry_id → loads entry and scores
19. POST without auth → 401
20. POST with wine_type below confidence threshold → response includes confidence warning

### Phase 6: QA Validation

Run before marking complete:

```bash
# 1. Lint
npm run lint

# 2. Type check
npx tsc --noEmit

# 3. All existing tests still pass
npm run e2e

# 4. New algorithm tests pass
E2E_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/ws1-algorithm-core.spec.ts
E2E_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/ws1-algorithm-api.spec.ts

# 5. Manual smoke test: query the API with a known wine and verify the score looks reasonable
curl -X POST http://localhost:3000/api/algorithm/score \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <test_token>" \
  -d '{"wine_type":"red","canonical_region":"Bordeaux","canonical_country":"France","vintage":2019}'
```

## Files You Will Create

| File | Purpose |
|---|---|
| `src/server/algorithm/types.ts` | Core type definitions |
| `src/server/algorithm/constants.ts` | Axis weights, balance factors, score bands |
| `src/server/algorithm/profileAssembly.ts` | Profile assembly engine |
| `src/server/algorithm/scoringEngine.ts` | Match scoring logic |
| `src/server/algorithm/userPreferences.ts` | User preference vector builder |
| `src/app/api/algorithm/score/route.ts` | API endpoint |
| `e2e/ws1-algorithm-core.spec.ts` | Core engine tests |
| `e2e/ws1-algorithm-api.spec.ts` | API route tests |

## Files You Must NOT Touch

- `src/server/algorithm/resolver.ts` — owned by WS2 (feature/entry-normalization)
- Anything in `apps/mobile/`
- Anything in `src/features/` — no UI work
- Existing migration files in `supabase/sql/`
- `src/app/api/entries/route.ts` — owned by WS2

## Design Constraints (from palate_profiles_design_decisions.md)

These are non-negotiable for v1:

- **Weighted Euclidean distance** for scoring — NOT cosine similarity
- **Confidence is separate from score** — never multiply confidence into the score
- **Balance is a quality multiplier** — not a preference axis
- **Per-type user vectors** — do NOT average across wine types
- **Relative clamp applied ONCE** after all deltas accumulated — not after each modifier
- **1-5 scale** for all sensory values
- **earthy, mineral, savory** are separate axes
- **aromatic_intensity** is the axis name (not "floral")
- Modifier application order: base → aging → vintage weather → grape sensitivity → classification → producer → clamp
- Preserve raw values alongside canonical values

## Definition of Done

- [ ] Base profile lookup works with full D11 fallback hierarchy (6 levels)
- [ ] All 6 modifier layers apply correctly: aging, vintage weather, grape sensitivity, classification, producer, clamp
- [ ] Relative clamp prevents values from drifting beyond typicity bounds
- [ ] Weighted Euclidean distance scoring with sigmoid normalization
- [ ] Balance factor applied as quality multiplier
- [ ] Per-axis contribution breakdown in score output
- [ ] User preference vector built from entry history
- [ ] Cross-category shrinkage for sparse wine types
- [ ] API route returns complete structured score
- [ ] 20+ tests covering assembly, scoring, edge cases, and API
- [ ] `npm run lint` and `npx tsc --noEmit` pass clean
- [ ] No `any` types
- [ ] PR opened against main
