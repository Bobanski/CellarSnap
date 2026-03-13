/**
 * WS2: Entry Normalization — Canonical Resolution Service
 *
 * Resolves raw wine entry fields (region, producer, classification) to canonical
 * forms using alias maps from the algorithm dataset tables.
 *
 * Current state: stub pass-through until WS1 populates the dataset tables.
 * WS1 TODO: Replace stub body with alias lookups against:
 *   - region_aliases table (874 rows)
 *   - producer_aliases table (1,720 rows)
 *   - grape_synonyms table (56 rows)
 *
 * See docs/palate_profiles_design_decisions.md §12 for the canonical resolution spec.
 */

import type { WineType } from "@/types/wine";
import { WINE_TYPE_VALUES } from "@/types/wine";

export type ResolverInput = {
  region: string | null;
  producer: string | null;
  classification: string | null;
  wine_type: WineType | null;
};

export type ResolverOutput = {
  canonical_region: string | null;
  canonical_producer: string | null;
  canonical_classification: string | null;
  resolution_confidence: number;
  /** Fallback level 1–6 per D11 hierarchy. Level 6 = wine_type only (below confidence threshold). */
  fallback_level: number;
  region_alias_matched: boolean;
  producer_alias_matched: boolean;
  resolution_source: "stub" | "alias_map" | "exact";
};

/**
 * Resolves raw wine fields to canonical identities.
 * Stub implementation — returns raw values unchanged.
 * WS1 will replace this with real alias-map lookups.
 */
export function resolveEntryFields(input: ResolverInput): ResolverOutput {
  // Stub: pass-through until WS1 alias tables are populated.
  // Minimum info required to score: (wine_type + region) or (region + producer) per D8.
  const hasMinimumInfo =
    (input.wine_type !== null && input.region !== null) ||
    (input.region !== null && input.producer !== null);

  return {
    canonical_region: input.region,
    canonical_producer: input.producer,
    canonical_classification: input.classification,
    resolution_confidence: hasMinimumInfo ? 0.5 : 0,
    fallback_level: 6, // wine_type only — below confidence threshold per D11
    region_alias_matched: false,
    producer_alias_matched: false,
    resolution_source: "stub",
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

  if (classLower.includes("champagne") || regionLower.includes("champagne")) {
    return "sparkling";
  }
  if (classLower.includes("sauternes") || classLower.includes("tokaji")) {
    return "sweet";
  }

  return null;
}

/**
 * Type guard: checks if a raw string value is a valid WineType enum member.
 */
export function isValidWineType(value: string | null | undefined): value is WineType {
  return typeof value === "string" && (WINE_TYPE_VALUES as readonly string[]).includes(value);
}
