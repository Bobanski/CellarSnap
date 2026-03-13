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
  country: string | null;
};

export type ResolverOutput = {
  canonical_region: string | null;
  canonical_producer: string | null;
  canonical_classification: string | null;
  resolution_confidence: number;
  /** Fallback level 1–6 per D11 hierarchy. Level 6 = below confidence threshold (no score shown). */
  fallback_level: number;
  region_alias_matched: boolean;
  producer_alias_matched: boolean;
  resolution_source: "stub" | "alias_map" | "exact";
};

/**
 * Resolves raw wine fields to canonical identities.
 *
 * Fallback level is derived from input strength per the D11 hierarchy:
 *   Level 4: region × wine_type          (confidence 0.6 — scoreable)
 *   Level 5: country × wine_type         (confidence 0.5 — minimum scoreable per D8)
 *   Level 6: wine_type only / no info    (confidence 0   — below threshold, no score shown)
 *
 * WS1 will unlock levels 1–3 (sub_region × varietal × wine_type etc.) via alias lookups.
 */
export function resolveEntryFields(input: ResolverInput): ResolverOutput {
  let fallback_level: number;
  let resolution_confidence: number;

  if (input.wine_type !== null && input.region !== null) {
    // Level 4: region × wine_type
    fallback_level = 4;
    resolution_confidence = 0.6;
  } else if (input.wine_type !== null && input.country !== null) {
    // Level 5: country × wine_type — minimum scoreable combination per D8
    fallback_level = 5;
    resolution_confidence = 0.5;
  } else {
    // Level 6: wine_type only, or no wine_type — below confidence threshold
    fallback_level = 6;
    resolution_confidence = 0;
  }

  return {
    canonical_region: input.region,
    canonical_producer: input.producer,
    canonical_classification: input.classification,
    resolution_confidence,
    fallback_level,
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
