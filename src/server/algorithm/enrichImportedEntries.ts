/**
 * Post-import enrichment for bulk-imported wine entries.
 *
 * Runs canonical field resolution, sensory profile assembly, and
 * wine type inference on imported entries. This is the same pipeline
 * that runs on individual entry creation, adapted for batch processing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { persistEntryResolution } from "@/server/algorithm/persistEntryResolution";
import { bulkResolveEntrySensoryProfiles } from "@/server/algorithm/resolveEntrySensory";

type ImportedEntry = {
  id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  classification: string | null;
  wine_type: string | null;
  primary_grapes?: string | null;
};

// ─── Wine type inference ─────────────────────────────────────

// Grapes that can be multiple wine types — flag for user input
const AMBIGUOUS_GRAPES = new Set([
  "pinot noir",
  "pinot meunier",
  "chardonnay",
  "chenin blanc",
  "riesling",
  "muscat",
  "moscato",
  "gamay",
  "malbec",
  "shiraz",
  "syrah",
  "grenache",
  "macabeo",
  "xarel-lo",
  "parellada",
  "glera",
]);

// Unambiguous grape → wine type mapping
const GRAPE_TO_WINE_TYPE: Record<string, string> = {
  "cabernet sauvignon": "red",
  "cabernet franc": "red",
  "merlot": "red",
  "nebbiolo": "red",
  "sangiovese": "red",
  "tempranillo": "red",
  "zinfandel": "red",
  "mourvedre": "red",
  "monastrell": "red",
  "carignan": "red",
  "petit verdot": "red",
  "tannat": "red",
  "aglianico": "red",
  "barbera": "red",
  "dolcetto": "red",
  "nero d'avola": "red",
  "primitivo": "red",
  "touriga nacional": "red",
  "pinotage": "red",
  "corvina": "red",
  "nerello mascalese": "red",
  "sauvignon blanc": "white",
  "pinot grigio": "white",
  "pinot gris": "white",
  "pinot blanc": "white",
  "viognier": "white",
  "gewurztraminer": "white",
  "gruner veltliner": "white",
  "albarino": "white",
  "vermentino": "white",
  "fiano": "white",
  "greco": "white",
  "arneis": "white",
  "cortese": "white",
  "trebbiano": "white",
  "semillon": "white",
  "marsanne": "white",
  "roussanne": "white",
  "melon de bourgogne": "white",
  "verdejo": "white",
  "furmint": "white",
  "assyrtiko": "white",
  "garganega": "white",
  "carricante": "white",
  "red blend": "red",
  "white blend": "white",
};

function inferWineType(
  grape: string | null | undefined,
  wineName: string | null | undefined
): { type: string | null; ambiguous: boolean } {
  // Check wine name for sparkling keywords first
  const name = (wineName ?? "").toLowerCase();
  if (/\b(champagne|prosecco|cava|crémant|cremant|franciacorta|pet[- ]?nat|sekt|spumante|sparkling)\b/.test(name)) {
    return { type: "sparkling", ambiguous: false };
  }
  if (/\b(rosé|rose)\b/i.test(name)) {
    return { type: "rose", ambiguous: false };
  }
  if (/\b(port|sherry|sauternes|tokaji|ice wine|dessert)\b/i.test(name)) {
    return { type: "sweet", ambiguous: false };
  }

  if (!grape) return { type: null, ambiguous: false };

  const lowerGrape = grape.toLowerCase().trim();

  if (AMBIGUOUS_GRAPES.has(lowerGrape)) {
    return { type: null, ambiguous: true };
  }

  const mapped = GRAPE_TO_WINE_TYPE[lowerGrape];
  if (mapped) {
    return { type: mapped, ambiguous: false };
  }

  return { type: null, ambiguous: false };
}

// ─── Main enrichment function ────────────────────────────────

export type EnrichmentResult = {
  resolved: number;
  sensoryAssembled: number;
  wineTypesInferred: number;
  ambiguousEntries: { id: string; wine_name: string | null; grape: string | null }[];
  errors: string[];
};

export async function enrichImportedEntries(
  supabase: SupabaseClient,
  userId: string,
  entries: ImportedEntry[]
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    resolved: 0,
    sensoryAssembled: 0,
    wineTypesInferred: 0,
    ambiguousEntries: [],
    errors: [],
  };

  if (entries.length === 0) return result;

  // ── Step 1: Canonical field resolution ──────────────────────
  for (const entry of entries) {
    try {
      await persistEntryResolution({
        supabase,
        entryId: entry.id,
        userId,
        input: {
          region: entry.region,
          producer: entry.producer,
          classification: entry.classification,
          wine_type: entry.wine_type as "red" | "white" | "rose" | "sparkling" | "orange" | "sweet" | null,
          country: entry.country,
          primary_grapes: entry.primary_grapes
            ? entry.primary_grapes.split(",").map((g) => g.trim()).filter(Boolean)
            : [],
          varietal: entry.primary_grapes?.split(",")[0]?.trim() ?? null,
        },
      });
      result.resolved++;
    } catch {
      // Best-effort — continue with other entries
    }
  }

  // ── Step 2: Wine type inference ─────────────────────────────
  const entriesToInferType = entries.filter((e) => !e.wine_type);
  for (const entry of entriesToInferType) {
    const { type, ambiguous } = inferWineType(entry.primary_grapes, entry.wine_name);
    if (ambiguous) {
      result.ambiguousEntries.push({
        id: entry.id,
        wine_name: entry.wine_name,
        grape: entry.primary_grapes,
      });
    }
    if (type) {
      try {
        await supabase
          .from("wine_entries")
          .update({ wine_type: type })
          .eq("id", entry.id)
          .eq("user_id", userId);
        entry.wine_type = type;
        result.wineTypesInferred++;
      } catch {
        // Best-effort
      }
    }
  }

  // ── Step 3: Sensory profile assembly ────────────────────────
  // Re-read entries after resolution to get canonical fields
  const { data: refreshedEntries } = await supabase
    .from("wine_entries")
    .select("id, wine_type, canonical_region, canonical_sub_region, canonical_country, region, appellation, country, vintage, producer, classification")
    .in("id", entries.map((e) => e.id))
    .not("wine_type", "is", null);

  if (refreshedEntries && refreshedEntries.length > 0) {
    try {
      const sensoryResult = await bulkResolveEntrySensoryProfiles(
        supabase,
        refreshedEntries.map((e) => ({
          id: e.id,
          wine_type: e.wine_type,
          canonical_region: e.canonical_region ?? null,
          canonical_sub_region: e.canonical_sub_region ?? null,
          canonical_country: e.canonical_country ?? null,
          region: e.region ?? null,
          appellation: e.appellation ?? null,
          country: e.country ?? null,
          vintage: e.vintage ?? null,
          producer: e.producer ?? null,
          classification: e.classification ?? null,
        }))
      );
      result.sensoryAssembled = sensoryResult.resolved;
    } catch (err) {
      result.errors.push(`Sensory assembly: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  return result;
}
