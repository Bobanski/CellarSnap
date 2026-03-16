import type { AdvancedNotes } from "@/lib/advancedNotes";
import {
  DEFAULT_AXIS_WEIGHTS,
  SHRINKAGE_CONSTANT,
} from "@/server/algorithm/constants";
import type {
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

export type PreferenceSourceEntry = {
  rating: number | null;
  advanced_notes: AdvancedNotes | null;
  wine_type?: WineType | null;
};

const ADVANCED_NOTE_AXIS_MAP = {
  body: "body",
  acidity: "acidity",
  tannin: "tannin",
  alcohol: "alcohol_perception",
  sweetness: "sweetness_perception",
} as const;

function normalizeRatingWeight(rating: number | null) {
  if (typeof rating !== "number" || !Number.isFinite(rating)) {
    return 0.5;
  }

  return Math.max(0.25, Math.min(1.25, rating / 80));
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

  return {
    wine_type: wineType,
    sensory,
    weights,
    event_count: typeSummary.eventCount,
  };
}
