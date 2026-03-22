import type { SupabaseClient } from "@supabase/supabase-js";
import type { WineType } from "@/types/wine";
import {
  SENSORY_AXES,
  type AssembleWineProfileInput,
  type EffectiveWineProfile,
  type SensoryAxis,
  type SensoryVector,
} from "@/server/algorithm/types";

type DataRow = Record<string, unknown>;

type BaseProfileRow = DataRow & {
  id: number | string;
  country?: string | null;
  region?: string | null;
  sub_region?: string | null;
  wine_type?: string | null;
  primary_grapes?: string | string[] | null;
  blend_style?: string | null;
  regulatory_classification?: string | null;
  quality_tier?: string | null;
  overall_balance?: number | null;
  primary_aroma_clusters?: string | string[] | null;
  secondary_aroma_clusters?: string | string[] | null;
  tertiary_aroma_clusters?: string | string[] | null;
  texture?: string | null;
  style_families?: string | string[] | null;
};

type AgingCurveRow = DataRow;
type VintageWeatherRow = DataRow;
type GrapeSensitivityRow = DataRow;
type ClassificationTaxonomyRow = DataRow;
type ClassificationTierModifierRow = DataRow;
type ProducerModifierRow = DataRow;
type ProducerRegionCrosswalkRow = DataRow;

type AgingPhase = "youth" | "development" | "peak" | "decline" | "past";

export type ProfileAssemblyDataSource = {
  listBaseProfiles: (wineType: WineType) => Promise<BaseProfileRow[]>;
  listAgingCurves: (wineType: WineType) => Promise<AgingCurveRow[]>;
  listVintageWeatherModifiers: (vintage: number) => Promise<VintageWeatherRow[]>;
  listGrapeSensitivityCoefficients: () => Promise<GrapeSensitivityRow[]>;
  listClassificationTaxonomy: () => Promise<ClassificationTaxonomyRow[]>;
  listClassificationTierModifiers: () => Promise<ClassificationTierModifierRow[]>;
  listProducerModifiers: () => Promise<ProducerModifierRow[]>;
  listProducerRegionCrosswalk: () => Promise<ProducerRegionCrosswalkRow[]>;
};

type SelectBaseProfileResult = {
  profile: BaseProfileRow;
  fallbackLevel: number;
};

const DEFAULT_AGING_WINDOWS = {
  youthEnd: 3,
  developmentEnd: 7,
  peakEnd: 15,
  declineEnd: 25,
};

const DATASET_WINE_TYPE_LABELS: Record<WineType, string[]> = {
  red: ["red"],
  white: ["white"],
  sparkling: ["sparkling"],
  rose: ["rose", "rosé"],
  sweet: ["sweet", "dessert", "sweet dessert"],
  orange: ["orange"],
};

