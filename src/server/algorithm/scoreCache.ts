import type { AlgorithmScoreResponse } from "@/lib/algorithm/api";
import {
  isAnyMissingDbColumnError,
  isMissingDbTableError,
  type SupabaseErrorLike,
} from "@/lib/supabase/errors";

type CacheClient = {
  from?: (table: string) => unknown;
};

type CacheSelectBuilder = {
  eq: (column: string, value: string) => CacheSelectBuilder;
  in: (column: string, values: string[]) => CacheSelectBuilder;
  gte: (column: string, value: string) => Promise<{
    data: unknown;
    error: SupabaseErrorLike | null;
  }>;
};

type CacheTableApi = {
  select: (columns: string) => CacheSelectBuilder;
  delete: () => {
    eq: (column: string, value: string) => Promise<{ error: SupabaseErrorLike | null }>;
  };
  upsert: (
    values: Record<string, unknown>,
    options: { onConflict: string }
  ) => Promise<{ error: SupabaseErrorLike | null }>;
};

type CachedScoreRow = {
  wine_entry_id: string;
  match_score: number;
  match_band: AlgorithmScoreResponse["band"];
  confidence: number | null;
  display_score: boolean;
  axis_breakdown: AlgorithmScoreResponse["axis_contributions"];
  effective_profile: AlgorithmScoreResponse["effective_profile"];
  modifiers_applied: AlgorithmScoreResponse["modifiers_applied"];
  preference_event_count: number | null;
};

const CACHE_MAX_AGE_HOURS = 6;

function isCacheUnavailable(error: SupabaseErrorLike) {
  return (
    isMissingDbTableError(error, "wine_entry_scores") ||
    isAnyMissingDbColumnError(error)
  );
}

function getFreshCutoffIso() {
  return new Date(Date.now() - CACHE_MAX_AGE_HOURS * 60 * 60 * 1000).toISOString();
}

function toAlgorithmScoreResponse(row: CachedScoreRow): AlgorithmScoreResponse {
  return {
    score: row.match_score,
    band: row.match_band,
    confidence: row.confidence ?? 0,
    balance_factor: 0,
    age_factor: 1.0,
    enjoyment_factor: 1.0,
    pre_balance_score: 0,
    effective_profile: row.effective_profile,
    axis_contributions: row.axis_breakdown,
    modifiers_applied: row.modifiers_applied ?? [],
    display_score: row.display_score,
    confidence_warning: row.display_score
      ? null
      : "Confidence is below the display threshold for this score.",
    preference_event_count: row.preference_event_count ?? 0,
  };
}

function normalizeCachedScoreRows(data: unknown): CachedScoreRow[] {
  if (Array.isArray(data)) {
    return data as CachedScoreRow[];
  }

  if (data && typeof data === "object" && "wine_entry_id" in data) {
    return [data as CachedScoreRow];
  }

  return [];
}

export async function readCachedEntryScore(
  supabase: CacheClient | null | undefined,
  userId: string,
  entryId: string
) {
  if (!supabase?.from) {
    return null;
  }

  const table = supabase.from("wine_entry_scores") as CacheTableApi;
  const response = await table
    .select(
      "wine_entry_id, match_score, match_band, confidence, display_score, axis_breakdown, effective_profile, modifiers_applied, preference_event_count"
    )
    .eq("wine_entry_id", entryId)
    .eq("user_id", userId)
    .gte("computed_at", getFreshCutoffIso());

  if (response.error) {
    if (isCacheUnavailable(response.error)) {
      return null;
    }
    throw new Error(response.error.message);
  }

  const row = normalizeCachedScoreRows(response.data)[0];
  return row ? toAlgorithmScoreResponse(row) : null;
}

export async function readCachedEntryScores(
  supabase: CacheClient | null | undefined,
  userId: string,
  entryIds: string[]
) {
  const uniqueEntryIds = Array.from(new Set(entryIds.filter(Boolean)));
  if (!supabase?.from || uniqueEntryIds.length === 0) {
    return new Map<string, AlgorithmScoreResponse>();
  }

  const table = supabase.from("wine_entry_scores") as CacheTableApi;
  const response = await table
    .select(
      "wine_entry_id, match_score, match_band, confidence, display_score, axis_breakdown, effective_profile, modifiers_applied, preference_event_count"
    )
    .in("wine_entry_id", uniqueEntryIds)
    .eq("user_id", userId)
    .gte("computed_at", getFreshCutoffIso());

  if (response.error) {
    if (isCacheUnavailable(response.error)) {
      return new Map<string, AlgorithmScoreResponse>();
    }
    throw new Error(response.error.message);
  }

  return new Map(
    normalizeCachedScoreRows(response.data).map((row) => [
      row.wine_entry_id,
      toAlgorithmScoreResponse(row),
    ])
  );
}

export async function writeCachedEntryScore(
  supabase: CacheClient | null | undefined,
  userId: string,
  entryId: string,
  payload: AlgorithmScoreResponse
) {
  if (!supabase?.from) {
    return;
  }

  const table = supabase.from("wine_entry_scores") as CacheTableApi;
  const response = await table.upsert(
    {
      wine_entry_id: entryId,
      user_id: userId,
      match_score: payload.score,
      match_band: payload.band,
      confidence: payload.confidence,
      display_score: payload.display_score,
      axis_breakdown: payload.axis_contributions,
      effective_profile: payload.effective_profile,
      modifiers_applied: payload.modifiers_applied,
      preference_event_count: payload.preference_event_count,
      computed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "wine_entry_id,user_id",
    }
  );

  if (response.error && !isCacheUnavailable(response.error)) {
    throw new Error(response.error.message);
  }
}

export async function invalidateUserScoreCache(
  supabase: CacheClient | null | undefined,
  userId: string
) {
  if (!supabase?.from) {
    return;
  }

  const table = supabase.from("wine_entry_scores") as CacheTableApi;
  const response = await table.delete().eq("user_id", userId);

  if (response.error && !isCacheUnavailable(response.error)) {
    throw new Error(response.error.message);
  }
}
