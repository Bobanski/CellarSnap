/**
 * Palate distillation — the "master somm reads your history" step.
 *
 * An LLM (Claude) reads everything we know about a user's palate — logged
 * wines with ratings and notes, taste-survey answers, head-to-head comparison
 * feedback — through the lens of the sommelier manual, and compresses it into
 * a DistilledPalateProfile: per-wine-type 16-axis seed estimates (consumed by
 * the deterministic scoring engine exactly like survey seeds) plus a prose
 * narrative (consumed by user-facing explanations).
 *
 * Design contract (docs/somm-engine-v2-design.md):
 *  - Distillation is EXPENSIVE and runs OFF the request path (explicit route,
 *    background refresh). Scoring paths only ever READ the cached profile.
 *  - The seed fades with the same SURVEY_FADE_THRESHOLD mechanics as survey
 *    seeding — by the time a user has real data, the engine listens to it.
 *  - Held-out eval evidence for this architecture lives in scripts/somm-eval.
 */

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { anthropicToolCall, isAnthropicConfigured } from "@/server/anthropic/client";
import { SENSORY_AXES, type CategoricalPreferenceVector, type SensoryAxis, type SensoryVector } from "@/server/algorithm/types";
import type { PreferenceSeed } from "@/server/algorithm/userPreferences";
import type { TasteSurveyRow } from "@/server/algorithm/surveySeeding";
import { WINE_TYPE_VALUES, type WineType } from "@/types/wine";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PALATE_DISTILL_MODEL =
  process.env.SOMM_DISTILL_MODEL ?? "claude-sonnet-5";

/** Distillation is skipped when the signal is unchanged and the profile is
 *  younger than this — guards against hammering the API. */
const MIN_REDISTILL_INTERVAL_MS = 6 * 60 * 60 * 1000;

const MAX_ENTRIES_IN_PROMPT = 60;
const MAX_COMPARISONS_IN_PROMPT = 40;

// ── Profile shape (stored in palate_profiles.profile) ────────────────

export type DistilledWineTypeProfile = {
  wine_type: WineType;
  narrative: string;
  axis_seeds: Array<{ axis: SensoryAxis; value: number; confidence: number }>;
  favored_varietals: string[];
  favored_regions: string[];
  favored_countries: string[];
  avoided_styles: string[];
};

export type DistilledPalateProfile = {
  narrative: string;
  adventurousness: number;
  confidence: number;
  wine_types: DistilledWineTypeProfile[];
};

export type PalateProfileRecord = {
  profile: DistilledPalateProfile;
  signal_hash: string;
  model: string;
  updated_at: string;
};

// ── Tool schema ───────────────────────────────────────────────────────
// `reasoning` MUST stay first — see src/server/anthropic/client.ts.

const AXIS_SEED_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    axis: { type: "string", enum: [...SENSORY_AXES] },
    value: { type: "number", description: "Estimated preferred intensity on this axis, 1-5" },
    confidence: { type: "number", description: "0-1: how strongly the evidence supports this estimate" },
  },
  required: ["axis", "value", "confidence"],
};

const DISTILLATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    reasoning: {
      type: "string",
      description:
        "Work through the evidence pick by pick and wine by wine BEFORE summarizing. Isolate underlying characteristics (weight, structure, fruit profile) rather than repeating grape names.",
    },
    narrative: {
      type: "string",
      description:
        "2-3 warm, non-condescending sentences telling the user what their palate favors — shown in the app. No wine-snob gatekeeping.",
    },
    adventurousness: { type: "integer", description: "1-10 estimate from the evidence (default 5 if unclear)" },
    confidence: { type: "number", description: "0-1: overall evidence strength for this whole profile" },
    wine_types: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          wine_type: { type: "string", enum: [...WINE_TYPE_VALUES] },
          narrative: { type: "string", description: "One sentence on their style within this wine type" },
          axis_seeds: {
            type: "array",
            description: "Only axes the evidence actually supports — omit axes you'd be guessing on.",
            items: AXIS_SEED_SCHEMA,
          },
          favored_varietals: { type: "array", items: { type: "string" } },
          favored_regions: { type: "array", items: { type: "string" } },
          favored_countries: { type: "array", items: { type: "string" } },
          avoided_styles: { type: "array", items: { type: "string" } },
        },
        required: [
          "wine_type",
          "narrative",
          "axis_seeds",
          "favored_varietals",
          "favored_regions",
          "favored_countries",
          "avoided_styles",
        ],
      },
    },
  },
  required: ["reasoning", "narrative", "adventurousness", "confidence", "wine_types"],
};

// ── Sommelier manual loading ──────────────────────────────────────────

let cachedManual: string | null = null;

export async function loadSommelierManual(): Promise<string> {
  if (cachedManual) return cachedManual;
  const manualPath = path.join(process.cwd(), "docs/sommelier-manual.md");
  cachedManual = await fs.readFile(manualPath, "utf8");
  return cachedManual;
}

// ── Signal gathering ──────────────────────────────────────────────────

