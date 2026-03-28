/**
 * Survey seeding — converts taste survey answers into algorithm-compatible
 * preference vectors for cold-start users.
 *
 * Called by buildUserPreferenceVector() when event_count is below
 * SURVEY_FADE_THRESHOLD. The survey seeds are blended with entry-derived
 * preferences using a linear fade.
 */

import type {
  CategoricalPreferenceVector,
  SensoryAxis,
  SensoryVector,
} from "@/server/algorithm/types";
import { POPULATION_AXIS_MEANS } from "@/server/algorithm/constants";

// ── Survey row shape (matches taste_survey_responses table) ──────────

export type TasteSurveyRow = {
  wine_types: string[];
  varietals: string[];
  regions: string[];
  countries: string[];
  sensory_loves: string[];
  sensory_avoids: string[];
  budget_restaurant: string | null;
  budget_retail: string | null;
  adventurousness: number;
  free_text: string | null;
  completed_at: string | null;
};

// ── Sensory love → axis mapping ──────────────────────────────────────
// Each chip maps to one or more sensory axes with a seeded value.
// Values are calibrated relative to the 1–5 scale and population means.

const LOVE_AXIS_MAP: Record<string, Partial<Record<SensoryAxis, number>>> = {
  "Big and full-bodied": { body: 4.2 },
  "Light and delicate": { body: 2.0 },
  "High acidity, crisp": { acidity: 4.0, freshness: 4.0 },
  "Smooth and round": { tannin: 2.0, acidity: 2.5 },
  "Rich and oaky": { oak_presence: 4.0 },
  "Fruit-forward": { fruit_ripeness: 4.2 },
  "Earthy and funky": { earthy: 4.0 },
  "Mineral-driven": { mineral: 4.0 },
  "Complex and layered": { complexity: 4.5 },
  "Long, lingering finish": { finish_length: 4.2 },
  "Aromatic and perfumed": { aromatic_intensity: 4.2 },
  "Savory, umami notes": { savory: 4.0 },
};

// ── Sensory avoid → axis mapping ─────────────────────────────────────
// Avoid values are stronger negative signals. They override love values
// for the same axis if both are present.

const AVOID_AXIS_MAP: Record<string, Partial<Record<SensoryAxis, number>>> = {
  "Overly oaky": { oak_presence: 1.5 },
  "Very tannic / grippy": { tannin: 1.8, bitterness_phenolic_grip: 1.8 },
  "Too acidic / sour": { acidity: 1.8 },
  "Jammy / overripe fruit": { fruit_ripeness: 1.8 },
  "Hot / high alcohol": { alcohol_perception: 1.8 },
  "Very sweet": { sweetness_perception: 1.5 },
  "Too bitter / astringent": { bitterness_phenolic_grip: 1.5 },
  "Thin and watery": { body: 4.0, concentration: 4.0 },
};

// ── Build sensory vector from survey ─────────────────────────────────

export function buildSurveySensoryVector(
  survey: TasteSurveyRow
): Partial<SensoryVector> {
  const axisValues: Partial<Record<SensoryAxis, number>> = {};

  // Apply love mappings first
  for (const love of survey.sensory_loves) {
    const mapping = LOVE_AXIS_MAP[love];
    if (!mapping) continue;
    for (const [axis, value] of Object.entries(mapping)) {
      axisValues[axis as SensoryAxis] = value;
    }
  }

  // Apply avoid mappings — these override loves for the same axis
  for (const avoid of survey.sensory_avoids) {
    const mapping = AVOID_AXIS_MAP[avoid];
    if (!mapping) continue;
    for (const [axis, value] of Object.entries(mapping)) {
      axisValues[axis as SensoryAxis] = value;
    }
  }

  return axisValues;
}

// ── Build categorical vector from survey ─────────────────────────────

