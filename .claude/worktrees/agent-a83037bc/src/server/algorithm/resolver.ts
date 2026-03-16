/**
 * WS2: Entry Normalization — Canonical Resolution Service
 *
 * Resolves raw wine entry fields (region, producer, classification) to canonical
 * forms using alias maps from the algorithm dataset tables.
 *
 * This resolver now uses alias-map lookups when those dataset tables are present
 * and falls back to conservative pass-through resolution when they are not.
 *
 * See docs/palate_profiles_design_decisions.md §12 for the canonical resolution spec.
 */

import type { WineType } from "@/types/wine";
import { WINE_TYPE_VALUES } from "@/types/wine";
import {
  lookupGrapeAlias,
  lookupProducerAlias,
  lookupRegionAlias,
  type ResolverSupabaseClient,
} from "@/server/algorithm/aliasLookup";

export type ResolverInput = {
  region: string | null;
  producer: string | null;
  classification: string | null;
  wine_type: WineType | null;
  country: string | null;
  varietal?: string | null;
};

export type ResolverOutput = {
  canonical_region: string | null;
  canonical_producer: string | null;
  canonical_classification: string | null;
  canonical_country: string | null;
  canonical_sub_region: string | null;
  canonical_varietal: string | null;
  resolution_confidence: number;
  /** Fallback level 1–6 per D11 hierarchy. Level 6 = below confidence threshold (no score shown). */
  fallback_level: number;
  region_alias_matched: boolean;
  producer_alias_matched: boolean;
  resolution_source: "stub" | "alias_map" | "exact";
};

function normalizeOptionalString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function deriveFallback({
  wineType,
  canonicalCountry,
  canonicalRegion,
  canonicalSubRegion,
  canonicalVarietal,
}: {
  wineType: WineType | null;
  canonicalCountry: string | null;
  canonicalRegion: string | null;
  canonicalSubRegion: string | null;
  canonicalVarietal: string | null;
}) {
  if (!wineType) {
    return {
      fallback_level: 6,
      resolution_confidence: 0,
    };
  }

  if (canonicalSubRegion && canonicalVarietal) {
    return {
      fallback_level: 1,
      resolution_confidence: 0.95,
    };
  }

  if (canonicalSubRegion) {
    return {
      fallback_level: 2,
      resolution_confidence: 0.85,
    };
  }

  if (canonicalRegion && canonicalVarietal) {
    return {
      fallback_level: 3,
      resolution_confidence: 0.75,
    };
  }

  if (canonicalRegion) {
    return {
      fallback_level: 4,
      resolution_confidence: 0.6,
    };
  }

  if (canonicalCountry) {
    return {
      fallback_level: 5,
      resolution_confidence: 0.5,
    };
  }

  return {
    fallback_level: 6,
    resolution_confidence: 0,
  };
}

export function createStubResolution(input: ResolverInput): ResolverOutput {
  const canonical_region = normalizeOptionalString(input.region);
  const canonical_producer = normalizeOptionalString(input.producer);
  const canonical_classification = normalizeOptionalString(input.classification);
  const canonical_country = normalizeOptionalString(input.country);
  const canonical_varietal = normalizeOptionalString(input.varietal);
  const effectiveWineType =
    input.wine_type ??
    inferWineType({
      country: canonical_country,
      region: canonical_region,
      classification: canonical_classification,
    });
  const fallback = deriveFallback({
    wineType: effectiveWineType,
    canonicalCountry: canonical_country,
    canonicalRegion: canonical_region,
    canonicalSubRegion: null,
    canonicalVarietal: canonical_varietal,
  });

  return {
    canonical_region,
    canonical_producer,
    canonical_classification,
    canonical_country,
    canonical_sub_region: null,
    canonical_varietal,
    resolution_confidence: fallback.resolution_confidence,
    fallback_level: fallback.fallback_level,
    region_alias_matched: false,
    producer_alias_matched: false,
    resolution_source: "stub",
  };
}

