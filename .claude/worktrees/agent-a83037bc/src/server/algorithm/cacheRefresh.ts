import { fetchPrimaryGrapesByEntryId } from "@/lib/primaryGrapes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assembleWineProfile } from "@/server/algorithm/profileAssembly";
import { computeMatchScore } from "@/server/algorithm/scoringEngine";
import type {
  AssembleWineProfileInput,
  EffectiveWineProfile,
} from "@/server/algorithm/types";
import {
  defaultLoadUserPreferenceEntries,
  buildAlgorithmScoreResponse,
  type RequestSupabaseClient,
} from "@/app/api/algorithm/score/handler";
import { writeCachedEntryScore } from "@/server/algorithm/scoreCache";
import { buildUserPreferenceVector } from "@/server/algorithm/userPreferences";
import { executeSelectWithFallback } from "@/server/db/compat";
import { WINE_TYPE_VALUES, type WineType } from "@/types/wine";

type RecentScoreableEntry = {
  id: string;
  wine_type: WineType | null;
  canonical_region: string | null;
  canonical_sub_region: string | null;
  canonical_country: string | null;
  producer: string | null;
  classification: string | null;
  quality_tier: string | null;
  vintage: string | null;
};

type RefreshDependencies = {
  loadUserPreferenceEntries: typeof defaultLoadUserPreferenceEntries;
  fetchPrimaryGrapesByEntryId: typeof fetchPrimaryGrapesByEntryId;
  buildUserPreferenceVector: typeof buildUserPreferenceVector;
  assembleProfile: (input: AssembleWineProfileInput) => Promise<EffectiveWineProfile>;
  computeMatchScore: typeof computeMatchScore;
  writeCachedEntryScore: typeof writeCachedEntryScore;
};

const RECENT_SCORE_REFRESH_LIMIT = 6;

function isWineType(value: string | null | undefined): value is WineType {
  return WINE_TYPE_VALUES.includes(value as WineType);
}

async function loadRecentScoreableEntries(
  supabase: RequestSupabaseClient,
  userId: string
) {
  const result = await executeSelectWithFallback({
    attempts: [
      {
        fields:
          "id, wine_type, canonical_region, canonical_sub_region, canonical_country, producer, classification, quality_tier, vintage",
        missingColumns: [
          "wine_type",
          "canonical_region",
          "canonical_sub_region",
          "canonical_country",
          "quality_tier",
        ] as const,
      },
      {
        fields: "id, wine_type, region, appellation, country, producer, classification, vintage",
        missingColumns: [] as const,
      },
    ],
    getFallbackColumns: (attempt) => attempt.missingColumns,
    attempt: async (attempt) => {
      const response = await supabase
        .from("wine_entries")
        .select(attempt.fields)
        .eq("user_id", userId)
        .order("consumed_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(RECENT_SCORE_REFRESH_LIMIT * 2);

      return {
        data: response.data,
        error: response.error,
      };
    },
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  const rows = (((result.data ?? []) as unknown) as Record<string, unknown>[])
    .map<RecentScoreableEntry>((row) => ({
      id: row.id as string,
      wine_type: isWineType((row.wine_type as string | null | undefined) ?? null)
        ? (row.wine_type as WineType)
        : null,
      canonical_region:
        (row.canonical_region as string | null | undefined) ??
        (row.region as string | null | undefined) ??
        null,
      canonical_sub_region:
        (row.canonical_sub_region as string | null | undefined) ??
        (row.appellation as string | null | undefined) ??
        null,
      canonical_country:
        (row.canonical_country as string | null | undefined) ??
        (row.country as string | null | undefined) ??
        null,
      producer: (row.producer as string | null | undefined) ?? null,
      classification: (row.classification as string | null | undefined) ?? null,
      quality_tier:
        (row.quality_tier as string | null | undefined) ??
        (row.classification as string | null | undefined) ??
        null,
      vintage: (row.vintage as string | null | undefined) ?? null,
    }))
    .filter((entry) => Boolean(entry.wine_type))
    .slice(0, RECENT_SCORE_REFRESH_LIMIT);

  return rows;
}

export async function refreshRecentUserScoreCache(
  supabase: RequestSupabaseClient,
  userId: string,
  dependencies: Partial<RefreshDependencies> = {}
) {
  const resolvedDependencies: RefreshDependencies = {
    loadUserPreferenceEntries: defaultLoadUserPreferenceEntries,
    fetchPrimaryGrapesByEntryId,
    buildUserPreferenceVector,
    async assembleProfile(input) {
      const referenceSupabase = createSupabaseAdminClient();
      return assembleWineProfile(input, referenceSupabase);
    },
    computeMatchScore,
    writeCachedEntryScore,
    ...dependencies,
  };

  const recentEntries = await loadRecentScoreableEntries(supabase, userId);
  if (recentEntries.length === 0) {
    return;
  }

  const preferenceEntries = await resolvedDependencies.loadUserPreferenceEntries(
    supabase,
    userId
  );
  const primaryGrapeMap = await resolvedDependencies.fetchPrimaryGrapesByEntryId(
    supabase,
    recentEntries.map((entry) => entry.id)
  );
  const preferenceCache = new Map<WineType, ReturnType<typeof buildUserPreferenceVector>>();

  for (const entry of recentEntries) {
    if (!entry.wine_type) {
      continue;
    }

    const primaryGrapes =
      primaryGrapeMap.get(entry.id)?.map((grape) => grape.name).join(", ") ?? null;
    const userPreference =
      preferenceCache.get(entry.wine_type) ??
      resolvedDependencies.buildUserPreferenceVector(
        preferenceEntries,
        entry.wine_type
      );

    if (!preferenceCache.has(entry.wine_type)) {
      preferenceCache.set(entry.wine_type, userPreference);
    }

    const effectiveProfile = await resolvedDependencies.assembleProfile(
      {
        wine_type: entry.wine_type,
        canonical_region: entry.canonical_region,
        canonical_sub_region: entry.canonical_sub_region,
        canonical_country: entry.canonical_country,
        primary_grapes: primaryGrapes,
        vintage: entry.vintage ? Number.parseInt(entry.vintage, 10) || null : null,
        producer: entry.producer,
        classification: entry.classification,
        quality_tier: entry.quality_tier,
      }
    );
    const match = resolvedDependencies.computeMatchScore(
      effectiveProfile,
      userPreference
    );

    await resolvedDependencies.writeCachedEntryScore(
      supabase,
      userId,
      entry.id,
      buildAlgorithmScoreResponse({
        effectiveProfile,
        match,
        preferenceEventCount: userPreference.event_count,
      })
    );
  }
}
