import { z } from "zod";
import Link from "next/link";
import { grapeProfileUrl, regionProfileUrl } from "@shared";
import AppShell from "@/components/AppShell";
import SensoryRadarChart from "@/components/SensoryRadarChart";
import { requirePrivateBetaFeatureUser } from "@/lib/access/privateBetaFeatures";
import {
  averageAxisValues,
  buildPalateStyleFamilies,
  describePreferenceStrength,
  SENSORY_AXIS_LABELS,
} from "@/lib/algorithm/matchUi";
import type { SensoryAxis } from "@/server/algorithm/types";
import { normalizeAdvancedNotes } from "@/lib/advancedNotes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { executeSelectWithFallback } from "@/server/db/compat";
import { SENSORY_AXES } from "@/server/algorithm/types";
import {
  buildUserPreferenceVector,
  type PreferenceSourceEntry,
} from "@/server/algorithm/userPreferences";
import { bulkResolveEntrySensoryProfiles } from "@/server/algorithm/resolveEntrySensory";
import { WINE_TYPE_VALUES, type WineType } from "@/types/wine";

// ─── Types ───────────────────────────────────────────────────

type PalateEntryRow = {
  id: string;
  rating: number | null;
  advanced_notes: unknown;
  notes?: string | null;
  assembled_sensory?: unknown;
  wine_type?: string | null;
  canonical_region?: string | null;
  canonical_sub_region?: string | null;
  canonical_country?: string | null;
  region?: string | null;
  appellation?: string | null;
  country?: string | null;
  vintage?: string | null;
  producer?: string | null;
  classification?: string | null;
};

const palateEntryRowSchema = z.object({
  id: z.string(),
  rating: z.union([z.number(), z.null()]),
  advanced_notes: z.unknown(),
  notes: z.union([z.string(), z.null()]).optional(),
  assembled_sensory: z.unknown().optional(),
  wine_type: z.union([z.string(), z.null()]).optional(),
  canonical_region: z.union([z.string(), z.null()]).optional(),
  canonical_sub_region: z.union([z.string(), z.null()]).optional(),
  canonical_country: z.union([z.string(), z.null()]).optional(),
  region: z.union([z.string(), z.null()]).optional(),
  appellation: z.union([z.string(), z.null()]).optional(),
  country: z.union([z.string(), z.null()]).optional(),
  vintage: z.union([z.string(), z.null()]).optional(),
  producer: z.union([z.string(), z.null()]).optional(),
  classification: z.union([z.string(), z.null()]).optional(),
});

type GrapeCount = { name: string; count: number };
type RegionStat = { region: string; count: number; avgRating: number; delta: number };
type WineTypeStat = { type: string; count: number; pct: number };

// ─── Data helpers ────────────────────────────────────────────

function isWineType(value: string | null | undefined): value is WineType {
  return WINE_TYPE_VALUES.includes(value as WineType);
}

