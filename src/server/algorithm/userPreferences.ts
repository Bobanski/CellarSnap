import type { AdvancedNotes } from "@/lib/advancedNotes";
import {
  DEFAULT_ADVENTUROUSNESS,
  DEFAULT_AXIS_WEIGHTS,
  DYNAMIC_WEIGHT_MIN_ENTRIES,
  MAX_DYNAMIC_WEIGHT_BOOST,
  POPULATION_AXIS_MEANS,
  SHRINKAGE_CONSTANT,
  SURVEY_FADE_THRESHOLD,
} from "@/server/algorithm/constants";
import {
  blendAffinityRecords,
  buildSurveyCategoricalVector,
  buildSurveySensoryVector,
  type TasteSurveyRow,
} from "@/server/algorithm/surveySeeding";
import { extractFromNotes } from "@/server/algorithm/notesNlp";
import type {
  CategoricalPreferenceVector,
  SensoryAxis,
  SensoryVector,
  UserPreferenceVector,
} from "@/server/algorithm/types";
import type { WineType } from "@/types/wine";

type PreferenceAccumulator = {
  weightedSum: number;
  weightTotal: number;
};

type PreferenceSummary = {
  sensory: Partial<SensoryVector>;
  observedAxes: Set<SensoryAxis>;
  eventCount: number;
};

type AffinityAccumulator = {
  weightedSum: number;
};

type CategoricalSummary = {
  varietals: Record<string, number>;
  regions: Record<string, number>;
  countries: Record<string, number>;
  classifications: Record<string, number>;
  eventCounts: {
    varietal: number;
    region: number;
    country: number;
    classification: number;
  };
};

export type PreferenceSourceEntry = {
  rating: number | null;
  advanced_notes: AdvancedNotes | null;
  notes?: string | null;
  wine_type?: WineType | null;
  canonical_region?: string | null;
  canonical_sub_region?: string | null;
  canonical_country?: string | null;
  region?: string | null;
  appellation?: string | null;
  country?: string | null;
  primary_grapes?: string | string[] | null;
  classification?: string | null;
  assembled_sensory?: Partial<SensoryVector> | null;
};

const ADVANCED_NOTE_AXIS_MAP = {
  body: "body",
  acidity: "acidity",
  tannin: "tannin",
  alcohol: "alcohol_perception",
  sweetness: "sweetness_perception",
} as const;

function normalizePreferenceText(value: string | null | undefined) {
  const normalized = (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    normalized === "united states" ||
    normalized === "united states of america" ||
    normalized === "u s" ||
    normalized === "u s a" ||
    normalized === "us"
  ) {
    return "usa";
  }

  return normalized;
}

function normalizePreferenceValues(
  value:
    | string
    | Array<string | null | undefined>
    | ReadonlyArray<string | null | undefined>
    | null
    | undefined
) {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[;,/|]/)
      : [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  rawValues.forEach((entry) => {
    const key = normalizePreferenceText(entry);
    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    normalized.push(key);
  });

  return normalized;
}

function normalizeRatingWeight(rating: number | null) {
  if (typeof rating !== "number" || !Number.isFinite(rating)) {
    return 0.5;
  }

  return Math.max(0.25, Math.min(1.25, rating / 80));
}

function calculateCategoricalWeight(eventCount: number) {
  if (eventCount <= 0) {
    return 0;
  }

  const confidence = eventCount / (eventCount + SHRINKAGE_CONSTANT);
  return Number((0.35 + confidence * 0.65).toFixed(3));
}

function addAffinityValue(
  accumulator: Map<string, AffinityAccumulator>,
  value: string,
  weight: number
) {
  const current = accumulator.get(value) ?? {
    weightedSum: 0,
  };

  current.weightedSum += weight;
  accumulator.set(value, current);
}