export async function resolveEntryFields(
  supabase: ResolverSupabaseClient,
  input: ResolverInput
): Promise<ResolverOutput> {
  const stub = createStubResolution(input);
  const [regionMatch, producerMatch, grapeMatch] = await Promise.all([
    lookupRegionAlias(supabase, input.region),
    lookupProducerAlias(supabase, input.producer),
    lookupGrapeAlias(supabase, input.varietal),
  ]);

  const canonical_region = regionMatch?.canonical_region ?? stub.canonical_region;
  const canonical_sub_region = regionMatch?.canonical_sub_region ?? null;
  const canonical_country =
    regionMatch?.canonical_country ?? stub.canonical_country;
  const canonical_producer =
    producerMatch?.canonical_producer_name ?? stub.canonical_producer;
  const canonical_classification = stub.canonical_classification;
  const canonical_varietal = grapeMatch?.canonical_name ?? stub.canonical_varietal;
  const effectiveWineType =
    input.wine_type ??
    inferWineType({
      country: canonical_country,
      region: canonical_sub_region ?? canonical_region ?? input.region,
      classification: canonical_classification,
    });
  const fallback = deriveFallback({
    wineType: effectiveWineType,
    canonicalCountry: canonical_country,
    canonicalRegion: canonical_region,
    canonicalSubRegion: canonical_sub_region,
    canonicalVarietal: canonical_varietal,
  });
  const matchedAliasTypes = [
    regionMatch?.alias_type,
    producerMatch?.alias_type,
    grapeMatch?.alias_type,
  ].filter((value): value is string => typeof value === "string");

  return {
    canonical_region,
    canonical_producer,
    canonical_classification,
    canonical_country,
    canonical_sub_region,
    canonical_varietal,
    resolution_confidence: fallback.resolution_confidence,
    fallback_level: fallback.fallback_level,
    region_alias_matched: Boolean(regionMatch),
    producer_alias_matched: Boolean(producerMatch),
    resolution_source:
      matchedAliasTypes.length === 0
        ? "stub"
        : matchedAliasTypes.every((value) => value === "exact")
          ? "exact"
          : "alias_map",
  };
}

/**
 * Conservative wine type inference from structured fields.
 * Only returns a value when highly certain from well-known classifiers.
 * WS1 will enhance this with region/classification lookup tables.
 */
export function inferWineType(fields: {
  country?: string | null;
  region?: string | null;
  classification?: string | null;
}): WineType | null {
  const classLower = (fields.classification ?? "").toLowerCase();
  const regionLower = (fields.region ?? "").toLowerCase();

  if (
    classLower.includes("champagne") ||
    classLower.includes("prosecco") ||
    classLower.includes("cava") ||
    classLower.includes("cremant") ||
    regionLower.includes("champagne") ||
    regionLower.includes("prosecco")
  ) {
    return "sparkling";
  }
  if (
    classLower.includes("sauternes") ||
    classLower.includes("tokaji") ||
    classLower.includes("port") ||
    classLower.includes("vin santo") ||
    classLower.includes("ice wine") ||
    classLower.includes("eiswein")
  ) {
    return "sweet";
  }
  if (
    classLower.includes("amarone") ||
    classLower.includes("barolo") ||
    classLower.includes("brunello") ||
    regionLower.includes("barolo")
  ) {
    return "red";
  }
  if (
    classLower.includes("chablis") ||
    classLower.includes("muscadet") ||
    classLower.includes("sancerre") ||
    regionLower.includes("chablis")
  ) {
    return "white";
  }
  if (classLower.includes("ramato") || classLower.includes("orange wine")) {
    return "orange";
  }

  return null;
}

/**
 * Type guard: checks if a raw string value is a valid WineType enum member.
 */
export function isValidWineType(value: string | null | undefined): value is WineType {
  return typeof value === "string" && (WINE_TYPE_VALUES as readonly string[]).includes(value);
}
