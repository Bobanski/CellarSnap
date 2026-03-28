/**
 * Resolves and materializes the full 16-axis sensory profile for a wine entry.
 *
 * Calls assembleWineProfile() (base_profiles + modifiers) and writes the result
 * to wine_entries.assembled_sensory so downstream consumers (palate page, match
 * scoring, pocket somm) can read it directly without recomputing.
 *
 * Safe to call on any entry — gracefully no-ops if the entry lacks enough data
 * for profile assembly (e.g., no wine_type).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  assembleWineProfile,
  batchPrefetchProfileData,
  createSupabaseProfileAssemblyDataSource,
  createPreFetchedProfileDataSource,
  assembleWineProfileWithDataSource,
} from "@/server/algorithm/profileAssembly";
import type { AssembleWineProfileInput } from "@/server/algorithm/types";
import { WINE_TYPE_VALUES, type WineType } from "@/types/wine";

function isWineType(value: string | null | undefined): value is WineType {
  return WINE_TYPE_VALUES.includes(value as WineType);
}

type EntryForResolution = {
  id: string;
  wine_type: string | null;
  canonical_region: string | null;
  canonical_sub_region: string | null;
  canonical_country: string | null;
  region: string | null;
  appellation: string | null;
  country: string | null;
  vintage: string | null;
  producer: string | null;
  classification: string | null;
  primary_grapes?: string | null;
};

function buildAssemblyInput(entry: EntryForResolution): AssembleWineProfileInput | null {
  if (!isWineType(entry.wine_type)) return null;

  return {
    wine_type: entry.wine_type,
    canonical_region: entry.canonical_region ?? entry.region ?? null,
    canonical_sub_region: entry.canonical_sub_region ?? entry.appellation ?? null,
    canonical_country: entry.canonical_country ?? entry.country ?? null,
    primary_grapes: entry.primary_grapes ?? null,
    vintage: entry.vintage ? Number.parseInt(entry.vintage, 10) || null : null,
    producer: entry.producer ?? null,
    classification: entry.classification ?? null,
    quality_tier: entry.classification ?? null,
  };
}

/**
 * Resolve and store the sensory profile for a single entry.
 * Called after entry create/update.
 */
export async function resolveEntrySensoryProfile(
  supabase: SupabaseClient,
  entryId: string,
  entry: EntryForResolution
): Promise<void> {
  const input = buildAssemblyInput(entry);
  if (!input) return;

  try {
    const adminSupabase = createSupabaseAdminClient();
    const profile = await assembleWineProfile(input, adminSupabase);

    await supabase
      .from("wine_entries")
      .update({
        assembled_sensory: profile.sensory,
        sensory_resolved_at: new Date().toISOString(),
      })
      .eq("id", entryId);
  } catch {
    // Swallow assembly failures — entry saves should never fail because of this.
    // The entry will just have NULL assembled_sensory until next resolution attempt.
  }
}

/**
 * Bulk-resolve sensory profiles for multiple entries.
 * Used for backfill and periodic refresh.
 */
export async function bulkResolveEntrySensoryProfiles(
  supabase: SupabaseClient,
  entries: Array<EntryForResolution & { id: string }>
): Promise<{ resolved: number; failed: number }> {
  const adminSupabase = createSupabaseAdminClient();
  let resolved = 0;
  let failed = 0;

  // Group by wine_type for batch prefetch
  const byType = new Map<WineType, typeof entries>();
  for (const entry of entries) {
    if (!isWineType(entry.wine_type)) {
      failed++;
      continue;
    }
    const group = byType.get(entry.wine_type) ?? [];
    group.push(entry);
    byType.set(entry.wine_type, group);
  }

  for (const [wineType, typeEntries] of byType) {
    const vintages = typeEntries
      .map((e) => (e.vintage ? Number.parseInt(e.vintage, 10) || null : null))
      .filter((v): v is number => v !== null);

    try {
      const dataSource = createSupabaseProfileAssemblyDataSource(adminSupabase);
      const prefetched = await batchPrefetchProfileData(dataSource, [wineType], vintages);
      const prefetchedSource = createPreFetchedProfileDataSource(prefetched);

      for (const entry of typeEntries) {
        const input = buildAssemblyInput(entry);
        if (!input) {
          failed++;
          continue;
        }

        try {
          const profile = await assembleWineProfileWithDataSource(input, prefetchedSource);
          await supabase
            .from("wine_entries")
            .update({
              assembled_sensory: profile.sensory,
              sensory_resolved_at: new Date().toISOString(),
            })
            .eq("id", entry.id);
          resolved++;
        } catch {
          failed++;
        }
      }
    } catch {
      failed += typeEntries.length;
    }
  }

  return { resolved, failed };
}