export function buildSurveyCategoricalVector(
  survey: TasteSurveyRow
): CategoricalPreferenceVector {
  const varietals: Record<string, number> = {};
  for (const v of survey.varietals) {
    varietals[v] = 1.0;
  }

  const regions: Record<string, number> = {};
  for (const r of survey.regions) {
    regions[r] = 1.0;
  }

  const countries: Record<string, number> = {};
  for (const c of survey.countries) {
    countries[c] = 1.0;
  }

  const classifications: Record<string, number> = {};
  for (const wt of survey.wine_types) {
    // Map display labels to algorithm classification values
    const normalized = wt.toLowerCase().replace(/\s*\/\s*/g, "_").replace(/\s+/g, "_");
    classifications[normalized] = 1.0;
  }

  // Categorical weights based on how many items the user selected.
  // More selections = stronger signal that the user cares about categories.
  const varietalWeight = survey.varietals.length > 0 ? 0.6 : 0;
  const regionWeight = survey.regions.length > 0 ? 0.6 : 0;
  const countryWeight = survey.countries.length > 0 ? 0.6 : 0;
  const classificationWeight = survey.wine_types.length > 0 ? 0.4 : 0;

  return {
    varietals,
    regions,
    countries,
    classifications,
    weights: {
      varietal: varietalWeight,
      region: regionWeight,
      country: countryWeight,
      classification: classificationWeight,
    },
  };
}

// ── Blend survey seeds with entry-derived preferences ────────────────

/**
 * Blend survey-seeded sensory values with entry-derived values.
 * surveyWeight ranges from 1.0 (all survey) to 0.0 (all entries).
 */
export function blendSensoryVectors(
  entrySensory: Partial<SensoryVector>,
  surveySensory: Partial<SensoryVector>,
  surveyWeight: number
): Partial<SensoryVector> {
  const result: Partial<SensoryVector> = {};

  const allAxes = new Set<SensoryAxis>([
    ...(Object.keys(entrySensory) as SensoryAxis[]),
    ...(Object.keys(surveySensory) as SensoryAxis[]),
  ]);

  for (const axis of allAxes) {
    const entryValue = entrySensory[axis];
    const surveyValue = surveySensory[axis];

    if (entryValue !== undefined && surveyValue !== undefined) {
      // Both exist — blend them
      result[axis] = entryValue * (1 - surveyWeight) + surveyValue * surveyWeight;
    } else if (entryValue !== undefined) {
      // Only entry data
      result[axis] = entryValue;
    } else if (surveyValue !== undefined) {
      // Only survey data — use it, weighted down by survey confidence
      result[axis] = surveyValue;
    }
  }

  return result;
}

/**
 * Blend survey-seeded categorical records with entry-derived records.
 */
export function blendAffinityRecords(
  entryRecord: Record<string, number>,
  surveyRecord: Record<string, number>,
  surveyWeight: number
): Record<string, number> {
  const result: Record<string, number> = {};

  const allKeys = new Set([
    ...Object.keys(entryRecord),
    ...Object.keys(surveyRecord),
  ]);

  for (const key of allKeys) {
    const entryValue = entryRecord[key];
    const surveyValue = surveyRecord[key];

    if (entryValue !== undefined && surveyValue !== undefined) {
      result[key] = entryValue * (1 - surveyWeight) + surveyValue * surveyWeight;
    } else if (entryValue !== undefined) {
      result[key] = entryValue;
    } else if (surveyValue !== undefined) {
      result[key] = surveyValue * surveyWeight;
    }
  }

  return result;
}

/**
 * Compute the adventurousness multiplier for the categorical bonus.
 * - adventurousness 1–3: multiplier 1.0–1.3 (stick to known categories)
 * - adventurousness 4–7: multiplier 1.0 (neutral)
 * - adventurousness 8–10: multiplier 0.7–1.0 (explore via sensory)
 */
export function computeAdventurousnessMultiplier(adventurousness: number): number {
  if (adventurousness <= 3) {
    // 1→1.3, 2→1.2, 3→1.1
    return 1.0 + (4 - adventurousness) * 0.1;
  }
  if (adventurousness >= 8) {
    // 8→0.9, 9→0.8, 10→0.7
    return 1.0 - (adventurousness - 7) * 0.1;
  }
  return 1.0;
}
