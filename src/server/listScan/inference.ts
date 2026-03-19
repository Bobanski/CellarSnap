import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeListScanCountryLabel } from "@shared";
import type { WineType } from "@/types/wine";

type BaseProfileRow = {
  country?: string | null;
  region?: string | null;
  sub_region?: string | null;
  wine_type?: string | null;
  primary_grapes?: string | string[] | null;
};

type AggregatedInferenceBucket = {
  country: string | null;
  region: string | null;
  subRegion: string | null;
  grapeCounts: Map<string, number>;
  wineTypeCounts: Map<WineType, number>;
};

export type ListScanInferenceValue = {
  grapes: string[];
  wineType: WineType | null;
  canonicalCountry: string | null;
  canonicalRegion: string | null;
  canonicalSubRegion: string | null;
};

export type ListScanInferenceMap = {
  appellationToGrapes: Map<string, ListScanInferenceValue>;
  grapeToWineType: Map<string, WineType>;
  regionAliases: Map<string, string>;
};

const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedInferenceMap:
  | {
      loadedAt: number;
      value: ListScanInferenceMap;
      isError: false;
    }
  | {
      loadedAt: number;
      value: null;
      isError: true;
      errorMessage: string;
    }
  | null = null;
let inFlightInferenceMapPromise: Promise<ListScanInferenceMap> | null = null;

function normalizeLookupValue(value: string | null | undefined) {
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

function normalizeDisplayValue(value: string | null | undefined) {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized ? normalized : null;
}

function parseList(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeDisplayValue(item))
      .filter((item): item is string => Boolean(item));
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/[;,/|]/)
    .map((item) => normalizeDisplayValue(item))
    .filter((item): item is string => Boolean(item));
}

function toWineType(value: string | null | undefined): WineType | null {
  const normalized = normalizeLookupValue(value);
  if (!normalized) {
    return null;
  }
  if (normalized.includes("sparkling")) {
    return "sparkling";
  }
  if (normalized.includes("rose")) {
    return "rose";
  }
  if (normalized.includes("orange")) {
    return "orange";
  }
  if (
    normalized.includes("sweet") ||
    normalized.includes("dessert") ||
    normalized.includes("fortified")
  ) {
    return "sweet";
  }
  if (normalized.includes("white")) {
    return "white";
  }
  if (normalized.includes("red")) {
    return "red";
  }
  return null;
}

function incrementCount<Key extends string>(
  map: Map<Key, number>,
  key: Key
) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function registerBucketValue(
  buckets: Map<string, AggregatedInferenceBucket>,
  rawKey: string | null | undefined,
  row: BaseProfileRow,
  grapes: string[],
  wineType: WineType | null
) {
  const key = normalizeLookupValue(rawKey);
  if (!key) {
    return;
  }

  const bucket =
    buckets.get(key) ??
    ({
      country: normalizeListScanCountryLabel(row.country) ?? normalizeDisplayValue(row.country),
      region: normalizeDisplayValue(row.region),
      subRegion: normalizeDisplayValue(row.sub_region),
      grapeCounts: new Map<string, number>(),
      wineTypeCounts: new Map<WineType, number>(),
    } satisfies AggregatedInferenceBucket);

  grapes.forEach((grape) => incrementCount(bucket.grapeCounts, grape));
  if (wineType) {
    incrementCount(bucket.wineTypeCounts, wineType);
  }

  buckets.set(key, bucket);
}

function finalizeBucket(
  bucket: AggregatedInferenceBucket
): ListScanInferenceValue | null {
  const sortedGrapes = Array.from(bucket.grapeCounts.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    })
    .map(([grape]) => grape)
    .slice(0, 3);

  const sortedWineTypes = Array.from(bucket.wineTypeCounts.entries()).sort(
    (left, right) => right[1] - left[1]
  );
  const wineType =
    sortedWineTypes.length === 1 ||
    (sortedWineTypes.length > 1 &&
      sortedWineTypes[0]?.[1] !== undefined &&
      sortedWineTypes[0][1] > (sortedWineTypes[1]?.[1] ?? 0))
      ? sortedWineTypes[0]?.[0] ?? null
      : null;

  if (sortedGrapes.length === 0 && !wineType) {
    return null;
  }

  return {
    grapes: sortedGrapes,
    wineType,
    canonicalCountry: bucket.country,
    canonicalRegion: bucket.region,
    canonicalSubRegion: bucket.subRegion,
  };
}