function buildAffinityRecord(
  accumulator: Map<string, AffinityAccumulator>,
  totalWeight: number
) {
  const record: Record<string, number> = {};

  accumulator.forEach((value, key) => {
    if (totalWeight <= 0) {
      return;
    }

    record[key] = Number((value.weightedSum / totalWeight).toFixed(3));
  });

  return record;
}

function buildCategoricalSummary(entries: PreferenceSourceEntry[]): CategoricalSummary {
  const varietals = new Map<string, AffinityAccumulator>();
  const regions = new Map<string, AffinityAccumulator>();
  const countries = new Map<string, AffinityAccumulator>();
  const classifications = new Map<string, AffinityAccumulator>();
  let varietalTotalWeight = 0;
  let regionTotalWeight = 0;
  let countryTotalWeight = 0;
  let classificationTotalWeight = 0;
  const eventCounts = {
    varietal: 0,
    region: 0,
    country: 0,
    classification: 0,
  };

  entries.forEach((entry) => {
    const weight = normalizeRatingWeight(entry.rating);

    const varietalValues = normalizePreferenceValues(entry.primary_grapes);
    if (varietalValues.length > 0) {
      varietalTotalWeight += weight;
      eventCounts.varietal += 1;
      varietalValues.forEach((value) => addAffinityValue(varietals, value, weight));
    }

    const regionValues = normalizePreferenceValues([
      entry.canonical_sub_region,
      entry.canonical_region,
      entry.appellation,
      entry.region,
    ]);
    if (regionValues.length > 0) {
      regionTotalWeight += weight;
      eventCounts.region += 1;
      regionValues.forEach((value) => addAffinityValue(regions, value, weight));
    }

    const countryValues = normalizePreferenceValues([
      entry.canonical_country,
      entry.country,
    ]);
    if (countryValues.length > 0) {
      countryTotalWeight += weight;
      eventCounts.country += 1;
      countryValues.forEach((value) => addAffinityValue(countries, value, weight));
    }

    const classificationValue = normalizePreferenceText(entry.classification);
    if (classificationValue) {
      classificationTotalWeight += weight;
      eventCounts.classification += 1;
      addAffinityValue(classifications, classificationValue, weight);
    }
  });

  return {
    varietals: buildAffinityRecord(varietals, varietalTotalWeight),
    regions: buildAffinityRecord(regions, regionTotalWeight),
    countries: buildAffinityRecord(countries, countryTotalWeight),
    classifications: buildAffinityRecord(classifications, classificationTotalWeight),
    eventCounts,
  };
}

function mergeAffinityRecords(
  typeRecord: Record<string, number>,
  globalRecord: Record<string, number>,
  shrinkageWeight: number
) {
  const merged: Record<string, number> = {};
  const keys = new Set([...Object.keys(typeRecord), ...Object.keys(globalRecord)]);

  keys.forEach((key) => {
    const typeValue = typeRecord[key];
    const globalValue = globalRecord[key];

    if (typeof typeValue === "number" && typeof globalValue === "number") {
      merged[key] = Number(
        (typeValue * shrinkageWeight + globalValue * (1 - shrinkageWeight)).toFixed(3)
      );
      return;
    }

    if (typeof typeValue === "number") {
      merged[key] = Number(typeValue.toFixed(3));
      return;
    }

    if (typeof globalValue === "number") {
      merged[key] = Number(globalValue.toFixed(3));
    }
  });

  return merged;
}

function mergeCategoricalWeight(typeEventCount: number, globalEventCount: number, shrinkageWeight: number) {
  const mergedCount =
    typeEventCount > 0 && globalEventCount > 0
      ? Math.round(typeEventCount * shrinkageWeight + globalEventCount * (1 - shrinkageWeight))
      : typeEventCount > 0
        ? typeEventCount
        : globalEventCount;

  return calculateCategoricalWeight(mergedCount);
}

