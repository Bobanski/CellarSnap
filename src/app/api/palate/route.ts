import { NextResponse } from "next/server";
import { z } from "zod";
import {
  RequestAuthError,
  requireRequestAuth,
} from "@/server/auth/requestAuth";
import {
  averageAxisValues,
  buildPalateStyleFamilies,
  describePreferenceStrength,
  SENSORY_AXIS_LABELS,
} from "@/lib/algorithm/matchUi";
import { normalizeAdvancedNotes } from "@/lib/advancedNotes";
import { executeSelectWithFallback } from "@/server/db/compat";
import { SENSORY_AXES } from "@/server/algorithm/types";
import type { SensoryAxis } from "@/server/algorithm/types";
import {
  buildUserPreferenceVector,
  type PreferenceSourceEntry,
} from "@/server/algorithm/userPreferences";
import { bulkResolveEntrySensoryProfiles } from "@/server/algorithm/resolveEntrySensory";
import { WINE_TYPE_VALUES, type WineType } from "@/types/wine";

function isWineType(value: string | null | undefined): value is WineType {
  return WINE_TYPE_VALUES.includes(value as WineType);
}

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const entryRowSchema = z.object({
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

type EntryRow = z.infer<typeof entryRowSchema>;

const PALATE_RADAR_GROUPS: { key: string; label: string; axes: SensoryAxis[] }[] = [
  { key: "structure", label: "Structure", axes: ["body", "acidity", "tannin", "alcohol_perception"] },
  { key: "flavor", label: "Flavor", axes: ["fruit_ripeness", "sweetness_perception", "bitterness_phenolic_grip"] },
  { key: "aromatics", label: "Aromatics", axes: ["aromatic_intensity", "oak_presence"] },
  { key: "earth", label: "Earth", axes: ["earthy", "mineral", "savory"] },
  { key: "quality", label: "Quality", axes: ["finish_length", "concentration", "complexity", "freshness"] },
];

/**
 * GET /api/palate
 * Returns all computed palate data as JSON for the mobile app.
 */
export async function GET(request: Request) {
  let auth;
  try {
    auth = await requireRequestAuth(request);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }

  const { supabase, user } = auth;

  // Load entries
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
        .eq("user_id", user.id)
        .not("rating", "is", null)
        .limit(1000);
      return { data: response.data, error: response.error };
    },
  });

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  const validated = z.array(entryRowSchema).safeParse(result.data ?? []);
  if (!validated.success) {
    return NextResponse.json({ error: "Invalid entry data" }, { status: 500 });
  }

  const rows = validated.data;

  // Backfill unresolved entries
  const unresolved = rows.filter((r) => !r.assembled_sensory && r.wine_type);
  if (unresolved.length > 0) {
    try {
      const backfillResult = await bulkResolveEntrySensoryProfiles(
        supabase,
        unresolved.map((r) => ({
          id: r.id,
          wine_type: r.wine_type ?? null,
          canonical_region: r.canonical_region ?? null,
          canonical_sub_region: r.canonical_sub_region ?? null,
          canonical_country: r.canonical_country ?? null,
          region: r.region ?? null,
          appellation: r.appellation ?? null,
          country: r.country ?? null,
          vintage: r.vintage ?? null,
          producer: r.producer ?? null,
          classification: r.classification ?? null,
        }))
      );
      if (backfillResult.resolved > 0) {
        const { data: fresh } = await supabase
          .from("wine_entries")
          .select("id, assembled_sensory")
          .in("id", unresolved.map((r) => r.id));
        if (fresh) {
          const freshMap = new Map(fresh.map((r) => [r.id, r.assembled_sensory]));
          rows.forEach((row) => {
            const f = freshMap.get(row.id);
            if (f) row.assembled_sensory = f;
          });
        }
      }
    } catch {
      // Best-effort
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
    assembled_sensory:
      row.assembled_sensory && typeof row.assembled_sensory === "object"
        ? (row.assembled_sensory as Partial<Record<string, number>>)
        : null,
  }));

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

  // Style families
  const styleFamilies = primaryProfile
    ? buildPalateStyleFamilies(primaryProfile.profile.sensory)
    : [];
  const preferenceStrength = describePreferenceStrength(
    primaryProfile?.profile.event_count ?? 0
  );

  // Regions
  const regionCounts = new Map<string, { total: number; count: number }>();
  rows.forEach((row) => {
    if (typeof row.rating !== "number") return;
    const key = row.canonical_sub_region ?? row.canonical_region ?? row.region ?? row.canonical_country ?? row.country ?? null;
    if (!key) return;
    const cur = regionCounts.get(key) ?? { total: 0, count: 0 };
    cur.total += row.rating;
    cur.count += 1;
    regionCounts.set(key, cur);
  });
  const overallAvg =
    rows.reduce((s, r) => s + (typeof r.rating === "number" ? r.rating : 0), 0) /
    Math.max(rows.filter((r) => typeof r.rating === "number").length, 1);
  const regionStats = [...regionCounts.entries()]
    .map(([region, v]) => {
      const delta = Number((v.total / v.count - overallAvg).toFixed(1));
      return {
        region,
        count: v.count,
        avgRating: Number((v.total / v.count).toFixed(1)),
        delta,
        deltaLabel: delta > 2 ? "Rates higher" : delta < -2 ? "Rates lower" : null,
      };
    })
    .filter((r) => r.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Wine types
  const typeCounts = new Map<string, number>();
  rows.forEach((r) => { if (r.wine_type) typeCounts.set(r.wine_type, (typeCounts.get(r.wine_type) ?? 0) + 1); });
  const totalEntries = rows.length || 1;
  const wineTypeStats = [...typeCounts.entries()]
    .map(([type, count]) => ({ type: titleCase(type), count, pct: Math.round((count / totalEntries) * 100) }))
    .sort((a, b) => b.count - a.count);

  // Top grapes
  const entryIds = rows.map((e) => e.id);
  let topGrapes: { name: string; count: number }[] = [];
  if (entryIds.length > 0) {
    const { data: grapeRows } = await supabase
      .from("entry_primary_grapes")
      .select("variety_id")
      .in("entry_id", entryIds);
    if (grapeRows && grapeRows.length > 0) {
      const counts = new Map<string, number>();
      grapeRows.forEach((r) => counts.set(r.variety_id, (counts.get(r.variety_id) ?? 0) + 1));
      const topIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
      const { data: varieties } = await supabase
        .from("grape_varieties")
        .select("id, name")
        .in("id", topIds);
      if (varieties) {
        topGrapes = topIds
          .map((id) => {
            const v = varieties.find((x) => x.id === id);
            return v ? { name: v.name, count: counts.get(id) ?? 0 } : null;
          })
          .filter((x): x is { name: string; count: number } => x !== null);
      }
    }
  }

  // Standout axes
  const allAxes = primaryProfile
    ? Object.entries(primaryProfile.profile.sensory)
        .map(([axis, val]) => ({
          axis,
          label: SENSORY_AXIS_LABELS[axis as keyof typeof SENSORY_AXIS_LABELS] ?? axis,
          value: val ?? 3,
        }))
    : [];
  const leansInto = allAxes.filter((a) => a.value > 3.15).sort((a, b) => b.value - a.value).slice(0, 4);
  const avoids = allAxes.filter((a) => a.value < 2.5).sort((a, b) => a.value - b.value).slice(0, 2);

  // Radar points
  const radarPoints = primaryProfile
    ? PALATE_RADAR_GROUPS.map((group) => ({
        key: group.key,
        label: group.label,
        neutral: 3,
        user: averageAxisValues(primaryProfile.profile.sensory, group.axes) ?? 3,
      }))
    : [];

  // Per-type breakdown
  const typeBreakdown = typeProfiles.map((item) => {
    const topAxes = Object.entries(item.profile.sensory)
      .map(([a, v]) => ({
        axis: a,
        label: SENSORY_AXIS_LABELS[a as keyof typeof SENSORY_AXIS_LABELS] ?? a,
        value: v ?? 3,
      }))
      .sort((a, b) => Math.abs(b.value - 3) - Math.abs(a.value - 3))
      .slice(0, 3);
    return {
      wineType: titleCase(item.wineType),
      eventCount: item.profile.event_count,
      topAxes,
    };
  });

  // Survey info
  const { data: surveyData } = await supabase
    .from("taste_survey_responses")
    .select("varietals, regions, sensory_loves")
    .eq("user_id", user.id)
    .maybeSingle();
  const hasSurvey = surveyData != null;

  // Insights — find the most distinctive commonality across wines (not wine type)
  const insights: string[] = [];

  // Candidate 1: top country by %
  const countryCounts = new Map<string, number>();
  rows.forEach((r) => {
    const c = r.canonical_country ?? r.country;
    if (c) countryCounts.set(c, (countryCounts.get(c) ?? 0) + 1);
  });
  const topCountry = [...countryCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const topCountryPct = topCountry ? Math.round((topCountry[1] / totalEntries) * 100) : 0;

  // Candidate 2: top grape by %
  const topGrapePct = topGrapes.length > 0 ? Math.round((topGrapes[0].count / totalEntries) * 100) : 0;

  // Candidate 3: top sensory trait (% of entries with a high value)
  const SENSORY_INSIGHT_LABELS: Record<string, string> = {
    acidity: "high acidity", body: "full-bodied", tannin: "tannic",
    alcohol_perception: "high alcohol", fruit_ripeness: "fruit-forward",
    oak_presence: "oaky", complexity: "complex", freshness: "fresh",
  };
  let topSensoryInsight: { label: string; pct: number } | null = null;
  if (leansInto.length > 0) {
    const topAxis = leansInto[0];
    const friendlyName = SENSORY_INSIGHT_LABELS[topAxis.axis] ?? topAxis.label.toLowerCase();
    // Rough %: if the average is 3.8+, most entries contribute
    if (topAxis.value >= 3.8) {
      topSensoryInsight = { label: friendlyName, pct: Math.round(((topAxis.value - 3) / 2) * 100) };
    }
  }

  // Pick the highest % commonality as the lead insight
  type InsightCandidate = { text: string; pct: number };
  const candidates: InsightCandidate[] = [];
  if (topCountry && topCountryPct >= 30) {
    candidates.push({ text: `${topCountryPct}% of your wines are from ${topCountry[0]}`, pct: topCountryPct });
  }
  if (topGrapes.length > 0 && topGrapePct >= 20) {
    candidates.push({ text: `${topGrapePct}% of your wines feature ${topGrapes[0].name}`, pct: topGrapePct });
  }
  if (topSensoryInsight) {
    candidates.push({ text: `Your wines tend to be ${topSensoryInsight.label}`, pct: topSensoryInsight.pct });
  }
  // Sort by % and take the top as lead insight
  candidates.sort((a, b) => b.pct - a.pct);
  if (candidates.length > 0) {
    insights.push(candidates[0].text);
  }

  // Secondary insights
  if (regionStats.length > 0 && regionStats[0].delta > 3) {
    insights.push(`You rate ${regionStats[0].region} wines +${regionStats[0].delta} points above your average`);
  }
  if (topGrapes.length > 0 && topGrapes[0].count >= 3 && !insights.some((i) => i.includes(topGrapes[0].name))) {
    insights.push(`${topGrapes[0].name} is your most logged grape (${topGrapes[0].count} wines)`);
  }
  if (hasSurvey && leansInto.length > 0) {
    insights.push("Your ratings are starting to confirm your taste quiz answers");
  }

  const regionCount = new Set(rows.map((r) => r.canonical_country ?? r.country).filter(Boolean)).size;

  const MIN_ENTRIES_FOR_PALATE = 8;

  return NextResponse.json({
    totalRated: rows.length,
    gated: rows.length < MIN_ENTRIES_FOR_PALATE,
    entriesNeeded: Math.max(0, MIN_ENTRIES_FOR_PALATE - rows.length),
    regionCount,
    hasSurvey,
    topStyle: styleFamilies[0] ?? null,
    styleFamilies,
    preferenceStrength,
    topGrapes,
    regionStats,
    wineTypeStats,
    radarPoints,
    leansInto,
    avoids,
    typeBreakdown,
    insights,
    surveyFallback: hasSurvey
      ? {
          varietals: surveyData.varietals?.slice(0, 3) ?? [],
          regions: surveyData.regions?.slice(0, 3) ?? [],
        }
      : null,
  });
}
