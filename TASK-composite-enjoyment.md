# TASK: Composite Enjoyment Score + Replace "Drink Again" Survey

**Branch:** `feat/composite-enjoyment`
**Assigned to:** Claude Code
**Priority:** High — scoring improvement + UI change bundled together

---

## ⚠️ PARALLEL AGENT WARNING

You are working in parallel with other agents on different branches. **Before every git operation:**

```bash
# Verify you're on the correct branch
git branch --show-current
# Expected output: feat/composite-enjoyment

# If not on the right branch:
git checkout feat/composite-enjoyment

# NEVER commit to main. NEVER merge into main yourself.
# If you need to pull latest main:
git fetch origin main
git rebase origin/main
```

**Other branches being worked on simultaneously:**
- `feat/back-derive-preferences` (Codex) — modifies `userPreferences.ts` and `handler.ts` (preference loading)
- `feat/nlp-tasting-notes` (Codex) — adds NLP module, may touch `userPreferences.ts`

**Your files (should NOT overlap with other branches):**
- `packages/shared/src/entry-flow/postSaveSurvey.ts` — survey type definitions
- `src/components/EntryPostSaveSurveyModal.tsx` — web survey UI
- `apps/mobile/src/components/entries/PostSaveSurveyModal.tsx` — mobile survey UI (if exists)
- `apps/mobile/src/lib/entryFlow/postSaveSurvey.ts` — mobile survey flow
- `apps/mobile/src/lib/entryFlow/usePostSaveSurveyFlow.ts` — mobile survey hook
- `src/lib/entryFlow/web/postSaveSurveyClient.ts` — web survey client
- `supabase/sql/035_entry_post_save_survey.sql` — DB schema for survey columns
- `src/server/algorithm/scoringEngine.ts` — composite scoring logic
- `src/server/algorithm/types.ts` — type additions for enjoyment signal
- `src/lib/schemaHealth.ts` — schema health column registry

**DO NOT modify:**
- `src/server/algorithm/userPreferences.ts` — being modified by `feat/back-derive-preferences`
- `src/app/api/algorithm/score/handler.ts` — being modified by `feat/back-derive-preferences`
- `src/server/algorithm/constants.ts` — already updated in Phase 1
- `src/server/algorithm/profileAssembly.ts` — not relevant to this task

---

## Part A: Replace "Drink Again" Binary with 4-Point Enjoyment Scale

### Problem
The current `drink_again` survey question is binary (yes/no) and has a 97% "yes" rate — it provides almost zero signal. We need a graduated scale that captures real preference strength.

### New Scale
Replace the `drink_again` question with a new `enjoyment_intent` question:

| Value | Label | Numeric Weight |
|-------|-------|----------------|
| `seek_more` | "I need to find more of this" | 1.0 |
| `happily_again` | "I'd happily order this again" | 0.7 |
| `if_poured` | "I'd drink it if someone poured it" | 0.35 |
| `pass` | "I'll pass next time" | 0.0 |

### Files to change for Part A

#### 1. DB Schema: `supabase/sql/035_entry_post_save_survey.sql`

Add the new enum type and column. **Keep the old `drink_again` column** for backward compatibility — don't drop it.

```sql
do $$
begin
  create type public.entry_survey_enjoyment_intent as enum (
    'seek_more',
    'happily_again',
    'if_poured',
    'pass'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.wine_entries
  add column if not exists survey_enjoyment_intent public.entry_survey_enjoyment_intent;

comment on column public.wine_entries.survey_enjoyment_intent is
  'Post-save answer: How enthusiastic is the user about drinking this wine again? Replaces binary drink_again.';
```

#### 2. Shared types: `packages/shared/src/entry-flow/postSaveSurvey.ts`

Update the types to support both old and new format:

```typescript
export type PostSaveSurveyAnswers<TValue extends string = string> = {
  how_was_it: TValue;
  expectations?: TValue;
  // Keep for backward compat
  drink_again?: TValue;
  // New graduated scale
  enjoyment_intent?: TValue;
};
```

Update `toSurveySubmissionPayload` to include `enjoyment_intent`.

#### 3. Web UI: `src/components/EntryPostSaveSurveyModal.tsx`

Replace the binary drink_again options:

```typescript
// Remove:
// const DRINK_AGAIN_OPTIONS: { value: DrinkAgainResponse; label: string }[] = [
//   { value: "yes", label: "Yes" },
//   { value: "no", label: "No" },
// ];

// Add:
export type EnjoymentIntentResponse = "seek_more" | "happily_again" | "if_poured" | "pass";

const ENJOYMENT_INTENT_OPTIONS: { value: EnjoymentIntentResponse; label: string }[] = [
  { value: "seek_more", label: "I need to find more of this" },
  { value: "happily_again", label: "I'd happily order this again" },
  { value: "if_poured", label: "I'd drink it if someone poured it" },
  { value: "pass", label: "I'll pass next time" },
];
```