type DistillationEntryRow = {
  id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  wine_type: string | null;
  canonical_region: string | null;
  canonical_country: string | null;
  region: string | null;
  country: string | null;
  rating: number | null;
  notes: string | null;
  created_at: string | null;
};

type ComparisonRow = {
  response: "more" | "less" | "same_or_not_sure";
  created_at: string;
  new_entry: { wine_name: string | null; producer: string | null } | null;
  comparison_entry: { wine_name: string | null; producer: string | null } | null;
};

export type PalateSignal = {
  entries: DistillationEntryRow[];
  survey: TasteSurveyRow | null;
  comparisons: ComparisonRow[];
};

export function computeSignalHash(signal: PalateSignal): string {
  const fingerprint = {
    entryCount: signal.entries.length,
    latestEntry: signal.entries.reduce<string | null>(
      (latest, entry) =>
        entry.created_at && (!latest || entry.created_at > latest) ? entry.created_at : latest,
      null
    ),
    surveyCompletedAt: signal.survey?.completed_at ?? null,
    comparisonCount: signal.comparisons.length,
  };
  return createHash("sha256").update(JSON.stringify(fingerprint)).digest("hex");
}

export async function gatherPalateSignal(
  supabase: SupabaseClient,
  userId: string
): Promise<PalateSignal> {
  const [entriesResult, surveyResult, comparisonsResult] = await Promise.all([
    supabase
      .from("wine_entries")
      .select(
        // wine_entries has created_at but no updated_at column — recency of
        // logging is the right ordering signal anyway.
        "id, wine_name, producer, vintage, wine_type, canonical_region, canonical_country, region, country, rating, notes, created_at"
      )
      .eq("user_id", userId)
      .not("rating", "is", null)
      .order("created_at", { ascending: false })
      .limit(MAX_ENTRIES_IN_PROMPT),
    supabase
      .from("taste_survey_responses")
      .select(
        "wine_types, varietals, regions, countries, sensory_loves, sensory_avoids, budget_restaurant, budget_retail, adventurousness, free_text, completed_at"
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("entry_comparison_feedback")
      .select(
        "response, created_at, new_entry:wine_entries!entry_comparison_feedback_new_entry_id_fkey(wine_name, producer), comparison_entry:wine_entries!entry_comparison_feedback_comparison_entry_id_fkey(wine_name, producer)"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_COMPARISONS_IN_PROMPT),
  ]);

  if (entriesResult.error) throw new Error(entriesResult.error.message);

  return {
    entries: (entriesResult.data ?? []) as DistillationEntryRow[],
    survey: (surveyResult.data as TasteSurveyRow | null) ?? null,
    // Comparison feedback is a newer table — tolerate its absence.
    comparisons: comparisonsResult.error
      ? []
      : ((comparisonsResult.data ?? []) as unknown as ComparisonRow[]),
  };
}

function describeSignal(signal: PalateSignal): string {
  const lines: string[] = [];

  if (signal.survey) {
    lines.push(`Taste survey: ${JSON.stringify(signal.survey)}`, "");
  }

  if (signal.entries.length > 0) {
    lines.push("Logged wines (rating out of 5, most recent first):");
    for (const entry of signal.entries) {
      const facts = [
        entry.producer,
        entry.wine_name,
        entry.vintage,
        entry.wine_type,
        entry.canonical_region ?? entry.region,
        entry.canonical_country ?? entry.country,
      ]
        .filter(Boolean)
        .join(", ");
      lines.push(`- ${entry.rating}★ ${facts}${entry.notes ? ` — "${entry.notes}"` : ""}`);
    }
  } else {
    lines.push("Logged wines: none.");
  }

  if (signal.comparisons.length > 0) {
    lines.push("", "Head-to-head comparison feedback (newer wine vs. a previous one):");
    for (const row of signal.comparisons) {
      const name = (e: ComparisonRow["new_entry"]) =>
        [e?.producer, e?.wine_name].filter(Boolean).join(" ") || "unknown wine";
      const verb =
        row.response === "more" ? "LIKED MORE THAN" : row.response === "less" ? "LIKED LESS THAN" : "COULDN'T SEPARATE FROM";
      lines.push(`- ${name(row.new_entry)} ${verb} ${name(row.comparison_entry)}`);
    }
  }

  return lines.join("\n");
}

// ── Distillation call ─────────────────────────────────────────────────

function clampAxisSeeds(
  seeds: DistilledWineTypeProfile["axis_seeds"]
): DistilledWineTypeProfile["axis_seeds"] {
  return seeds
    .filter((seed) => SENSORY_AXES.includes(seed.axis))
    .map((seed) => ({
      axis: seed.axis,
      value: Math.min(5, Math.max(1, seed.value)),
      confidence: Math.min(1, Math.max(0, seed.confidence)),
    }));
}

export async function distillPalateProfile(signal: PalateSignal): Promise<DistilledPalateProfile> {
  const manual = await loadSommelierManual();
  const user = [
    "Distill this user's palate into a structured profile using the recommendation manual's method: isolate the underlying characteristics behind their picks, weigh strong signals over weak ones (manual section 3), and never over-read sparse data.",
    "For each wine type with real evidence, estimate only the sensory axes the evidence supports. Skip wine types you know nothing about.",
    "",
    describeSignal(signal),
  ].join("\n");

  const { input } = await anthropicToolCall<DistilledPalateProfile & { reasoning: string }>({
    model: PALATE_DISTILL_MODEL,
    system: manual,
    user,
    toolName: "palate_profile",
    toolDescription: "Record the distilled palate profile.",
    inputSchema: DISTILLATION_SCHEMA,
    maxTokens: 4000,
    timeoutMs: 60_000,
  });

  return {
    narrative: input.narrative,
    adventurousness: Math.min(10, Math.max(1, Math.round(input.adventurousness))),
    confidence: Math.min(1, Math.max(0, input.confidence)),
    wine_types: (input.wine_types ?? [])
      .filter((wt) => WINE_TYPE_VALUES.includes(wt.wine_type))
      .map((wt) => ({ ...wt, axis_seeds: clampAxisSeeds(wt.axis_seeds ?? []) })),
  };
}

// ── Cache (palate_profiles table) ─────────────────────────────────────

export async function readPalateProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<PalateProfileRecord | null> {
  const { data, error } = await supabase
    .from("palate_profiles")
    .select("profile, signal_hash, model, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as PalateProfileRecord;
}

export type EnsurePalateProfileResult = {
  record: PalateProfileRecord;
  refreshed: boolean;
};

/**
 * Return a fresh distilled profile, re-distilling only when the underlying
 * signal changed and the cached profile is older than the refresh interval
 * (or when `force` is set). Writes require a service-role client.
 */
export async function ensurePalateProfile(
  adminSupabase: SupabaseClient,
  userId: string,
  options: { force?: boolean } = {}
): Promise<EnsurePalateProfileResult> {
  const [existing, signal] = await Promise.all([
    readPalateProfile(adminSupabase, userId),
    gatherPalateSignal(adminSupabase, userId),
  ]);

  const signalHash = computeSignalHash(signal);
  if (
    existing &&
    !options.force &&
    (existing.signal_hash === signalHash ||
      Date.now() - new Date(existing.updated_at).getTime() < MIN_REDISTILL_INTERVAL_MS)
  ) {
    return { record: existing, refreshed: false };
  }

  const profile = await distillPalateProfile(signal);
  const record: PalateProfileRecord = {
    profile,
    signal_hash: signalHash,
    model: PALATE_DISTILL_MODEL,
    updated_at: new Date().toISOString(),
  };

  const { error } = await adminSupabase.from("palate_profiles").upsert(
    {
      user_id: userId,
      profile,
      signal_hash: signalHash,
      model: PALATE_DISTILL_MODEL,
      updated_at: record.updated_at,
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(`Failed to persist palate profile: ${error.message}`);

  return { record, refreshed: true };
}

// ── Seed conversion (consumed by buildUserPreferenceVector) ──────────

const MIN_AXIS_SEED_CONFIDENCE = 0.3;
const CATEGORICAL_SEED_WEIGHT = 0.6;

export function distilledSeedForWineType(
  record: PalateProfileRecord,
  wineType: WineType
): PreferenceSeed | null {
  const typeProfile = record.profile.wine_types.find((wt) => wt.wine_type === wineType);
  if (!typeProfile) return null;

  const sensory: Partial<SensoryVector> = {};
  for (const seed of typeProfile.axis_seeds) {
    if (seed.confidence >= MIN_AXIS_SEED_CONFIDENCE) {
      sensory[seed.axis] = seed.value;
    }
  }

  const toRecord = (values: string[]) =>
    Object.fromEntries(values.map((value) => [value, 1.0]));

  const categorical: CategoricalPreferenceVector = {
    varietals: toRecord(typeProfile.favored_varietals),
    regions: toRecord(typeProfile.favored_regions),
    countries: toRecord(typeProfile.favored_countries),
    classifications: {},
    weights: {
      varietal: typeProfile.favored_varietals.length > 0 ? CATEGORICAL_SEED_WEIGHT : 0,
      region: typeProfile.favored_regions.length > 0 ? CATEGORICAL_SEED_WEIGHT : 0,
      country: typeProfile.favored_countries.length > 0 ? CATEGORICAL_SEED_WEIGHT : 0,
      classification: 0,
    },
  };

  return {
    kind: "distilled",
    sensory,
    categorical,
    adventurousness: record.profile.adventurousness,
    confidence: record.profile.confidence,
    completed_at: record.updated_at,
  };
}

/**
 * Read-only convenience for scoring paths: cached profile → per-type seed,
 * never triggering a distillation. Returns null when Anthropic isn't
 * configured or no profile exists yet — callers fall back to survey/entries.
 */
export async function loadDistilledSeed(
  supabase: SupabaseClient,
  userId: string,
  wineType: WineType
): Promise<PreferenceSeed | null> {
  if (!isAnthropicConfigured()) return null;
  const record = await readPalateProfile(supabase, userId);
  if (!record) return null;
  return distilledSeedForWineType(record, wineType);
}
