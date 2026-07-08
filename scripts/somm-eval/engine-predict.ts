/**
 * Engine predictor bridge for the somm cold-start eval harness.
 *
 * Reuses the real algorithm modules (no reimplementation) to score a wine
 * pair against a taster profile, exactly as the app would for a cold-start
 * user: survey-seeded preference vector + assembled wine profile + match score.
 *
 * Run via the harness (spawned by run-eval.mjs), or directly:
 *   npx tsx scripts/somm-eval/engine-predict.ts < input.json
 *
 * stdin:  { comparisons: [{ taster, wine_a, wine_b }] }   (shapes: README.md)
 * stdout: { results: [{ index, score_a, score_b, predicted, confidence_a, confidence_b }] }
 */

import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import {
  assembleWineProfile,
} from "@/server/algorithm/profileAssembly";
import {
  buildUserPreferenceVector,
  type PreferenceSourceEntry,
} from "@/server/algorithm/userPreferences";
import { computeMatchScore } from "@/server/algorithm/scoringEngine";
import type { TasteSurveyRow } from "@/server/algorithm/surveySeeding";
import type {
  AssembleWineProfileInput,
  EffectiveWineProfile,
} from "@/server/algorithm/types";
import type { WineType } from "@/types/wine";

// Score gaps below this are treated as a tie — the engine's sigmoid puts
// meaningful style differences well above a 2-point spread.
const TIE_MARGIN = 2;

type EvalWine = {
  producer: string | null;
  name: string | null;
  vintage: number | null;
  wine_type: string | null;
  region: string | null;
  sub_region: string | null;
  country: string | null;
  grapes: string | null;
  classification: string | null;
  price: number | null;
};

type EvalTaster = {
  taster_id: string;
  survey: TasteSurveyRow | null;
  logged_wines: Array<{
    rating: number | null;
    notes: string | null;
    wine_type: string | null;
    region: string | null;
    country: string | null;
    grapes: string | null;
    classification: string | null;
  }> | null;
};

type EvalComparison = { taster: EvalTaster; wine_a: EvalWine; wine_b: EvalWine };

function normalizeWineType(value: string | null | undefined): WineType {
  const v = (value ?? "").toLowerCase();
  if (["red", "white", "sparkling", "rose", "sweet", "orange"].includes(v)) {
    return v as WineType;
  }
  if (v === "rosé") return "rose";
  if (v === "dessert") return "sweet";
  return "red";
}

function toProfileInput(wine: EvalWine): AssembleWineProfileInput {
  return {
    canonical_region: wine.region,
    canonical_sub_region: wine.sub_region,
    canonical_country: wine.country,
    wine_type: normalizeWineType(wine.wine_type),
    primary_grapes: wine.grapes,
    vintage: wine.vintage,
    producer: wine.producer,
    classification: wine.classification,
    quality_tier: wine.classification,
  };
}

function toPreferenceEntries(taster: EvalTaster): PreferenceSourceEntry[] {
  return (taster.logged_wines ?? []).map((w) => ({
    rating: w.rating,
    advanced_notes: null,
    notes: w.notes,
    wine_type: normalizeWineType(w.wine_type),
    region: w.region,
    country: w.country,
    primary_grapes: w.grapes,
    classification: w.classification,
  }));
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (run-eval.mjs loads them from .env.local)"
    );
  }
  const supabase = createClient(url, key);

  const { comparisons } = JSON.parse(await readStdin()) as {
    comparisons: EvalComparison[];
  };

  const profileCache = new Map<string, Promise<EffectiveWineProfile>>();
  const getProfile = (wine: EvalWine) => {
    const input = toProfileInput(wine);
    const cacheKey = JSON.stringify(input);
    let cached = profileCache.get(cacheKey);
    if (!cached) {
      cached = assembleWineProfile(input, supabase);
      profileCache.set(cacheKey, cached);
    }
    return cached;
  };

  const results = [];
  for (let index = 0; index < comparisons.length; index++) {
    const { taster, wine_a, wine_b } = comparisons[index];
    const entries = toPreferenceEntries(taster);

    const scoreWine = async (wine: EvalWine) => {
      const wineType = normalizeWineType(wine.wine_type);
      const vector = buildUserPreferenceVector(entries, wineType, taster.survey);
      const profile = await getProfile(wine);
      return computeMatchScore(profile, vector);
    };

    try {
      const [matchA, matchB] = await Promise.all([
        scoreWine(wine_a),
        scoreWine(wine_b),
      ]);
      const diff = matchA.score - matchB.score;
      results.push({
        index,
        score_a: matchA.score,
        score_b: matchB.score,
        confidence_a: matchA.confidence,
        confidence_b: matchB.confidence,
        predicted:
          Math.abs(diff) < TIE_MARGIN ? "tie" : diff > 0 ? "a" : "b",
      });
    } catch (error) {
      console.error(`comparison ${index} failed:`, error);
      results.push({ index, predicted: null, error: String(error) });
    }
  }

  process.stdout.write(JSON.stringify({ results }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