function buildNeutralVector() {
  return SENSORY_AXES.reduce((vector, axis) => {
    vector[axis] = 3;
    return vector;
  }, {} as Record<(typeof SENSORY_AXES)[number], number>);
}

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function aggregateRegions(rows: PalateEntryRow[]) {
  const byRegion = new Map<string, { total: number; count: number }>();

  rows.forEach((row) => {
    if (typeof row.rating !== "number" || Number.isNaN(row.rating)) return;
    const key =
      row.canonical_sub_region ??
      row.canonical_region ??
      row.region ??
      row.canonical_country ??
      row.country ??
      row.appellation ??
      null;
    if (!key) return;
    const cur = byRegion.get(key) ?? { total: 0, count: 0 };
    cur.total += row.rating;
    cur.count += 1;
    byRegion.set(key, cur);
  });

  const overallAvg =
    rows.reduce((sum, r) => sum + (typeof r.rating === "number" ? r.rating : 0), 0) /
    Math.max(rows.filter((r) => typeof r.rating === "number").length, 1);

  return [...byRegion.entries()]
    .map(([region, v]) => ({
      region,
      count: v.count,
      avgRating: Number((v.total / v.count).toFixed(1)),
      delta: Number((v.total / v.count - overallAvg).toFixed(1)),
    }))
    .filter((r) => r.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function aggregateWineTypes(rows: PalateEntryRow[]): WineTypeStat[] {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const wt = row.wine_type;
    if (wt) counts.set(wt, (counts.get(wt) ?? 0) + 1);
  });
  const total = rows.length || 1;
  return [...counts.entries()]
    .map(([type, count]) => ({ type: titleCase(type), count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

// ─── Data loading ────────────────────────────────────────────

async function loadPalateRows(userId: string) {
  const supabase = await createSupabaseServerClient();
  const result = await executeSelectWithFallback({
    attempts: [
      {
        fields:
          "id, rating, advanced_notes, notes, assembled_sensory, wine_type, canonical_region, canonical_sub_region, canonical_country, region, appellation, country, vintage, producer, classification",
        missingColumns: ["notes", "assembled_sensory", "wine_type", "canonical_region", "canonical_sub_region", "canonical_country", "vintage", "producer", "classification"] as const,
      },
      {
        fields: "id, rating, advanced_notes, region, appellation, country",
        missingColumns: [] as const,
      },
    ],
    getFallbackColumns: (attempt) => attempt.missingColumns,
    fallbackOnAnyMissingColumn: false,
    attempt: async (attempt) => {
      const response = await supabase
        .from("wine_entries")
        .select(attempt.fields)
        .eq("user_id", userId)
        .not("rating", "is", null)
        .limit(1000);
      return { data: response.data, error: response.error };
    },
  });
  if (result.error) throw new Error(result.error.message);
  const validated = z.array(palateEntryRowSchema).safeParse(result.data ?? []);
  if (!validated.success) throw new Error("Failed to validate palate entry data");
  return validated.data;
}

async function loadTopGrapes(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  entryIds: string[]
): Promise<GrapeCount[]> {
  if (entryIds.length === 0) return [];

  const { data: grapeRows } = await supabase
    .from("entry_primary_grapes")
    .select("variety_id")
    .in("entry_id", entryIds);

  if (!grapeRows || grapeRows.length === 0) return [];

  const counts = new Map<string, number>();
  grapeRows.forEach((r) => counts.set(r.variety_id, (counts.get(r.variety_id) ?? 0) + 1));

  const topIds = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  const { data: varieties } = await supabase
    .from("grape_varieties")
    .select("id, name")
    .in("id", topIds);

  if (!varieties) return [];

  return topIds
    .map((id) => {
      const v = varieties.find((x) => x.id === id);
      return v ? { name: v.name, count: counts.get(id) ?? 0 } : null;
    })
    .filter((x): x is GrapeCount => x !== null);
}

// ─── Sensory bar component ───────────────────────────────────

function SensoryBar({ label, value, max = 5 }: { label: string; value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const isHigh = value >= 3.8;
  const isLow = value <= 2.2;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--color-text-secondary)]">{label}</span>
        <span className={`font-semibold ${isHigh ? "text-[var(--color-accent-secondary)]" : isLow ? "text-[var(--color-text-tertiary)]" : "text-[var(--color-text-primary)]"}`}>
          {value.toFixed(1)}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--color-surface-hover)]">
        <div
          className={`h-full rounded-full transition-all ${isHigh ? "bg-[var(--color-accent-secondary)]" : "bg-[var(--color-accent-primary)]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Type distribution bar ───────────────────────────────────

function TypeBar({ stats }: { stats: WineTypeStat[] }) {
  const typeColors: Record<string, string> = {
    Red: "#7B1D3A",
    White: "#C9A84C",
    Sparkling: "#7C8FE6",
    Rosé: "#C4607A",
    Orange: "#D4A574",
    Sweet: "#9B2449",
  };

  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full">
        {stats.map((s) => (
          <div
            key={s.type}
            className="transition-all"
            style={{
              width: `${s.pct}%`,
              backgroundColor: typeColors[s.type] ?? "var(--color-surface-hover)",
              minWidth: s.pct > 0 ? "4px" : "0",
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {stats.map((s) => (
          <span key={s.type} className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: typeColors[s.type] ?? "var(--color-surface-hover)" }}
            />
            {s.type} {s.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────

export default async function PalatePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const viewer = await requirePrivateBetaFeatureUser(supabase, user);

  // Load data in parallel
  const [rows, surveyRow] = await Promise.all([
    loadPalateRows(viewer.id),
    supabase
      .from("taste_survey_responses")
      .select("*")
      .eq("user_id", viewer.id)
      .maybeSingle()
      .then((r) => r.data),
  ]);

  // Load grapes using the same entry IDs (ensures consistency)
  const topGrapes = await loadTopGrapes(supabase, rows.map((r) => r.id));

  const hasSurvey = surveyRow != null;
  const totalRated = rows.length;

  // Backfill: resolve sensory profiles for entries that don't have one yet.
  // This runs once per entry and writes assembled_sensory to the DB so
  // subsequent loads are instant.
  const unresolvedEntries = rows.filter(
    (row) => !row.assembled_sensory && row.wine_type
  );
  if (unresolvedEntries.length > 0) {
    try {
      const result = await bulkResolveEntrySensoryProfiles(
        supabase,
        unresolvedEntries.map((row) => ({
          id: row.id,
          wine_type: row.wine_type ?? null,
          canonical_region: row.canonical_region ?? null,
          canonical_sub_region: row.canonical_sub_region ?? null,
          canonical_country: row.canonical_country ?? null,
          region: row.region ?? null,
          appellation: row.appellation ?? null,
          country: row.country ?? null,
          vintage: row.vintage ?? null,
          producer: row.producer ?? null,
          classification: row.classification ?? null,
        }))
      );
      // Re-read entries that were just resolved so we have the sensory data
      if (result.resolved > 0) {
        const resolvedIds = unresolvedEntries.map((r) => r.id);
        const { data: freshRows } = await supabase
          .from("wine_entries")
          .select("id, assembled_sensory")
          .in("id", resolvedIds);
        if (freshRows) {
          const freshMap = new Map(freshRows.map((r) => [r.id, r.assembled_sensory]));
          rows.forEach((row) => {
            const fresh = freshMap.get(row.id);
            if (fresh) row.assembled_sensory = fresh;
          });
        }
      }
    } catch {
      // Backfill is best-effort — page still works with advanced_notes alone.
    }
  }

  // Build preference vectors
  const preferenceEntries: PreferenceSourceEntry[] = rows.map((row) => ({
    rating: row.rating ?? null,
    advanced_notes: normalizeAdvancedNotes(row.advanced_notes),
    notes: row.notes ?? null,
    wine_type: isWineType(row.wine_type) ? row.wine_type : null,
    canonical_region: row.canonical_region ?? null,
    canonical_sub_region: row.canonical_sub_region ?? null,
    canonical_country: row.canonical_country ?? row.country ?? null,
    region: row.region ?? null,
    appellation: row.appellation ?? null,
    country: row.country ?? null,
    assembled_sensory: (row.assembled_sensory && typeof row.assembled_sensory === "object")
      ? (row.assembled_sensory as Partial<Record<string, number>>)
      : null,
  }));
  // An entry contributes to the sensory profile if it has EITHER assembled_sensory
  // (back-derived from wine database) OR advanced_notes (user's manual input)
  const detailedEntries = preferenceEntries.filter(
    (e) => e.assembled_sensory || e.advanced_notes
  );
  const detailedWineTypes = new Set(
    detailedEntries.map((e) => e.wine_type).filter((wt): wt is WineType => Boolean(wt))
  );

  const typeProfiles = WINE_TYPE_VALUES.filter((wt) => detailedWineTypes.has(wt))
    .map((wt) => ({ wineType: wt, profile: buildUserPreferenceVector(preferenceEntries, wt) }))
    .filter((p) => p.profile.event_count > 0)
    .sort((a, b) => b.profile.event_count - a.profile.event_count);

  const fallbackProfile =
    typeProfiles.length === 0 && detailedEntries.length > 0
      ? { wineType: null as WineType | null, profile: buildUserPreferenceVector(preferenceEntries, WINE_TYPE_VALUES[0]) }
      : null;
  const primaryProfile = typeProfiles[0] ?? fallbackProfile;

  // Derived data
  const styleFamilies = primaryProfile ? buildPalateStyleFamilies(primaryProfile.profile.sensory) : [];
  const topStyle = styleFamilies[0] ?? null;
  const preferenceStrength = describePreferenceStrength(primaryProfile?.profile.event_count ?? 0);
  const regionStats = aggregateRegions(rows);
  const wineTypeStats = aggregateWineTypes(rows);
  const regionCount = new Set(rows.map((r) => r.canonical_country ?? r.country).filter(Boolean)).size;

  // Standout axes: split into "leans into" (above 3.0, sorted high→low)
  // and "avoids" (below 2.5, sorted low→high). Skip the bland middle.
  // Exclude sweetness_perception from display — it's categorical in wine, not a
  // meaningful sensory preference axis for most drinkers
  const HIDDEN_PALATE_AXES = new Set(["sweetness_perception"]);
  const allAxes = primaryProfile
    ? Object.entries(primaryProfile.profile.sensory)
        .filter(([axis]) => !HIDDEN_PALATE_AXES.has(axis))
        .map(([axis, val]) => ({ axis: axis as keyof typeof SENSORY_AXIS_LABELS, value: val ?? 3 }))
    : [];
  const leansInto = allAxes
    .filter((a) => a.value > 3.15)
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);
  const avoids = allAxes
    .filter((a) => a.value < 2.5)
    .sort((a, b) => a.value - b.value)
    .slice(0, 2);

  // Radar — 5 dimensions matching the original meta-groups
  const PALATE_RADAR_GROUPS: { key: string; label: string; axes: SensoryAxis[] }[] = [
    { key: "structure",  label: "Structure",  axes: ["body", "acidity", "tannin", "alcohol_perception"] },
    { key: "flavor",     label: "Flavor",     axes: ["fruit_ripeness", "bitterness_phenolic_grip"] },
    { key: "aromatics",  label: "Aromatics",  axes: ["aromatic_intensity", "oak_presence"] },
    { key: "earth",      label: "Earth",      axes: ["earthy", "mineral", "savory"] },
    { key: "quality",    label: "Quality",    axes: ["finish_length", "concentration", "complexity", "freshness"] },
  ];

  const radarPoints = primaryProfile
    ? PALATE_RADAR_GROUPS.map((group) => ({
        key: group.key,
        label: group.label,
        wine: 3 as number | null, // neutral baseline
        user: averageAxisValues(primaryProfile.profile.sensory, group.axes),
      }))
    : [];

  // Insights — lead with the most distinctive commonality (not wine type)
  const insights: string[] = [];

  const countryCounts = new Map<string, number>();
  rows.forEach((r) => {
    const c = r.canonical_country ?? r.country;
    if (c) countryCounts.set(c, (countryCounts.get(c) ?? 0) + 1);
  });
  const topCountry = [...countryCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const topCountryPct = topCountry ? Math.round((topCountry[1] / totalRated) * 100) : 0;
  const topGrapePct = topGrapes.length > 0 ? Math.round((topGrapes[0].count / totalRated) * 100) : 0;

  type InsightCandidate = { text: string; pct: number };
  const candidates: InsightCandidate[] = [];
  if (topCountry && topCountryPct >= 30) {
    candidates.push({ text: `${topCountryPct}% of your wines are from ${topCountry[0]}`, pct: topCountryPct });
  }
  if (topGrapes.length > 0 && topGrapePct >= 20) {
    candidates.push({ text: `${topGrapePct}% of your wines feature ${topGrapes[0].name}`, pct: topGrapePct });
  }
  if (leansInto.length > 0 && leansInto[0].value >= 3.8) {
    const SENSORY_INSIGHT_LABELS: Record<string, string> = {
      acidity: "high acidity", body: "full-bodied", tannin: "tannic",
      alcohol_perception: "high alcohol", fruit_ripeness: "fruit-forward",
      oak_presence: "oaky", complexity: "complex", freshness: "fresh",
    };
    const name = SENSORY_INSIGHT_LABELS[leansInto[0].axis] ?? leansInto[0].axis;
    candidates.push({ text: `Your wines tend to be ${name}`, pct: Math.round(((leansInto[0].value - 3) / 2) * 100) });
  }
  candidates.sort((a, b) => b.pct - a.pct);
  if (candidates.length > 0) insights.push(candidates[0].text);

  if (regionStats.length > 0 && regionStats[0].delta > 3) {
    insights.push(`You rate ${regionStats[0].region} wines +${regionStats[0].delta} points above your average`);
  }
  if (topGrapes.length > 0 && topGrapes[0].count >= 3 && !insights.some((i) => i.includes(topGrapes[0].name))) {
    insights.push(`${topGrapes[0].name} is your most logged grape (${topGrapes[0].count} wines)`);
  }
  if (hasSurvey && surveyRow?.sensory_loves?.length > 0 && leansInto.length > 0) {
    insights.push("Your ratings are starting to confirm your taste quiz answers");
  }

  const hasData = primaryProfile || totalRated > 0 || hasSurvey;
  const MIN_ENTRIES_FOR_PALATE = 8;
  const entriesNeeded = Math.max(0, MIN_ENTRIES_FOR_PALATE - totalRated);

  if (totalRated < MIN_ENTRIES_FOR_PALATE) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6 text-center">
          <h1
            className="text-2xl font-light text-[var(--color-text-primary)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Almost there
          </h1>
          <p className="max-w-md text-sm text-[var(--color-text-secondary)]">
            Log {entriesNeeded} more {entriesNeeded === 1 ? "wine" : "wines"} to unlock your full palate profile.
            You have {totalRated} so far.
          </p>
          <Link
            href="/entries/new"
            className="rounded-xl bg-[var(--color-accent-primary)] px-6 py-3 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-hover)]"
          >
            Log a wine
          </Link>
          <Link
            href="/taste-survey"
            className="text-xs font-semibold text-[var(--color-text-tertiary)] hover:text-[var(--color-accent-secondary)] transition"
          >
            {hasSurvey ? "Edit taste preferences \u2192" : "Take the taste quiz \u2192"}
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-5 py-6 text-[var(--color-text-primary)]">
      <div className="mx-auto w-full max-w-3xl space-y-6">

        {/* ── Hero ── */}
        <header className="space-y-2">
          <span className="block text-[9px] font-bold uppercase tracking-[3px] text-[var(--color-accent-secondary)]">
            Your palate
          </span>
          {topStyle ? (
            <h1
              className="text-[32px] leading-[38px] font-light text-[var(--color-text-primary)]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Your style is <em className="text-[var(--color-accent-secondary)] not-italic">{topStyle}</em>
            </h1>
          ) : (
            <h1
              className="text-[32px] leading-[38px] font-light text-[var(--color-text-primary)]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Your taste profile
            </h1>
          )}
          <p className="text-sm text-[var(--color-text-secondary)]">
            {totalRated > 0
              ? `Based on ${totalRated} rated wines across ${regionCount} ${regionCount === 1 ? "country" : "countries"}`
              : hasSurvey
                ? "Based on your taste quiz answers — log wines to make this more personal"
                : "Take the taste quiz or log some wines to build your profile"}
          </p>
          {hasSurvey ? (
            <Link
              href="/taste-survey"
              className="inline-block mt-1 text-xs font-semibold text-[var(--color-text-tertiary)] hover:text-[var(--color-accent-secondary)] transition"
            >
              Edit taste preferences {"\u2192"}
            </Link>
          ) : (
            <Link
              href="/taste-survey"
              className="inline-block mt-2 rounded-xl bg-[var(--color-accent-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-hover)]"
            >
              Take the taste quiz
            </Link>
          )}
        </header>

        {!hasData ? (
          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-8 text-center space-y-3">
            <p className="text-lg font-semibold text-[var(--color-text-primary)]">
              Nothing here yet
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Take the taste quiz or log a few wines to start building your palate profile.
            </p>
          </section>
        ) : (
          <>
            {/* ── Insights strip ── */}
            {insights.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {insights.map((insight) => (
                  <span
                    key={insight}
                    className="rounded-full border border-[var(--color-accent-rose)] bg-[var(--color-accent-soft)] px-3.5 py-1.5 text-xs font-semibold text-[var(--color-accent-secondary)]"
                  >
                    {insight}
                  </span>
                ))}
              </div>
            ) : null}

            {/* ── What you reach for ── */}
            <section className="grid gap-4 sm:grid-cols-2">
              {/* Top grapes */}
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-5 space-y-3">
                <p className="text-[9px] font-bold uppercase tracking-[2px] text-[var(--color-text-tertiary)]">
                  Top grapes
                </p>
                {topGrapes.length > 0 ? (
                  <div className="space-y-2">
                    {topGrapes.map((grape, i) => (
                      <div key={grape.name} className="flex items-center justify-between">
                        <Link
                          href={grapeProfileUrl(grape.name)}
                          className={`text-sm transition hover:text-[var(--color-accent-secondary)] hover:underline ${i === 0 ? "font-semibold text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]"}`}
                        >
                          {grape.name}
                        </Link>
                        <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--color-text-tertiary)]">
                          {grape.count}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : hasSurvey && surveyRow?.varietals?.length > 0 ? (
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    You said you love: {surveyRow.varietals.slice(0, 3).join(", ")}
                  </p>
                ) : (
                  <p className="text-xs text-[var(--color-text-tertiary)]">Log wines with grape tags to see patterns</p>
                )}
              </div>

              {/* Top regions */}
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-5 space-y-3">
                <p className="text-[9px] font-bold uppercase tracking-[2px] text-[var(--color-text-tertiary)]">
                  Top regions
                </p>
                {regionStats.length > 0 ? (
                  <div className="space-y-2">
                    {regionStats.slice(0, 4).map((r, i) => (
                      <div key={r.region} className="flex items-center justify-between gap-2">
                        <Link
                          href={regionProfileUrl(r.region)}
                          className={`text-sm transition hover:text-[var(--color-accent-secondary)] hover:underline ${i === 0 ? "font-semibold text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]"}`}
                        >
                          {r.region}
                        </Link>
                        {r.delta > 0.5 ? (
                          <span className="text-[10px] font-semibold text-emerald-400">
                            Rates {Math.abs(r.delta).toFixed(1)} pts higher
                          </span>
                        ) : r.delta < -0.5 ? (
                          <span className="text-[10px] font-semibold text-[var(--color-text-tertiary)]">
                            Rates {Math.abs(r.delta).toFixed(1)} pts lower
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--color-text-tertiary)]">On par</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : hasSurvey && surveyRow?.regions?.length > 0 ? (
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    You said you love: {surveyRow.regions.slice(0, 3).join(", ")}
                  </p>
                ) : (
                  <p className="text-xs text-[var(--color-text-tertiary)]">Log more wines to see regional patterns</p>
                )}
              </div>
            </section>

            {/* ── Wine type distribution ── */}
            {wineTypeStats.length > 0 ? (
              <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-5 space-y-3">
                <p className="text-[9px] font-bold uppercase tracking-[2px] text-[var(--color-text-tertiary)]">
                  What you drink
                </p>
                <TypeBar stats={wineTypeStats} />
              </section>
            ) : null}

            {/* ── Sensory signature ── */}
            {primaryProfile ? (
              <section className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,1.1fr)]">
                  {/* Radar chart */}
                  <SensoryRadarChart
                    points={radarPoints}
                    wineLabel="Neutral"
                    userLabel={
                      primaryProfile.wineType
                        ? `${titleCase(primaryProfile.wineType)} palate`
                        : "Your palate"
                    }
                  />

                  {/* Standout axes */}
                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-5 space-y-5">
                    {leansInto.length > 0 ? (
                      <div className="space-y-3">
                        <p className="text-[9px] font-bold uppercase tracking-[2px] text-[var(--color-accent-secondary)]">
                          You lean into
                        </p>
                        {leansInto.map(({ axis, value }) => (
                          <SensoryBar
                            key={axis}
                            label={SENSORY_AXIS_LABELS[axis]}
                            value={value}
                          />
                        ))}
                      </div>
                    ) : null}
                    {avoids.length > 0 ? (
                      <div className="space-y-3">
                        <p className="text-[9px] font-bold uppercase tracking-[2px] text-[var(--color-text-tertiary)]">
                          You tend to avoid
                        </p>
                        {avoids.map(({ axis, value }) => (
                          <SensoryBar
                            key={axis}
                            label={SENSORY_AXIS_LABELS[axis]}
                            value={value}
                          />
                        ))}
                      </div>
                    ) : null}
                    {leansInto.length === 0 && avoids.length === 0 ? (
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-[2px] text-[var(--color-text-tertiary)]">
                          Sensory signals
                        </p>
                        <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                          Log more wines with tasting details to see clear patterns emerge
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : null}

            {/* ── Per-type breakdown ── */}
            {typeProfiles.length > 1 ? (
              <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-5 space-y-4">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[2px] text-[var(--color-text-tertiary)]">
                    Taste by style
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    How your preferences differ across wine types
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {typeProfiles.map((item) => {
                    const topAxes = Object.entries(item.profile.sensory)
                      .map(([a, v]) => ({ axis: a as keyof typeof SENSORY_AXIS_LABELS, value: v ?? 3 }))
                      .sort((a, b) => Math.abs(b.value - 3) - Math.abs(a.value - 3))
                      .slice(0, 3);
                    return (
                      <div
                        key={item.wineType}
                        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                            {titleCase(item.wineType)}
                          </h3>
                          <span className="text-[10px] font-semibold text-[var(--color-text-tertiary)]">
                            {item.profile.event_count} entries
                          </span>
                        </div>
                        <div className="space-y-2">
                          {topAxes.map(({ axis, value }) => (
                            <SensoryBar key={`${item.wineType}-${axis}`} label={SENSORY_AXIS_LABELS[axis]} value={value} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* ── Confidence footer ── */}
            <div className="flex items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-tinted)] px-5 py-3">
              <div className="flex-1">
                <p className="text-xs font-semibold text-[var(--color-text-primary)]">
                  Profile confidence: {preferenceStrength.label}
                </p>
                <p className="text-[11px] text-[var(--color-text-tertiary)]">
                  {preferenceStrength.detail}
                </p>
              </div>
              <div className="w-24 h-1.5 rounded-full bg-[var(--color-surface-hover)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent-primary)] to-[var(--color-accent-secondary)]"
                  style={{ width: `${preferenceStrength.progress}%` }}
                />
              </div>
            </div>
          </>
        )}
      </div>
      </div>
    </AppShell>
  );
}
