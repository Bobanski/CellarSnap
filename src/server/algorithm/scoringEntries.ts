import { fetchPrimaryGrapesByEntryId } from "@/lib/primaryGrapes";
import { executeSelectWithFallback } from "@/server/db/compat";
import { WINE_TYPE_VALUES, type WineType } from "@/types/wine";
import type { LoadedEntryForScoring, RequestSupabaseClient } from "@/app/api/algorithm/score/handler";

// quality_tier is an assembly input derived from classification, not a DB column.
const attempts = [
  { fields: "id, user_id, wine_type, canonical_region, canonical_sub_region, canonical_country, producer, classification, vintage",
    canonical: true, missing: ["wine_type", "canonical_region", "canonical_sub_region", "canonical_country"] },
  { fields: "id, user_id, wine_type, producer, classification, vintage, region, appellation, country",
    canonical: false, missing: ["wine_type"] },
  { fields: "id, user_id, producer, classification, vintage, region, appellation, country",
    canonical: false, missing: [] },
];
type Row = { id: string; user_id: string; wine_type?: WineType | null; vintage: string | null;
  producer: string | null; classification: string | null; canonical_region?: string | null;
  canonical_sub_region?: string | null; canonical_country?: string | null; region?: string | null;
  appellation?: string | null; country?: string | null; };

export async function defaultLoadEntriesForScoring(
  supabase: RequestSupabaseClient, userId: string, entryIds: string[]
): Promise<Map<string, LoadedEntryForScoring>> {
  const ids = [...new Set(entryIds)];
  if (ids.length > 50) throw new Error("Score entry batch exceeds 50 entries");
  if (!ids.length) return new Map();
  const result = await executeSelectWithFallback({
    attempts, getFallbackColumns: attempt => attempt.missing,
    attempt: async attempt => {
      const response = await supabase.from("wine_entries_with_ratings").select(attempt.fields)
        .eq("user_id", userId).in("id", ids);
      return { data: response.data, error: response.error };
    },
  });
  if (result.error) throw new Error("Unable to load score entries.");
  // Hydrate only rows returned by the owner-filtered query. A missing/foreign ID
  // remains an item failure and never reaches the grape read or reference loader.
  const rows = ((result.data ?? []) as unknown as Row[]).filter(row => row.user_id === userId && ids.includes(row.id));
  const grapes = await fetchPrimaryGrapesByEntryId(supabase, rows.map(row => row.id), { strict: true });
  return new Map(rows.map(row => [row.id, {
    wine_type: WINE_TYPE_VALUES.includes(row.wine_type as WineType) ? row.wine_type! : null,
    canonical_region: (result.usedAttempt?.canonical ? row.canonical_region : row.region) ?? null,
    canonical_sub_region: (result.usedAttempt?.canonical ? row.canonical_sub_region : row.appellation) ?? null,
    canonical_country: (result.usedAttempt?.canonical ? row.canonical_country : row.country) ?? null,
    primary_grapes: grapes.get(row.id)?.map(grape => grape.name).join(", ") ?? null,
    vintage: row.vintage ? Number.parseInt(row.vintage, 10) || null : null,
    producer: row.producer ?? null, classification: row.classification ?? null, quality_tier: row.classification ?? null,
  }]));
}
export async function defaultLoadEntryForScoring(supabase: RequestSupabaseClient, userId: string, entryId: string) {
  return (await defaultLoadEntriesForScoring(supabase, userId, [entryId])).get(entryId) ?? null;
}
