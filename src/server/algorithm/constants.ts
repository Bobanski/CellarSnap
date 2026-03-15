import type { MatchBand, SensoryAxis } from "@/server/algorithm/types";

export const DEFAULT_AXIS_WEIGHTS: Record<SensoryAxis, number> = {
  body: 1.2,
  acidity: 1.2,
  tannin: 1.2,
  fruit_ripeness: 1.2,
  oak_presence: 1.0,
  concentration: 1.0,
  aromatic_intensity: 1.0,
  finish_length: 1.0,
  freshness: 1.0,
  earthy: 0.8,
  mineral: 0.8,
  savory: 0.8,
  alcohol_perception: 0.8,
  sweetness_perception: 0.6,
  bitterness_phenolic_grip: 0.6,
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
export const SIGMOID_K = 0.8;
export const SIGMOID_MIDPOINT = 3.0;

export const FALLBACK_LEVEL_CONFIDENCE: Record<number, number> = {
  1: 0.95,
  2: 0.85,
  3: 0.75,
  4: 0.6,
  5: 0.5,
  6: 0,
};
