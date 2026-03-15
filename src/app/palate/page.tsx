import NavBar from "@/components/NavBar";
import SensoryRadarChart from "@/components/SensoryRadarChart";
import { assertPrivateBetaFeatureAccess } from "@/lib/access/privateBetaFeatures";
import {
  buildPalateStyleFamilies,
  buildRadarSeries,
  describePreferenceStrength,
  formatSensoryLevel,
  SENSORY_AXIS_LABELS,
} from "@/lib/algorithm/matchUi";
import { normalizeAdvancedNotes } from "@/lib/advancedNotes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { executeSelectWithFallback } from "@/server/db/compat";
import { SENSORY_AXES } from "@/server/algorithm/types";
import {
  buildUserPreferenceVector,
  type PreferenceSourceEntry,
} from "@/server/algorithm/userPreferences";
import { WINE_TYPE_VALUES, type WineType } from "@/types/wine";

type PalateEntryRow = {
  rating: number | null;
  advanced_notes: unknown;
  wine_type?: string | null;
  canonical_region?: string | null;
  canonical_sub_region?: string | null;
  canonical_country?: string | null;
  region?: string | null;
  appellation?: string | null;
  country?: string | null;
};

function isWineType(value: string | null | undefined): value is WineType {
  return WINE_TYPE_VALUES.includes(value as WineType);
}

function buildNeutralVector() {
  return SENSORY_AXES.reduce((vector, axis) => {
    vector[axis] = 3;
    return vector;
  }, {} as Record<(typeof SENSORY_AXES)[number], number>);
}

function aggregateFavoriteRegions(rows: PalateEntryRow[]) {
  const byRegion = new Map<
    string,
    {
      total: number;
      count: number;
    }
  >();

  rows.forEach((row) => {
    if (typeof row.rating !== "number" || Number.isNaN(row.rating)) {
      return;
    }

    const key =
      row.canonical_sub_region ??
      row.canonical_region ??
      row.region ??
      row.canonical_country ??
      row.country ??
      row.appellation ??
      null;
    if (!key) {
      return;
    }

    const current = byRegion.get(key) ?? { total: 0, count: 0 };
    current.total += row.rating;
    current.count += 1;
    byRegion.set(key, current);
  });

  return [...byRegion.entries()]
    .map(([region, value]) => ({
      region,
      average: Number((value.total / value.count).toFixed(1)),
      count: value.count,
    }))
    .sort((left, right) => {
      if (left.average !== right.average) {
        return right.average - left.average;
      }
      return right.count - left.count;
    })
    .slice(0, 3);
}