function levelToValue(
  noteKey: keyof AdvancedNotes,
  value: AdvancedNotes[keyof AdvancedNotes]
): number | null {
  if (!value) {
    return null;
  }

  const maps: Record<string, Record<string, number>> = {
    body: {
      light: 1,
      medium_minus: 2,
      medium: 3,
      medium_plus: 4,
      full: 5,
    },
    acidity: {
      low: 1,
      medium_minus: 2,
      medium: 3,
      medium_plus: 4,
      high: 5,
    },
    tannin: {
      low: 1,
      medium_minus: 2,
      medium: 3,
      medium_plus: 4,
      high: 5,
    },
    alcohol: {
      low: 1,
      medium: 3,
      high: 5,
    },
    sweetness: {
      dry: 1,
      off_dry: 2.5,
      medium_sweet: 4,
      sweet: 5,
    },
  };

  return maps[noteKey]?.[value] ?? null;
}

function buildPreferenceSummary(entries: PreferenceSourceEntry[]): PreferenceSummary {
  const accumulators = new Map<SensoryAxis, PreferenceAccumulator>();
  let eventCount = 0;

  entries.forEach((entry) => {
    const noteWeight = normalizeRatingWeight(entry.rating);
    let contributed = false;

    if (entry.assembled_sensory) {
      (Object.keys(entry.assembled_sensory) as SensoryAxis[]).forEach((axis) => {
        const value = entry.assembled_sensory?.[axis];
        if (typeof value !== "number") {
          return;
        }

        const current = accumulators.get(axis) ?? {
          weightedSum: 0,
          weightTotal: 0,
        };
        current.weightedSum += value * noteWeight;
        current.weightTotal += noteWeight;
        accumulators.set(axis, current);
        contributed = true;
      });
    }

    (Object.keys(ADVANCED_NOTE_AXIS_MAP) as Array<keyof typeof ADVANCED_NOTE_AXIS_MAP>).forEach(
      (noteKey) => {
        const numericValue = levelToValue(noteKey, entry.advanced_notes?.[noteKey] ?? null);
        if (numericValue === null) {
          return;
        }

        const axis = ADVANCED_NOTE_AXIS_MAP[noteKey];
        const overrideWeight = noteWeight * 1.5;
        const current = accumulators.get(axis) ?? {
          weightedSum: 0,
          weightTotal: 0,
        };
        current.weightedSum += numericValue * overrideWeight;
        current.weightTotal += overrideWeight;
        accumulators.set(axis, current);
        contributed = true;
      }
    );

    // NLP extraction from free-text tasting notes — 3rd signal layer.
    // Lower weight (0.6×) than assembled_sensory (1.0×) and advanced_notes (1.5×)
    // because NLP from free text is inherently less precise.
    // Each axis hint is further scaled by its extraction confidence.
    // Hints are validated against the wine's assembled profile to discard
    // notes that contradict reality (e.g. "too acidic" on a low-acid wine).
    const nlpResult = extractFromNotes(entry.notes, entry.assembled_sensory);
    if (nlpResult) {
      (Object.keys(nlpResult.sensoryHints) as SensoryAxis[]).forEach((axis) => {
        const hint = nlpResult.sensoryHints[axis];
        if (!hint || typeof hint.value !== "number") {
          return;
        }

        const nlpWeight = noteWeight * 0.6 * hint.confidence;
        const current = accumulators.get(axis) ?? {
          weightedSum: 0,
          weightTotal: 0,
        };
        current.weightedSum += hint.value * nlpWeight;
        current.weightTotal += nlpWeight;
        accumulators.set(axis, current);
        contributed = true;
      });
    }

    if (contributed) {
      eventCount += 1;
    }
  });

  const sensory: Partial<SensoryVector> = {};
  const observedAxes = new Set<SensoryAxis>();

  accumulators.forEach((accumulator, axis) => {
    if (accumulator.weightTotal <= 0) {
      return;
    }

    sensory[axis] = Number((accumulator.weightedSum / accumulator.weightTotal).toFixed(3));
    observedAxes.add(axis);
  });

  return {
    sensory,
    observedAxes,
    eventCount,
  };
}