function buildRegionAliases(rows: BaseProfileRow[]) {
  const aliases = new Map<string, string>();

  rows.forEach((row) => {
    const region = normalizeDisplayValue(row.region);
    const subRegion = normalizeDisplayValue(row.sub_region);

    if (region) {
      aliases.set(normalizeLookupValue(region), region);
    }
    if (subRegion) {
      aliases.set(normalizeLookupValue(subRegion), subRegion);
    }
  });

  [
    ["bourgogne", "Burgundy"],
    ["burgundy", "Burgundy"],
    ["cotes du rhone", "Cotes du Rhone"],
    ["cote du rhone", "Cotes du Rhone"],
    ["rhone", "Rhone"],
    ["loire valley", "Loire"],
    ["napa", "Napa Valley"],
    ["willamette", "Willamette Valley"],
  ].forEach(([alias, canonical]) => {
    aliases.set(alias, canonical);
  });

  return aliases;
}

async function buildInferenceMap(): Promise<ListScanInferenceMap> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("base_profiles")
    .select("country, region, sub_region, wine_type, primary_grapes");

  if (error) {
    throw error;
  }

  const rows = ((data ?? []) as BaseProfileRow[]).filter(
    (row) => row.region || row.sub_region || row.primary_grapes
  );
  const appellationBuckets = new Map<string, AggregatedInferenceBucket>();
  const grapeToWineType = new Map<string, WineType>();

  rows.forEach((row) => {
    const grapes = parseList(row.primary_grapes);
    const wineType = toWineType(row.wine_type);

    grapes.forEach((grape) => {
      const normalized = normalizeLookupValue(grape);
      if (normalized && wineType && !grapeToWineType.has(normalized)) {
        grapeToWineType.set(normalized, wineType);
      }
    });

    registerBucketValue(appellationBuckets, row.sub_region, row, grapes, wineType);
    registerBucketValue(appellationBuckets, row.region, row, grapes, wineType);
  });

  const appellationToGrapes = new Map<string, ListScanInferenceValue>();
  appellationBuckets.forEach((bucket, key) => {
    const finalized = finalizeBucket(bucket);
    if (finalized) {
      appellationToGrapes.set(key, finalized);
    }
  });

  return {
    appellationToGrapes,
    grapeToWineType,
    regionAliases: buildRegionAliases(rows),
  };
}

export async function loadInferenceMap(): Promise<ListScanInferenceMap> {
  const now = Date.now();
  if (cachedInferenceMap && now - cachedInferenceMap.loadedAt < CACHE_TTL_MS) {
    if (cachedInferenceMap.isError) {
      throw new Error(
        "Inference map unavailable. " +
        `Last error: ${cachedInferenceMap.errorMessage}`
      );
    }
    return cachedInferenceMap.value;
  }

  if (!inFlightInferenceMapPromise) {
    inFlightInferenceMapPromise = buildInferenceMap()
      .then((value) => {
        cachedInferenceMap = {
          loadedAt: Date.now(),
          value,
          isError: false,
        };
        return value;
      })
      .catch((error) => {
        // Cache the error for the same TTL period to prevent hammering DB
        cachedInferenceMap = {
          loadedAt: Date.now(),
          value: null,
          isError: true,
          errorMessage: String(error),
        };
        // Re-throw so caller handles it
        throw error;
      })
      .finally(() => {
        inFlightInferenceMapPromise = null;
      });
  }

  return inFlightInferenceMapPromise;
}

export async function inferFromAppellation(
  appellation: string
): Promise<ListScanInferenceValue | null> {
  const inferenceMap = await loadInferenceMap();
  const normalized = normalizeLookupValue(appellation);
  if (!normalized) {
    return null;
  }

  const direct = inferenceMap.appellationToGrapes.get(normalized);
  if (direct) {
    return direct;
  }

  const alias = inferenceMap.regionAliases.get(normalized);
  if (!alias) {
    return null;
  }

  return inferenceMap.appellationToGrapes.get(normalizeLookupValue(alias)) ?? null;
}

export async function inferFromGrape(grape: string): Promise<{ wineType: WineType | null }> {
  const inferenceMap = await loadInferenceMap();
  return {
    wineType: inferenceMap.grapeToWineType.get(normalizeLookupValue(grape)) ?? null,
  };
}

export function resetInferenceMapCacheForTests() {
  cachedInferenceMap = null;
  inFlightInferenceMapPromise = null;
}