Update the form state, validation (`canSubmit`), and submission to use `enjoyment_intent` instead of `drink_again`.

Update `PostSaveSurveySubmission` type to include `enjoyment_intent` instead of `drink_again`.

**Question label change:** The section header should say "Would you seek this out again?" instead of "Would you drink this again?"

#### 4. Mobile UI files

Check if `apps/mobile/src/components/entries/PostSaveSurveyModal.tsx` exists. If so, apply the same changes. Also update:
- `apps/mobile/src/lib/entryFlow/postSaveSurvey.ts`
- `apps/mobile/src/lib/entryFlow/usePostSaveSurveyFlow.ts`

#### 5. Schema health: `src/lib/schemaHealth.ts`

Add `survey_enjoyment_intent` to the column registry alongside the existing survey columns.

#### 6. Submission handlers

Search for any API routes that persist survey answers to the database. They'll need to write `survey_enjoyment_intent` alongside/instead of `survey_drink_again`. Check:
- `src/app/api/entries/[id]/comparison/handler.ts`
- Any route that calls `supabase.from("wine_entries").update(...)` with survey fields
- `apps/mobile/src/lib/entryFlow/entryPersistence.ts`

---

## Part B: Composite Enjoyment Score in Scoring Engine

### Problem
The current scoring engine (`scoringEngine.ts`) only uses sensory distance + balance + age + categorical bonus. It completely ignores the user's explicit enjoyment signals (rating, survey answers). These should boost or penalize the final score.

### Design

Add a `computeEnjoymentModifier()` function that produces a multiplier applied to the pre-balance score, similar to how `balanceFactor` and `ageFactor` work.

#### Enjoyment signal components

1. **Rating signal** — already available on entries, normalized via `normalizeRatingWeight()` in userPreferences.ts. For the scoring engine, we want a simpler mapping:
   - Rating >= 90: 1.06 (strong positive)
   - Rating 80-89: 1.03 (mild positive)
   - Rating 70-79: 1.0 (neutral)
   - Rating 60-69: 0.97 (mild negative)
   - Rating < 60: 0.94 (negative)

2. **Enjoyment intent signal** (from the new survey):
   - `seek_more`: 1.08
   - `happily_again`: 1.04
   - `if_poured`: 0.98
   - `pass`: 0.92

3. **How was it signal** (existing survey):
   - `exceptional`: 1.04
   - `good`: 1.02
   - `okay`: 1.0
   - `bad`: 0.96
   - `awful`: 0.92

**Combined formula:**
```
enjoymentModifier = ratingFactor * intentFactor * howWasItFactor
```

Clamped to [0.80, 1.20] to prevent extreme swings.

### Implementation

#### 1. `src/server/algorithm/types.ts`

Add enjoyment data to the input types. The `MatchScore` type already has `age_factor` and `balance_factor` — add `enjoyment_factor`:

```typescript
export type MatchScore = {
  score: number;
  band: MatchBand;
  confidence: number;
  balance_factor: number;
  age_factor: number;
  enjoyment_factor: number;  // NEW
  pre_balance_score: number;
  axis_contributions: Record<SensoryAxis, AxisContribution>;
};
```

Add a type for enjoyment signals passed into the scoring engine:

```typescript
export type EnjoymentSignals = {
  rating: number | null;
  enjoyment_intent: "seek_more" | "happily_again" | "if_poured" | "pass" | null;
  how_was_it: "exceptional" | "good" | "okay" | "bad" | "awful" | null;
};
```

#### 2. `src/server/algorithm/scoringEngine.ts`

Add the new function and integrate it into `computeMatchScore`:

```typescript
import type { EnjoymentSignals } from "@/server/algorithm/types";

const RATING_FACTOR_MAP: Record<string, number> = {
  "90+": 1.06,
  "80-89": 1.03,
  "70-79": 1.0,
  "60-69": 0.97,
  "<60": 0.94,
};

const ENJOYMENT_INTENT_FACTOR: Record<string, number> = {
  seek_more: 1.08,
  happily_again: 1.04,
  if_poured: 0.98,
  pass: 0.92,
};

const HOW_WAS_IT_FACTOR: Record<string, number> = {
  exceptional: 1.04,
  good: 1.02,
  okay: 1.0,
  bad: 0.96,
  awful: 0.92,
};

function computeEnjoymentFactor(signals: EnjoymentSignals | null): number {
  if (!signals) return 1.0;
  
  let ratingFactor = 1.0;
  if (typeof signals.rating === "number") {
    if (signals.rating >= 90) ratingFactor = 1.06;
    else if (signals.rating >= 80) ratingFactor = 1.03;
    else if (signals.rating >= 70) ratingFactor = 1.0;
    else if (signals.rating >= 60) ratingFactor = 0.97;
    else ratingFactor = 0.94;
  }
  
  const intentFactor = signals.enjoyment_intent
    ? (ENJOYMENT_INTENT_FACTOR[signals.enjoyment_intent] ?? 1.0)
    : 1.0;
    
  const howFactor = signals.how_was_it
    ? (HOW_WAS_IT_FACTOR[signals.how_was_it] ?? 1.0)
    : 1.0;
  
  return clamp(ratingFactor * intentFactor * howFactor, 0.80, 1.20);
}
```

