import type { MatchBand, SensoryAxis } from "@/server/algorithm/types";

/**
 * Base axis weights, rebalanced from enjoyment-prediction analysis:
 * - complexity (R²=0.153) and aromatic_intensity (R²=0.109) are the strongest
 *   predictors of enjoyment → boosted
 * - tannin dominates 22.6% of scoring distance but R²=0.001 with enjoyment
 *   (the "disconnect") → lowered significantly
 * - finish_length (R²=0.107) and fruit_ripeness (R²=0.130) remain high
 * - concentration (R²=0.084) gets a modest bump
 */
export const DEFAULT_AXIS_WEIGHTS: Record<SensoryAxis, number> = {
  body: 1.0,
  acidity: 0.9,
  tannin: 0.7,
  fruit_ripeness: 1.2,
  oak_presence: 0.9,
  concentration: 1.1,
  complexity: 1.3,
  aromatic_intensity: 1.2,
  finish_length: 1.1,
  freshness: 1.0,
  earthy: 0.8,
  mineral: 0.8,
  savory: 0.8,
  alcohol_perception: 0.9,
  sweetness_perception: 0.3,
  bitterness_phenolic_grip: 0.6,
};

/**
 * Population mean sensory values (1-5 scale) from assembled profiles.
 * Used to detect which axes deviate most for a given user, which drives
 * dynamic weighting and Pocket Somm preference explanations.
 */
export const POPULATION_AXIS_MEANS: Record<SensoryAxis, number> = {
  body: 3.3,
  acidity: 3.1,
  tannin: 2.8,
  alcohol_perception: 3.0,
  fruit_ripeness: 3.2,
  oak_presence: 2.5,
  earthy: 2.3,
  mineral: 2.4,
  savory: 2.2,
  aromatic_intensity: 3.1,
  sweetness_perception: 1.8,
  bitterness_phenolic_grip: 2.0,
  finish_length: 3.0,
  concentration: 3.1,
  complexity: 3.2,
  freshness: 3.0,
};

export const BALANCE_FACTOR_MAP: Record<number, number> = {
  5: 1.0,
  4: 0.96,
  3: 0.92,
  2: 0.88,
  1: 0.85,
};

export const SCORE_BANDS: readonly {
  min: number;
  label: MatchBand;
}[] = [
  { min: 90, label: "excellent" },
  { min: 75, label: "strong" },
  { min: 60, label: "decent" },
  { min: 0, label: "not_your_style" },
] as const;

export const MIN_DISPLAY_CONFIDENCE = 0.5;
export const SHRINKAGE_CONSTANT = 10;

/**
 * Maximum boost dynamic weighting can apply to an axis.
 * If a user's average value for an axis deviates strongly from the
 * population mean, its effective weight is scaled up (capped here).
 * This lets the algorithm self-tune: categorical-heavy users keep
 * categorical dominance, while users with distinctive sensory profiles
 * see those axes matter more.
 */
export const MAX_DYNAMIC_WEIGHT_BOOST = 1.5;

/**
 * Minimum number of entries before dynamic weight adjustment kicks in.
 * Below this threshold, base weights are used to prevent noise.
 */
export const DYNAMIC_WEIGHT_MIN_ENTRIES = 5;
export const SIGMOID_K = 0.65;
export const SIGMOID_MIDPOINT = 3.5;

/**
 * Number of real wine entries at which survey seeds are fully faded out.
 * Below this, survey data blends with entry-derived preferences.
 * Above this, survey data is ignored entirely.
 */
export const SURVEY_FADE_THRESHOLD = 15;

/** Default adventurousness when no survey exists. Neutral (no modifier). */
export const DEFAULT_ADVENTUROUSNESS = 5;

export const FALLBACK_LEVEL_CONFIDENCE: Record<number, number> = {
  1: 0.95,
  2: 0.85,
  3: 0.75,
  4: 0.6,
  5: 0.5,
  6: 0,
};