const AXIS_COLUMN_ALIASES: Partial<Record<SensoryAxis, string[]>> = {
  bitterness_phenolic_grip: ["bitterness_phenolic"],
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wineTypeMatches(value: unknown, wineType: WineType) {
  const normalized = normalizeText(toString(value));
  if (!normalized) {
    return false;
  }

  return DATASET_WINE_TYPE_LABELS[wineType].some((candidate) => {
    const normalizedCandidate = normalizeText(candidate);
    return (
      normalized === normalizedCandidate ||
      normalized.includes(normalizedCandidate) ||
      normalizedCandidate.includes(normalized)
    );
  });
}

function toNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function toString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function parseList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/[;,/|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeList(values: string[]) {
  return values.map((value) => normalizeText(value)).filter(Boolean);
}

function getAxisValue(row: DataRow, axis: SensoryAxis) {
  return toNumber(row[axis]) ?? 3;
}

function roundValue(value: number) {
  return Number(value.toFixed(3));
}

function makeZeroVector(): SensoryVector {
  return Object.fromEntries(
    SENSORY_AXES.map((axis) => [axis, 0])
  ) as SensoryVector;
}

function makeBaseVector(row: BaseProfileRow): SensoryVector {
  return Object.fromEntries(
    SENSORY_AXES.map((axis) => [axis, roundValue(getAxisValue(row, axis))])
  ) as SensoryVector;
}

function overlapCount(left: string[], right: string[]) {
  const rightSet = new Set(normalizeList(right));
  return normalizeList(left).filter((item) => rightSet.has(item)).length;
}

function matchesString(
  candidate: unknown,
  target: string | null | undefined
): boolean {
  if (!target) {
    return false;
  }

  return normalizeText(toString(candidate)) === normalizeText(target);
}

function scoreStringMatch(
  candidate: unknown,
  target: string | null | undefined
) {
  if (!target) {
    return 0;
  }

  const normalizedCandidate = normalizeText(toString(candidate));
  const normalizedTarget = normalizeText(target);

  if (!normalizedCandidate || !normalizedTarget) {
    return 0;
  }

  if (normalizedCandidate === normalizedTarget) {
    return 3;
  }

  if (
    normalizedCandidate.includes(normalizedTarget) ||
    normalizedTarget.includes(normalizedCandidate)
  ) {
    return 2;
  }

  const candidateTokens = new Set(normalizedCandidate.split(" "));
  const targetTokens = normalizedTarget.split(" ");
  const overlap = targetTokens.filter((token) => candidateTokens.has(token)).length;
  return overlap > 0 ? 1 : 0;
}

function getRowString(row: DataRow, keys: string[]) {
  for (const key of keys) {
    const value = toString(row[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

function getDeltaValue(row: DataRow, axis: SensoryAxis, prefixes: string[]) {
  const aliases = [axis, ...(AXIS_COLUMN_ALIASES[axis] ?? [])];
  const candidateKeys = prefixes.flatMap((prefix) =>
    aliases.flatMap((alias) => [
      `${prefix}${alias}`,
      `${prefix}${alias}_delta`,
      `${alias}${prefix ? `_${prefix.replace(/_$/, "")}` : ""}`,
    ])
  );

  return (
    toNumber(
      ...candidateKeys.map((key) => row[key]),
      ...aliases.map((alias) => row[`delta_${alias}`]),
      ...aliases.map((alias) => row[alias])
    ) ?? 0
  );
}

function getSpecificityScore(
  row: DataRow,
  input: AssembleWineProfileInput
) {
  return [
    scoreStringMatch(row.sub_region, input.canonical_sub_region),
    scoreStringMatch(row.region, input.canonical_region),
    scoreStringMatch(row.country, input.canonical_country),
  ].reduce((sum, value) => sum + value, 0);
}

function getBlendStyle(value: unknown) {
  const normalized = normalizeText(toString(value));
  if (!normalized) {
    return null;
  }

  if (normalized.includes("blend")) {
    return "blend";
  }

  if (normalized.includes("single") || normalized.includes("variet")) {
    return "single_varietal";
  }

  return normalized;
}

function selectBaseProfile(
  rows: BaseProfileRow[],
  input: AssembleWineProfileInput
): SelectBaseProfileResult {
  const inputGrapes = parseList(input.primary_grapes);

  const levels: Array<{
    fallbackLevel: number;
    filter: (row: BaseProfileRow) => boolean;
  }> = [
    {
      fallbackLevel: 1,
      filter: (row) =>
        matchesString(row.sub_region, input.canonical_sub_region) &&
        overlapCount(parseList(row.primary_grapes), inputGrapes) > 0,
    },
    {
      fallbackLevel: 2,
      filter: (row) => matchesString(row.sub_region, input.canonical_sub_region),
    },
    {
      fallbackLevel: 3,
      filter: (row) =>
        matchesString(row.region, input.canonical_region) &&
        overlapCount(parseList(row.primary_grapes), inputGrapes) > 0,
    },
    {
      fallbackLevel: 4,
      filter: (row) => matchesString(row.region, input.canonical_region),
    },
    {
      fallbackLevel: 5,
      filter: (row) => matchesString(row.country, input.canonical_country),
    },
    {
      fallbackLevel: 6,
      filter: () => true,
    },
  ];

  for (const level of levels) {
    const candidates = rows.filter(level.filter);
    if (candidates.length === 0) {
      continue;
    }

    const selected = [...candidates].sort((left, right) => {
      const leftOverlap = overlapCount(parseList(left.primary_grapes), inputGrapes);
      const rightOverlap = overlapCount(parseList(right.primary_grapes), inputGrapes);
      if (leftOverlap !== rightOverlap) {
        return rightOverlap - leftOverlap;
      }

      const leftTierScore = Math.max(
        scoreStringMatch(left.quality_tier, input.quality_tier),
        scoreStringMatch(left.regulatory_classification, input.classification)
      );
      const rightTierScore = Math.max(
        scoreStringMatch(right.quality_tier, input.quality_tier),
        scoreStringMatch(right.regulatory_classification, input.classification)
      );
      if (leftTierScore !== rightTierScore) {
        return rightTierScore - leftTierScore;
      }

      const leftBlend = getBlendStyle(left.blend_style) ?? (parseList(left.primary_grapes).length > 1 ? "blend" : "single_varietal");
      const rightBlend = getBlendStyle(right.blend_style) ?? (parseList(right.primary_grapes).length > 1 ? "blend" : "single_varietal");
      const inputBlend = inputGrapes.length > 1 ? "blend" : "single_varietal";
      const leftBlendScore = leftBlend === inputBlend ? 1 : 0;
      const rightBlendScore = rightBlend === inputBlend ? 1 : 0;
      if (leftBlendScore !== rightBlendScore) {
        return rightBlendScore - leftBlendScore;
      }

      const leftBalance = toNumber(left.overall_balance) ?? 0;
      const rightBalance = toNumber(right.overall_balance) ?? 0;
      return rightBalance - leftBalance;
    })[0];

    return {
      profile: selected,
      fallbackLevel: level.fallbackLevel,
    };
  }

  throw new Error(`No base profile found for wine type "${input.wine_type}".`);
}

function resolveAgingWindows(
  row: AgingCurveRow | null,
  weatherRow: VintageWeatherRow | null
) {
  return {
    youthEnd:
      (toNumber(row?.youth_end, row?.youth_end_age, row?.youth_window_end) ??
        DEFAULT_AGING_WINDOWS.youthEnd) +
      (toNumber(weatherRow?.youth_end_shift) ?? 0),
    developmentEnd:
      (toNumber(
        row?.development_end,
        row?.development_end_age,
        row?.development_window_end
      ) ?? DEFAULT_AGING_WINDOWS.developmentEnd) +
      (toNumber(weatherRow?.development_end_shift) ?? 0),
    peakEnd:
      (toNumber(row?.peak_end, row?.peak_end_age, row?.peak_window_end) ??
        DEFAULT_AGING_WINDOWS.peakEnd) +
      (toNumber(weatherRow?.peak_end_shift) ?? 0),
    declineEnd:
      (toNumber(row?.decline_end, row?.decline_end_age, row?.decline_window_end) ??
        DEFAULT_AGING_WINDOWS.declineEnd) +
      (toNumber(weatherRow?.decline_end_shift) ?? 0),
  };
}

function resolveAgingPhase(age: number, windows: ReturnType<typeof resolveAgingWindows>) {
  if (age <= windows.youthEnd) {
    return "youth";
  }

  if (age <= windows.developmentEnd) {
    return "development";
  }

  if (age <= windows.peakEnd) {
    return "peak";
  }

  if (age <= windows.declineEnd) {
    return "decline";
  }

  return "past";
}

function getPhaseDelta(row: AgingCurveRow, phase: AgingPhase, axis: SensoryAxis) {
  const phasePrefixes =
    phase === "youth"
      ? []
      : phase === "development"
        ? ["dev_delta_", "development_delta_", "development_"]
        : phase === "peak"
          ? ["peak_delta_", "peak_"]
          : phase === "decline"
            ? ["decl_delta_", "decline_delta_", "decline_"]
            : ["past_delta_", "past_"];

  if (phasePrefixes.length === 0) {
    return 0;
  }

  return getDeltaValue(row, axis, phasePrefixes);
}

function applyRelativeClamp(baseValue: number, totalDelta: number) {
  const unclamped = baseValue + totalDelta;

  if (totalDelta >= 0) {
    const ceiling = baseValue + (5 - baseValue) * 0.5;
    return roundValue(Math.min(unclamped, ceiling));
  }

  const floor = baseValue - (baseValue - 1) * 0.5;
  return roundValue(Math.max(unclamped, floor));
}

function isRedWineType(wineType: WineType) {
  return wineType === "red";
}

function buildWineTypeOrFilter(columns: string[], wineType: WineType) {
  const patterns = [...new Set(DATASET_WINE_TYPE_LABELS[wineType])]
    .map((label) => label.trim())
    .filter(Boolean)
    .map((label) => label.replace(/\s+/g, "%"));

  return columns
    .flatMap((column) =>
      patterns.map((pattern) => `${column}.ilike.%${pattern}%`)
    )
    .join(",");
}

function resolveWeatherRow(
  rows: VintageWeatherRow[],
  input: AssembleWineProfileInput
) {
  return [...rows]
    .filter((row) =>
      [row.sub_region, row.region, row.country].some((value) =>
        matchesString(value, input.canonical_sub_region) ||
        matchesString(value, input.canonical_region) ||
        matchesString(value, input.canonical_country)
      )
    )
    .sort((left, right) => getSpecificityScore(right, input) - getSpecificityScore(left, input))[0] ??
    null;
}

function resolveAgingCurve(
  rows: AgingCurveRow[],
  input: AssembleWineProfileInput
) {
  return [...rows]
    .filter((row) => {
      const rowType = getRowString(row, ["wine_type", "type"]);
      return !rowType || wineTypeMatches(rowType, input.wine_type);
    })
    .sort((left, right) => {
      const specificityScore =
        getSpecificityScore(right, input) - getSpecificityScore(left, input);
      if (specificityScore !== 0) {
        return specificityScore;
      }

      return (
        overlapCount(parseList(right.primary_grapes), parseList(input.primary_grapes)) -
        overlapCount(parseList(left.primary_grapes), parseList(input.primary_grapes))
      );
    })
    .find((row) => {
      const rowCountry = getRowString(row, ["country"]);
      return !rowCountry || matchesString(rowCountry, input.canonical_country);
    }) ?? null;
}

function getSensitivityGrapeName(row: GrapeSensitivityRow) {
  return getRowString(row, [
    "grape_name",
    "grape",
    "variety_name",
    "primary_grape",
  ]);
}

function buildWeatherSensitivityMultiplier(
  rows: GrapeSensitivityRow[],
  primaryGrapes: string[],
  weatherRow: VintageWeatherRow | null
) {
  if (!weatherRow) {
    return 1;
  }

  const matchedRows = rows.filter((row) =>
    normalizeList(primaryGrapes).includes(normalizeText(getSensitivityGrapeName(row)))
  );

  if (matchedRows.length === 0) {
    return 1;
  }

  const tempScore = toNumber(weatherRow.temp_score) ?? 0;
  const rainScore = toNumber(weatherRow.rain_score) ?? 0;
  const averageSensitivity =
    matchedRows.reduce((sum, row) => {
      const heatOrColdSensitivity =
        tempScore >= 0
          ? toNumber(row.heat_sensitivity) ?? 1
          : toNumber(row.cold_sensitivity) ?? 1;
      const rainOrDroughtSensitivity =
        rainScore >= 0
          ? toNumber(row.rain_sensitivity) ?? 1
          : toNumber(row.drought_sensitivity) ?? 1;

      // Sensitivity tables are centered at 1.0, so we only amplify the weather
      // delta above that baseline. The 0.12 factor keeps strong vintages
      // noticeable without letting climate sensitivity swamp the base profile.
      const weatherIntensity =
        Math.abs(tempScore) * (heatOrColdSensitivity - 1) * 0.12 +
        Math.abs(rainScore) * (rainOrDroughtSensitivity - 1) * 0.12;

      return sum + (1 + weatherIntensity);
    }, 0) / matchedRows.length;

  return roundValue(Math.max(0.75, Math.min(1.35, averageSensitivity)));
}

function resolveClassificationSystem(
  taxonomyRows: ClassificationTaxonomyRow[],
  input: AssembleWineProfileInput
) {
  const targetTier = normalizeText(input.quality_tier ?? input.classification);
  if (!targetTier) {
    return null;
  }

  const matches = taxonomyRows.filter((row) => {
    const rowTier = getRowString(row, [
      "tier_name",
      "quality_tier",
      "classification",
      "classification_name",
    ]);
    return normalizeText(rowTier) === targetTier;
  });

  if (matches.length === 0) {
    return null;
  }

  const inputClassification = normalizeText(input.classification);

  const best = [...matches].sort(
    (left, right) => {
      const specificityDelta = getSpecificityScore(right, input) - getSpecificityScore(left, input);
      if (specificityDelta !== 0) {
        return specificityDelta;
      }

      const leftSystemScore = scoreStringMatch(
        getRowString(left, ["classification_system", "system_name", "system"]),
        inputClassification
      );
      const rightSystemScore = scoreStringMatch(
        getRowString(right, ["classification_system", "system_name", "system"]),
        inputClassification
      );
      if (leftSystemScore !== rightSystemScore) {
        return rightSystemScore - leftSystemScore;
      }

      const leftRank = toNumber(left.quality_rank) ?? Number.POSITIVE_INFINITY;
      const rightRank = toNumber(right.quality_rank) ?? Number.POSITIVE_INFINITY;
      return leftRank - rightRank;
    }
  )[0];

  return getRowString(best, ["classification_system", "system_name", "system"]);
}

function resolveClassificationModifier(
  rows: ClassificationTierModifierRow[],
  system: string | null,
  input: AssembleWineProfileInput
) {
  const targetTier = normalizeText(input.quality_tier ?? input.classification);
  if (!targetTier) {
    return null;
  }

  const normalizedSystem = normalizeText(system);
  const candidates = rows.filter((row) => {
    const rowTier = getRowString(row, ["tier_name", "quality_tier", "classification"]);
    const rowSystem = getRowString(row, [
      "classification_system",
      "system_name",
      "system",
    ]);
    const tierMatches = normalizeText(rowTier) === targetTier;
    const systemMatches = normalizedSystem
      ? normalizeText(rowSystem) === normalizedSystem
      : true;
    return tierMatches && systemMatches;
  });

  return [...candidates].sort((left, right) => {
    const leftRank = toNumber(left.quality_rank) ?? Number.POSITIVE_INFINITY;
    const rightRank = toNumber(right.quality_rank) ?? Number.POSITIVE_INFINITY;
    return leftRank - rightRank;
  })[0] ?? null;
}

function resolveProducerModifier(
  rows: ProducerModifierRow[],
  crosswalkRows: ProducerRegionCrosswalkRow[],
  input: AssembleWineProfileInput
) {
  if (!input.producer) {
    return null;
  }

  const normalizedProducer = normalizeText(input.producer);
  const candidates = rows.filter(
    (row) => {
      const rowProducer = normalizeText(getRowString(row, ["producer_name", "producer"]));
      if (rowProducer !== normalizedProducer) {
        return false;
      }

      const rowWineType = getRowString(row, ["wine_type"]);
      return !rowWineType || wineTypeMatches(rowWineType, input.wine_type);
    }
  );

  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((left, right) => {
    const leftRegion = getRowString(left, ["region", "producer_region"]);
    const rightRegion = getRowString(right, ["region", "producer_region"]);
    const leftAppellation = getRowString(left, ["appellation"]);
    const rightAppellation = getRowString(right, ["appellation"]);

    const leftMatches = matchesString(leftAppellation, input.canonical_sub_region)
      ? 3
      : matchesString(leftRegion, input.canonical_region)
        ? 2
      : crosswalkRows.some((row) => {
          const producerRegion = getRowString(row, [
            "producer_modifier_region",
            "producer_region",
          ]);
          const baseRegion = getRowString(row, [
            "profile_region",
            "base_profile_region",
          ]);
          const baseSubRegion = getRowString(row, ["profile_sub_region"]);
          return (
            normalizeText(producerRegion) === normalizeText(leftRegion) &&
            (normalizeText(baseSubRegion) === normalizeText(input.canonical_sub_region) ||
              normalizeText(baseRegion) === normalizeText(input.canonical_region))
          );
        })
        ? 1
        : 0;

    const rightMatches = matchesString(rightAppellation, input.canonical_sub_region)
      ? 3
      : matchesString(rightRegion, input.canonical_region)
        ? 2
      : crosswalkRows.some((row) => {
          const producerRegion = getRowString(row, [
            "producer_modifier_region",
            "producer_region",
          ]);
          const baseRegion = getRowString(row, [
            "profile_region",
            "base_profile_region",
          ]);
          const baseSubRegion = getRowString(row, ["profile_sub_region"]);
          return (
            normalizeText(producerRegion) === normalizeText(rightRegion) &&
            (normalizeText(baseSubRegion) === normalizeText(input.canonical_sub_region) ||
              normalizeText(baseRegion) === normalizeText(input.canonical_region))
          );
        })
        ? 1
        : 0;

    return rightMatches - leftMatches;
  })[0];
}

function buildModifierDelta(
  row: DataRow | null,
  prefixes: string[]
): SensoryVector {
  if (!row) {
    return makeZeroVector();
  }

  return Object.fromEntries(
    SENSORY_AXES.map((axis) => [axis, roundValue(getDeltaValue(row, axis, prefixes))])
  ) as SensoryVector;
}

function addVectors(left: SensoryVector, right: SensoryVector) {
  return Object.fromEntries(
    SENSORY_AXES.map((axis) => [axis, roundValue(left[axis] + right[axis])])
  ) as SensoryVector;
}

function multiplyWeatherBySensitivity(
  weatherDelta: SensoryVector,
  sensitivityMultiplier: number
) {
  return Object.fromEntries(
    SENSORY_AXES.map((axis) => [
      axis,
      roundValue(weatherDelta[axis] * sensitivityMultiplier),
    ])
  ) as SensoryVector;
}

function getBalanceValue(row: BaseProfileRow, keys: string[]) {
  return roundValue(toNumber(...keys.map((key) => row[key])) ?? 3);
}

function normalizeProfileMetadata(
  row: BaseProfileRow,
  fallbackLevel: number,
  modifiersApplied: string[],
  input: AssembleWineProfileInput
): EffectiveWineProfile["metadata"] {
  return {
    base_profile_id: toNumber(row.id) ?? 0,
    fallback_level: fallbackLevel,
    modifiers_applied: modifiersApplied,
    aroma_clusters: {
      primary: parseList(row.primary_aroma_clusters),
      secondary: parseList(row.secondary_aroma_clusters),
      tertiary: parseList(row.tertiary_aroma_clusters),
    },
    texture: toString(row.texture) ?? "",
    style_families: parseList(row.style_families),
    canonical_country: input.canonical_country ?? null,
    canonical_region: input.canonical_region ?? null,
    canonical_sub_region: input.canonical_sub_region ?? null,
    primary_grapes: parseList(input.primary_grapes),
    classification: input.classification ?? input.quality_tier ?? null,
    vintage: input.vintage ?? null,
  };
}

export function createSupabaseProfileAssemblyDataSource(
  supabase: SupabaseClient
): ProfileAssemblyDataSource {
  return {
    async listBaseProfiles(wineType) {
      const { data, error } = await supabase
        .from("base_profiles")
        .select("*")
        .or(buildWineTypeOrFilter(["wine_type"], wineType));
      if (error) {
        throw error;
      }
      return ((data ?? []) as BaseProfileRow[]).filter((row) =>
        wineTypeMatches(row.wine_type, wineType)
      );
    },
    async listAgingCurves(wineType) {
      const { data, error } = await supabase
        .from("aging_curve_baselines")
        .select("*")
        .or(buildWineTypeOrFilter(["wine_type"], wineType));
      if (error) {
        throw error;
      }
      return ((data ?? []) as AgingCurveRow[]).filter((row) => {
        const rowType = getRowString(row, ["wine_type", "type"]);
        return !rowType || wineTypeMatches(rowType, wineType);
      });
    },
    async listVintageWeatherModifiers(vintage) {
      const { data, error } = await supabase
        .from("vintage_weather_modifiers")
        .select("*")
        .eq("vintage", vintage);
      if (error) {
        throw error;
      }
      return (data ?? []) as VintageWeatherRow[];
    },
    async listGrapeSensitivityCoefficients() {
      const { data, error } = await supabase
        .from("grape_sensitivity_coefficients")
        .select("*");
      if (error) {
        throw error;
      }
      return (data ?? []) as GrapeSensitivityRow[];
    },
    async listClassificationTaxonomy() {
      const { data, error } = await supabase
        .from("taxonomy_classification_tiers")
        .select("*");
      if (error) {
        throw error;
      }
      return (data ?? []) as ClassificationTaxonomyRow[];
    },
    async listClassificationTierModifiers() {
      const { data, error } = await supabase
        .from("classification_tier_modifiers")
        .select("*");
      if (error) {
        throw error;
      }
      return (data ?? []) as ClassificationTierModifierRow[];
    },
    async listProducerModifiers() {
      const { data, error } = await supabase.from("producer_modifiers").select("*");
      if (error) {
        throw error;
      }
      return (data ?? []) as ProducerModifierRow[];
    },
    async listProducerRegionCrosswalk() {
      const { data, error } = await supabase
        .from("producer_region_crosswalk")
        .select("*");
      if (error) {
        throw error;
      }
      return (data ?? []) as ProducerRegionCrosswalkRow[];
    },
  };
}

export async function assembleWineProfile(
  input: AssembleWineProfileInput,
  supabase: SupabaseClient
): Promise<EffectiveWineProfile> {
  return assembleWineProfileWithDataSource(
    input,
    createSupabaseProfileAssemblyDataSource(supabase)
  );
}

export async function assembleWineProfileWithDataSource(
  input: AssembleWineProfileInput,
  dataSource: ProfileAssemblyDataSource
): Promise<EffectiveWineProfile> {
  const [
    baseProfiles,
    agingCurves,
    classificationTaxonomy,
    classificationTierModifiers,
    producerModifiers,
    producerRegionCrosswalk,
    grapeSensitivityRows,
  ] = await Promise.all([
    dataSource.listBaseProfiles(input.wine_type),
    dataSource.listAgingCurves(input.wine_type),
    dataSource.listClassificationTaxonomy(),
    dataSource.listClassificationTierModifiers(),
    dataSource.listProducerModifiers(),
    dataSource.listProducerRegionCrosswalk(),
    dataSource.listGrapeSensitivityCoefficients(),
  ]);

  const { profile: baseProfile, fallbackLevel } = selectBaseProfile(baseProfiles, input);
  const baseSensory = makeBaseVector(baseProfile);
  let totalDelta = makeZeroVector();
  const modifiersApplied: string[] = [];

  let weatherRow: VintageWeatherRow | null = null;
  if (typeof input.vintage === "number") {
    const vintageRows = await dataSource.listVintageWeatherModifiers(input.vintage);
    weatherRow = resolveWeatherRow(vintageRows, input);
  }

  if (typeof input.vintage === "number") {
    const agingCurve = resolveAgingCurve(agingCurves, input);
    if (agingCurve) {
      const age = new Date().getUTCFullYear() - input.vintage;
      const phase = resolveAgingPhase(age, resolveAgingWindows(agingCurve, weatherRow));
      const agingDelta = Object.fromEntries(
        SENSORY_AXES.map((axis) => [axis, roundValue(getPhaseDelta(agingCurve, phase, axis))])
      ) as SensoryVector;
      totalDelta = addVectors(totalDelta, agingDelta);
      modifiersApplied.push(`aging:${phase}`);
    }
  }

  if (weatherRow) {
    const weatherPrefix = isRedWineType(input.wine_type) ? "red_delta_" : "white_delta_";
    const weatherDelta = buildModifierDelta(weatherRow, [weatherPrefix]);
    const sensitivityMultiplier = buildWeatherSensitivityMultiplier(
      grapeSensitivityRows,
      parseList(input.primary_grapes),
      weatherRow
    );
    totalDelta = addVectors(
      totalDelta,
      multiplyWeatherBySensitivity(weatherDelta, sensitivityMultiplier)
    );
    modifiersApplied.push(`vintage:${input.vintage}`);
  }

  const classificationSystem = resolveClassificationSystem(classificationTaxonomy, input);
  const classificationModifier = resolveClassificationModifier(
    classificationTierModifiers,
    classificationSystem,
    input
  );
  if (classificationModifier) {
    totalDelta = addVectors(
      totalDelta,
      buildModifierDelta(classificationModifier, ["delta_"])
    );
    modifiersApplied.push(`classification:${input.quality_tier ?? input.classification}`);
  }

  const producerModifier = resolveProducerModifier(
    producerModifiers,
    producerRegionCrosswalk,
    input
  );
  if (producerModifier) {
    totalDelta = addVectors(
      totalDelta,
      buildModifierDelta(producerModifier, ["delta_"])
    );
    modifiersApplied.push(`producer:${input.producer}`);
  }

  const sensory = Object.fromEntries(
    SENSORY_AXES.map((axis) => [
      axis,
      applyRelativeClamp(baseSensory[axis], totalDelta[axis]),
    ])
  ) as SensoryVector;

  return {
    sensory,
      balance: {
      body_acid: getBalanceValue(baseProfile, [
        "balance_body_acid",
        "body_acid_balance",
      ]),
      sweet_acid: getBalanceValue(baseProfile, [
        "balance_sweet_acid",
        "sweet_acid_balance",
      ]),
      tannin_fruit: getBalanceValue(baseProfile, [
        "balance_tannin_fruit",
        "tannin_fruit_balance",
      ]),
      alcohol_body: getBalanceValue(baseProfile, [
        "balance_alcohol_body",
        "alcohol_body_balance",
      ]),
      oak_fruit: getBalanceValue(baseProfile, [
        "balance_oak_fruit",
        "oak_fruit_balance",
      ]),
      overall: getBalanceValue(baseProfile, ["overall_balance"]),
      },
      metadata: normalizeProfileMetadata(
        baseProfile,
        fallbackLevel,
        modifiersApplied,
        input
      ),
    };
}

/**
 * Pre-fetches all reference data needed for batch wine profile assembly.
 * Called once before scoring any wines to eliminate redundant Supabase queries.
 */
export async function batchPrefetchProfileData(
  dataSource: ProfileAssemblyDataSource,
  wineTypes: WineType[],
  vintages: number[]
) {
  const uniqueWineTypes = Array.from(new Set(wineTypes));
  const uniqueVintages = Array.from(new Set(vintages));

  const prefetchQueries: Promise<unknown>[] = [];

  // Fetch base profiles and aging curves for each wine type
  const baseProfilesByType = new Map<WineType, BaseProfileRow[]>();
  const agingCurvesByType = new Map<WineType, AgingCurveRow[]>();

  for (const wineType of uniqueWineTypes) {
    prefetchQueries.push(
      dataSource.listBaseProfiles(wineType).then((profiles) => {
        baseProfilesByType.set(wineType, profiles);
      })
    );
    prefetchQueries.push(
      dataSource.listAgingCurves(wineType).then((curves) => {
        agingCurvesByType.set(wineType, curves);
      })
    );
  }

  // Fetch vintage weather modifiers for each vintage
  const vintageWeatherByVintage = new Map<number, VintageWeatherRow[]>();
  for (const vintage of uniqueVintages) {
    prefetchQueries.push(
      dataSource.listVintageWeatherModifiers(vintage).then((weather) => {
        vintageWeatherByVintage.set(vintage, weather);
      })
    );
  }

  // Fetch shared reference tables (only once)
  let classificationTaxonomy: ClassificationTaxonomyRow[] = [];
  let classificationTierModifiers: ClassificationTierModifierRow[] = [];
  let producerModifiers: ProducerModifierRow[] = [];
  let producerRegionCrosswalk: ProducerRegionCrosswalkRow[] = [];
  let grapeSensitivityRows: GrapeSensitivityRow[] = [];

  prefetchQueries.push(
    dataSource.listClassificationTaxonomy().then((rows) => {
      classificationTaxonomy = rows;
    })
  );
  prefetchQueries.push(
    dataSource.listClassificationTierModifiers().then((rows) => {
      classificationTierModifiers = rows;
    })
  );
  prefetchQueries.push(
    dataSource.listProducerModifiers().then((rows) => {
      producerModifiers = rows;
    })
  );
  prefetchQueries.push(
    dataSource.listProducerRegionCrosswalk().then((rows) => {
      producerRegionCrosswalk = rows;
    })
  );
  prefetchQueries.push(
    dataSource.listGrapeSensitivityCoefficients().then((rows) => {
      grapeSensitivityRows = rows;
    })
  );

  // Wait for all queries to complete
  await Promise.all(prefetchQueries);

  // Return a synchronous data source that uses pre-fetched data
  return {
    baseProfilesByType,
    agingCurvesByType,
    vintageWeatherByVintage,
    classificationTaxonomy,
    classificationTierModifiers,
    producerModifiers,
    producerRegionCrosswalk,
    grapeSensitivityRows,
  };
}

/**
 * Creates a ProfileAssemblyDataSource that returns pre-fetched data synchronously.
 * Wraps results in Promise.resolve() for API compatibility.
 */
export function createPreFetchedProfileDataSource(
  prefetchedData: Awaited<ReturnType<typeof batchPrefetchProfileData>>
): ProfileAssemblyDataSource {
  return {
    listBaseProfiles: (wineType: WineType) => {
      return Promise.resolve(prefetchedData.baseProfilesByType.get(wineType) ?? []);
    },
    listAgingCurves: (wineType: WineType) => {
      return Promise.resolve(prefetchedData.agingCurvesByType.get(wineType) ?? []);
    },
    listVintageWeatherModifiers: (vintage: number) => {
      return Promise.resolve(prefetchedData.vintageWeatherByVintage.get(vintage) ?? []);
    },
    listClassificationTaxonomy: () => {
      return Promise.resolve(prefetchedData.classificationTaxonomy);
    },
    listClassificationTierModifiers: () => {
      return Promise.resolve(prefetchedData.classificationTierModifiers);
    },
    listProducerModifiers: () => {
      return Promise.resolve(prefetchedData.producerModifiers);
    },
    listProducerRegionCrosswalk: () => {
      return Promise.resolve(prefetchedData.producerRegionCrosswalk);
    },
    listGrapeSensitivityCoefficients: () => {
      return Promise.resolve(prefetchedData.grapeSensitivityRows);
    },
  };
}