Then modify `computeMatchScore` signature to accept optional enjoyment signals:

```typescript
export function computeMatchScore(
  wine: EffectiveWineProfile,
  user: UserPreferenceVector,
  enjoymentSignals?: EnjoymentSignals | null
): MatchScore {
  // ... existing logic ...
  
  const enjoymentFactor = computeEnjoymentFactor(enjoymentSignals ?? null);
  
  const finalScore = clamp(
    preBalanceScore * balanceFactor * ageFactor * enjoymentFactor + categoricalBonus,
    0,
    100
  );
  
  return {
    score: roundScore(finalScore),
    band: classifyScore(finalScore),
    confidence,
    balance_factor: balanceFactor,
    age_factor: ageFactor,
    enjoyment_factor: enjoymentFactor,  // NEW
    pre_balance_score: roundScore(preBalanceScore),
    axis_contributions: axisContributions,
  };
}
```

**IMPORTANT:** The `enjoymentSignals` parameter is OPTIONAL with a default of null. This ensures backward compatibility — all existing callers that don't pass it will get `enjoymentFactor = 1.0` (no change). The `feat/back-derive-preferences` branch modifies the callers, and they can add enjoyment signal passing later.

#### 3. Update callers (ONLY if they're in your file scope)

The handler at `src/app/api/algorithm/score/handler.ts` calls `computeMatchScore`. Since that file is being modified by the other branch, do NOT modify it. Instead, make sure your changes are backward-compatible (optional parameter).

The `buildAlgorithmScoreResponse` function in handler.ts includes `age_factor` in its response — it should also include `enjoyment_factor`. But since that's in handler.ts (other branch territory), leave a comment or note. The orchestrator (Computer) will handle the merge.

#### 4. Update the `AlgorithmScoreResponse` type

Find where `AlgorithmScoreResponse` is defined (likely `src/lib/algorithm/api.ts`) and add `enjoyment_factor`:

```typescript
enjoyment_factor: number;
```

---

## Part C: Migrate Existing Data

Write a SQL migration script that converts existing `drink_again` values to `enjoyment_intent` for entries that don't yet have the new field:

```sql
-- Backfill: map old drink_again to new enjoyment_intent
-- yes → happily_again (conservative default, we can't know how enthusiastic)
-- no → pass
UPDATE public.wine_entries
SET survey_enjoyment_intent = CASE
  WHEN survey_drink_again = 'yes' THEN 'happily_again'::public.entry_survey_enjoyment_intent
  WHEN survey_drink_again = 'no' THEN 'pass'::public.entry_survey_enjoyment_intent
  ELSE NULL
END
WHERE survey_enjoyment_intent IS NULL
  AND survey_drink_again IS NOT NULL;
```

Save this as `supabase/sql/036_migrate_drink_again_to_enjoyment_intent.sql`.

---

## Testing

### Existing tests
- `e2e/ws1-algorithm-core.spec.ts` — tests `computeMatchScore`. These WILL need updating since the return type now includes `enjoyment_factor`. Add the field to expected outputs.
- `e2e/ws3-algorithm-ui.spec.ts` — UI tests for the survey modal. Update to use new enjoyment_intent options.
- `e2e/post-save-survey-bulk.spec.ts` — bulk survey tests. Update for new field.

### New test scenarios
1. `computeEnjoymentFactor()` with all combinations of signals
2. `computeMatchScore()` with and without enjoyment signals (backward compat)
3. Survey modal renders new 4-option scale
4. Survey submission includes `enjoyment_intent` field

## Definition of Done
- [ ] New `entry_survey_enjoyment_intent` enum type and column added to SQL schema
- [ ] Survey UI (web + mobile) shows 4-point scale instead of yes/no
- [ ] `PostSaveSurveyAnswers` type updated with `enjoyment_intent`
- [ ] Submission handlers write `survey_enjoyment_intent` to DB
- [ ] `computeEnjoymentFactor()` implemented in scoringEngine.ts
- [ ] `computeMatchScore()` accepts optional `EnjoymentSignals` — backward compatible
- [ ] `MatchScore` type includes `enjoyment_factor`
- [ ] Data migration script created for existing drink_again values
- [ ] Schema health updated
- [ ] Existing tests updated, new tests added
- [ ] Clean TypeScript compilation (`npx tsc --noEmit`)