function mergeAxisValue(
  typeValue: number | undefined,
  globalValue: number | undefined,
  shrinkageWeight: number
) {
  if (typeof typeValue === "number" && typeof globalValue === "number") {
    return Number(
      (typeValue * shrinkageWeight + globalValue * (1 - shrinkageWeight)).toFixed(3)
    );
  }

  if (typeof typeValue === "number") {
    return typeValue;
  }

  if (typeof globalValue === "number") {
    return globalValue;
  }

  return undefined;
}

/**
 * Compute a dynamic boost for each sensory axis based on how much the user's
 * preference deviates from the population mean.  Users with distinctive sensory
 * profiles (e.g., consistently preferring high tannin) get those axes amplified.
 * Users whose sensory profile is close to average get no boost — for them,
 * categorical bonuses (region, varietal) naturally dominate the score.
 *
 * Returns a multiplier in [1.0, MAX_DYNAMIC_WEIGHT_BOOST].
 */
function computeDynamicBoost(
  userValue: number,
  axis: SensoryAxis,
  eventCount: number
): number {
  if (eventCount < DYNAMIC_WEIGHT_MIN_ENTRIES) {
    return 1.0;
  }

  const populationMean = POPULATION_AXIS_MEANS[axis];
  const deviation = Math.abs(userValue - populationMean);

  // deviation of ~0.5 on a 1-5 scale is meaningful; 1.0+ is very strong
  // sigmoid-ish curve: starts boosting noticeably at 0.4, saturates around 1.2
  const rawBoost = 1.0 + (deviation / (deviation + 0.6)) * (MAX_DYNAMIC_WEIGHT_BOOST - 1.0);

  // confidence ramp: full boost at 15+ entries, partial before that
  const confidenceRamp = Math.min(1.0, (eventCount - DYNAMIC_WEIGHT_MIN_ENTRIES) / 10);

  return 1.0 + (rawBoost - 1.0) * confidenceRamp;
}

