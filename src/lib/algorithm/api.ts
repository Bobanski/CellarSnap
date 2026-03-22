import type { EffectiveWineProfile, MatchBand, SensoryAxis } from "@/server/algorithm/types";
import type { WineType } from "@/types/wine";

export type AlgorithmScoreResponse = {
  score: number;
  band: MatchBand;
  confidence: number;
  balance_factor: number;
  age_factor: number;
  enjoyment_factor: number;
  pre_balance_score: number;
  effective_profile: EffectiveWineProfile;
  axis_contributions: Record<
    SensoryAxis,
    {
      user_value: number | null;
      wine_value: number;
      weight: number;
      contribution: number;
    }
  >;
  modifiers_applied: string[];
  display_score: boolean;
  confidence_warning: string | null;
  preference_event_count: number;
};

export type AlgorithmBatchRequestItem = {
  request_id?: string;
  entry_id?: string;
  wine_type?: WineType;
  canonical_region?: string | null;
  canonical_sub_region?: string | null;
  canonical_country?: string | null;
  primary_grapes?: string | null;
  vintage?: number | null;
  producer?: string | null;
  classification?: string | null;
  quality_tier?: string | null;
};

export type AlgorithmBatchResult = {
  request_id: string | null;
  entry_id: string | null;
  ok: boolean;
  data: AlgorithmScoreResponse | null;
  error: string | null;
};

export function canDisplayAlgorithmMatch(result: AlgorithmScoreResponse | null | undefined) {
  return Boolean(result?.display_score && (result.preference_event_count ?? 0) >= 5);
}

export async function fetchAlgorithmScore(
  payload: Omit<AlgorithmBatchRequestItem, "request_id">
) {
  const response = await fetch("/api/algorithm/score", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Unable to score this wine right now.");
  }

  return (await response.json()) as AlgorithmScoreResponse;
}

export async function fetchAlgorithmScoreBatch(items: AlgorithmBatchRequestItem[]) {
  const response = await fetch("/api/algorithm/score/batch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ items }),
  });

  if (!response.ok) {
    throw new Error("Unable to load match scores right now.");
  }

  const payload = (await response.json()) as { results?: AlgorithmBatchResult[] };
  return payload.results ?? [];
}