async function loadPalateRows(userId: string) {
  const supabase = await createSupabaseServerClient();

  const result = await executeSelectWithFallback({
    attempts: [
      {
        fields:
          "rating, advanced_notes, wine_type, canonical_region, canonical_sub_region, canonical_country, region, appellation, country",
        missingColumns: ["wine_type", "canonical_region", "canonical_sub_region", "canonical_country"] as const,
      },
      {
        fields: "rating, advanced_notes, region, appellation, country",
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
        .not("rating", "is", null);

      return {
        data: response.data,
        error: response.error,
      };
    },
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return ((result.data ?? []) as unknown) as PalateEntryRow[];
}

export default async function PalatePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  assertPrivateBetaFeatureAccess(user);

  const rows = await loadPalateRows(user.id);
  const preferenceEntries: PreferenceSourceEntry[] = rows.map((row) => ({
    rating: row.rating ?? null,
    advanced_notes: normalizeAdvancedNotes(row.advanced_notes),
    wine_type: isWineType(row.wine_type) ? row.wine_type : null,
  }));

  const typeProfiles = WINE_TYPE_VALUES.map((wineType) => ({
    wineType,
    profile: buildUserPreferenceVector(preferenceEntries, wineType),
  }))
    .filter(
      (item) =>
        item.profile.event_count > 0 || Object.keys(item.profile.sensory).length > 0
    )
    .sort((left, right) => right.profile.event_count - left.profile.event_count);

  const primaryProfile = typeProfiles[0] ?? null;
  const preferenceStrength = describePreferenceStrength(primaryProfile?.profile.event_count ?? 0);
  const favoriteRegions = aggregateFavoriteRegions(rows);
  const totalRatedEntries = rows.length;
  const totalDetailedEntries = preferenceEntries.filter((entry) => entry.advanced_notes).length;
  const leadingAxes = primaryProfile
    ? Object.entries(primaryProfile.profile.sensory)
        .sort((left, right) => (right[1] ?? 0) - (left[1] ?? 0))
        .slice(0, 4)
    : [];
  const radarPoints = primaryProfile
    ? buildRadarSeries({
        wine: buildNeutralVector(),
        user: primaryProfile.profile.sensory,
      })
    : [];
  const styleFamilies = primaryProfile
    ? buildPalateStyleFamilies(primaryProfile.profile.sensory)
    : [];

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <NavBar activeHrefOverride="/palate" />

        <header className="space-y-3">
          <span className="block text-xs uppercase tracking-[0.3em] text-amber-300/70">
            Palate profile
          </span>
          <h1 className="text-3xl font-semibold text-zinc-50">
            Your taste profile, grounded in what you have actually logged.
          </h1>
          <p className="max-w-3xl text-sm text-zinc-300">
            This view reflects the same structured algorithm used for match scoring:
            sensory notes, per-type preferences, and confidence from your tasting history.
          </p>
        </header>

        {!primaryProfile ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
            <h2 className="text-xl font-semibold text-zinc-50">
              Build your palate profile
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-zinc-300">
              Start rating wines and add a few sensory notes like body, acidity, tannin,
              alcohol, or sweetness. The profile becomes much more useful once we can see
              several detailed entries across your tastings.
            </p>
          </section>
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-3">
              <article className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Your style
                </p>
                <div className="mt-4 space-y-2">
                  {styleFamilies.map((family) => (
                    <div
                      key={family}
                      className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100"
                    >
                      {family}
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Favorite regions
                </p>
                <div className="mt-4 space-y-3">
                  {favoriteRegions.length > 0 ? (
                    favoriteRegions.map((region) => (
                      <div key={region.region} className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-100">{region.region}</p>
                          <p className="text-xs text-zinc-500">{region.count} rated entries</p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-zinc-200">
                          {region.average}/100 avg
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-zinc-400">Log a few more rated entries to see regional patterns.</p>
                  )}
                </div>
              </article>

              <article className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Preference strength
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-zinc-50">
                  {preferenceStrength.label}
                </h2>
                <p className="mt-2 text-sm text-zinc-300">{preferenceStrength.detail}</p>
                <div className="mt-4 h-2 rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-300 to-emerald-300"
                    style={{ width: `${preferenceStrength.progress}%` }}
                  />
                </div>
                <p className="mt-3 text-sm text-zinc-400">
                  Your palate is based on {primaryProfile.profile.event_count} entries with sensory notes,
                  from {totalRatedEntries} rated entries overall.
                </p>
              </article>
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.9fr)]">
              <SensoryRadarChart
                points={radarPoints}
                wineLabel="Neutral midpoint"
                userLabel={`${primaryProfile.wineType} palate`}
              />

              <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-300/70">
                    Primary profile
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-zinc-50">
                    {primaryProfile.wineType[0]?.toUpperCase()}
                    {primaryProfile.wineType.slice(1)} palate
                  </h2>
                  <p className="mt-2 text-sm text-zinc-300">
                    The chart compares your strongest current profile against a neutral midpoint,
                    so peaks show where your preferences stand out most clearly.
                  </p>
                </div>

                <div className="grid gap-3">
                  {leadingAxes.map(([axis, value]) => (
                    <div
                      key={axis}
                      className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                    >
                      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                        {SENSORY_AXIS_LABELS[axis as keyof typeof SENSORY_AXIS_LABELS]}
                      </p>
                      <p className="mt-1 text-sm text-zinc-200">
                        {formatSensoryLevel(value)} leaning
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                    By wine type
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-zinc-50">
                    Profile coverage across your cellar
                  </h2>
                </div>
                <p className="text-sm text-zinc-400">
                  {totalDetailedEntries} entries currently include usable sensory notes.
                </p>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {typeProfiles.map((item) => (
                  <article
                    key={item.wineType}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold text-zinc-50">
                        {item.wineType[0]?.toUpperCase()}
                        {item.wineType.slice(1)}
                      </h3>
                      <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300">
                        {item.profile.event_count} entries
                      </span>
                    </div>
                    <div className="mt-4 space-y-2">
                      {Object.entries(item.profile.sensory)
                        .sort((left, right) => (right[1] ?? 0) - (left[1] ?? 0))
                        .slice(0, 3)
                        .map(([axis, value]) => (
                          <div key={`${item.wineType}-${axis}`} className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-zinc-300">
                              {SENSORY_AXIS_LABELS[axis as keyof typeof SENSORY_AXIS_LABELS]}
                            </span>
                            <span className="text-zinc-100">{formatSensoryLevel(value)}</span>
                          </div>
                        ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