export function buildUserPreferenceVector(
  entries: PreferenceSourceEntry[],
  wineType: WineType,
  survey?: TasteSurveyRow | null
): UserPreferenceVector {
  const typeEntries = entries.filter((entry) => entry.wine_type === wineType);
  const effectiveTypeEntries = typeEntries.length > 0 ? typeEntries : entries;

  const typeSummary = buildPreferenceSummary(effectiveTypeEntries);
  const globalSummary =
    typeEntries.length > 0 ? buildPreferenceSummary(entries) : typeSummary;
  const shrinkageWeight =
    typeSummary.eventCount / (typeSummary.eventCount + SHRINKAGE_CONSTANT);

  const typeCategoricalSummary = buildCategoricalSummary(effectiveTypeEntries);
  const globalCategoricalSummary =
    typeEntries.length > 0 ? buildCategoricalSummary(entries) : typeCategoricalSummary;

  // ── Survey blending ──────────────────────────────────────────────
  // When the user has few entries, survey answers supplement the
  // preference vector. The survey weight fades linearly to 0 as the
  // user logs more wines.
  const hasSurvey = survey?.completed_at != null;
  const surveyWeight = hasSurvey
    ? Math.max(0, 1 - typeSummary.eventCount / SURVEY_FADE_THRESHOLD)
    : 0;
  const surveySensory = hasSurvey ? buildSurveySensoryVector(survey) : {};
  const surveyCategorical = hasSurvey
    ? buildSurveyCategoricalVector(survey)
    : null;

  const sensory: Partial<SensoryVector> = {};
  const weights: Partial<Record<SensoryAxis, number>> = {};

  Object.keys(DEFAULT_AXIS_WEIGHTS).forEach((axisKey) => {
    const axis = axisKey as SensoryAxis;
    const merged = mergeAxisValue(
      typeSummary.sensory[axis],
      globalSummary.sensory[axis],
      shrinkageWeight
    );

    // If no entry data exists for this axis, fall back to survey seed
    const entryValue = merged;
    const surveyValue = surveySensory[axis];

    let finalValue: number | undefined;
    if (entryValue !== undefined && surveyValue !== undefined && surveyWeight > 0) {
      // Blend entry data with survey seed
      finalValue = entryValue * (1 - surveyWeight) + surveyValue * surveyWeight;
    } else if (entryValue !== undefined) {
      finalValue = entryValue;
    } else if (surveyValue !== undefined && surveyWeight > 0) {
      // Pure survey seed (no entry data for this axis)
      finalValue = surveyValue;
    }

    if (finalValue === undefined) {
      return;
    }

    sensory[axis] = finalValue;

    const typeObserved = typeSummary.observedAxes.has(axis);
    const globalObserved = globalSummary.observedAxes.has(axis);
    const hasSurveyValue = surveyValue !== undefined && surveyWeight > 0;
    const observationWeight =
      typeObserved && globalObserved
        ? 0.75 + shrinkageWeight * 0.25
        : typeObserved
          ? 0.6 + shrinkageWeight * 0.4
          : globalObserved
            ? 0.35
            : hasSurveyValue
              ? 0.3 * surveyWeight
              : 0;

    const dynamicBoost = computeDynamicBoost(finalValue, axis, typeSummary.eventCount);
    weights[axis] = Number((DEFAULT_AXIS_WEIGHTS[axis] * observationWeight * dynamicBoost).toFixed(3));
  });

  // ── Build categorical vector with survey blending ─────────────
  const entryVarietals = mergeAffinityRecords(
    typeCategoricalSummary.varietals,
    globalCategoricalSummary.varietals,
    shrinkageWeight
  );
  const entryRegions = mergeAffinityRecords(
    typeCategoricalSummary.regions,
    globalCategoricalSummary.regions,
    shrinkageWeight
  );
  const entryCountries = mergeAffinityRecords(
    typeCategoricalSummary.countries,
    globalCategoricalSummary.countries,
    shrinkageWeight
  );
  const entryClassifications = mergeAffinityRecords(
    typeCategoricalSummary.classifications,
    globalCategoricalSummary.classifications,
    shrinkageWeight
  );

  const categorical: CategoricalPreferenceVector = {
    varietals: surveyCategorical && surveyWeight > 0
      ? blendAffinityRecords(entryVarietals, surveyCategorical.varietals, surveyWeight)
      : entryVarietals,
    regions: surveyCategorical && surveyWeight > 0
      ? blendAffinityRecords(entryRegions, surveyCategorical.regions, surveyWeight)
      : entryRegions,
    countries: surveyCategorical && surveyWeight > 0
      ? blendAffinityRecords(entryCountries, surveyCategorical.countries, surveyWeight)
      : entryCountries,
    classifications: surveyCategorical && surveyWeight > 0
      ? blendAffinityRecords(entryClassifications, surveyCategorical.classifications, surveyWeight)
      : entryClassifications,
    weights: {
      varietal: mergeCategoricalWeight(
        typeCategoricalSummary.eventCounts.varietal,
        globalCategoricalSummary.eventCounts.varietal,
        shrinkageWeight
      ),
      region: mergeCategoricalWeight(
        typeCategoricalSummary.eventCounts.region,
        globalCategoricalSummary.eventCounts.region,
        shrinkageWeight
      ),
      country: mergeCategoricalWeight(
        typeCategoricalSummary.eventCounts.country,
        globalCategoricalSummary.eventCounts.country,
        shrinkageWeight
      ),
      classification: mergeCategoricalWeight(
        typeCategoricalSummary.eventCounts.classification,
        globalCategoricalSummary.eventCounts.classification,
        shrinkageWeight
      ),
    },
  };

  return {
    wine_type: wineType,
    sensory,
    weights,
    categorical,
    event_count: typeSummary.eventCount,
    adventurousness: survey?.adventurousness ?? DEFAULT_ADVENTUROUSNESS,
  };
}
