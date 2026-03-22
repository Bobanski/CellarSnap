import type { AdvancedNotes } from "@/lib/advancedNotes";
import {
  DEFAULT_AXIS_WEIGHTS,
  SHRINKAGE_CONSTANT,
} from "@/server/algorithm/constants";
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
  wine_type?: WineType | null;
  canonical_region?: string | null;
  canonical_sub_region?: string | null;
  canonical_country?: string | null;
  region?: string | null;
  appellation?: string | null;
  country?: string | null;
  primary_grapes?: string | string[] | null;
  classification?: string | null;
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
    if (!entry.advanced_notes) {
      return;
    }

    const noteWeight = normalizeRatingWeight(entry.rating);
    let contributed = false;

    (Object.keys(ADVANCED_NOTE_AXIS_MAP) as Array<keyof typeof ADVANCED_NOTE_AXIS_MAP>).forEach(
      (noteKey) => {
        const numericValue = levelToValue(noteKey, entry.advanced_notes?.[noteKey] ?? null);
        if (numericValue === null) {
          return;
        }

        const axis = ADVANCED_NOTE_AXIS_MAP[noteKey];
        const current = accumulators.get(axis) ?? {
          weightedSum: 0,
          weightTotal: 0,
        };
        current.weightedSum += numericValue * noteWeight;
        current.weightTotal += noteWeight;
        accumulators.set(axis, current);
        contributed = true;
      }
    );

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

export function buildUserPreferenceVector(
  entries: PreferenceSourceEntry[],
  wineType: WineType
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

  const sensory: Partial<SensoryVector> = {};
  const weights: Partial<Record<SensoryAxis, number>> = {};

  Object.keys(DEFAULT_AXIS_WEIGHTS).forEach((axisKey) => {
    const axis = axisKey as SensoryAxis;
    const merged = mergeAxisValue(
      typeSummary.sensory[axis],
      globalSummary.sensory[axis],
      shrinkageWeight
    );

    if (merged === undefined) {
      return;
    }

    sensory[axis] = merged;

    const typeObserved = typeSummary.observedAxes.has(axis);
    const globalObserved = globalSummary.observedAxes.has(axis);
    const observationWeight =
      typeObserved && globalObserved
        ? 0.75 + shrinkageWeight * 0.25
        : typeObserved
          ? 0.6 + shrinkageWeight * 0.4
          : globalObserved
            ? 0.35
            : 0;

    weights[axis] = Number((DEFAULT_AXIS_WEIGHTS[axis] * observationWeight).toFixed(3));
  });

  const categorical: CategoricalPreferenceVector = {
    varietals: mergeAffinityRecords(
      typeCategoricalSummary.varietals,
      globalCategoricalSummary.varietals,
      shrinkageWeight
    ),
    regions: mergeAffinityRecords(
      typeCategoricalSummary.regions,
      globalCategoricalSummary.regions,
      shrinkageWeight
    ),
    countries: mergeAffinityRecords(
      typeCategoricalSummary.countries,
      globalCategoricalSummary.countries,
      shrinkageWeight
    ),
    classifications: mergeAffinityRecords(
      typeCategoricalSummary.classifications,
      globalCategoricalSummary.classifications,
      shrinkageWeight
    ),
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
  };
}
