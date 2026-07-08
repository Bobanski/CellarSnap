"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { grapeProfileUrl, regionProfileUrl } from "@shared";
import SensoryRadarChart from "@/components/SensoryRadarChart";

// ─── Colors ─────────────────────────────────────────────────
const COLORS = {
  GRENACHE: "#7B1D3A",
  ROSE: "#C4607A",
  CHAMPAGNE: "#F5EDD6",
  FOG: "#A08878",
  VIOGNIER: "#C9A84C",
  NEBBIOLO: "#4A3060",
} as const;

const TYPE_COLORS: Record<string, string> = {
  Red: COLORS.GRENACHE,
  White: COLORS.VIOGNIER,
  Sparkling: "#7C8FE6",
  "Ros\u00e9": COLORS.ROSE,
  Orange: "#D4A574",
  Sweet: "#9B2449",
};

// ─── API response types ─────────────────────────────────────
type GrapeCount = { name: string; count: number };
type RegionStat = {
  region: string;
  count: number;
  avgRating: number;
  delta: number;
  deltaLabel: string;
};
type WineTypeStat = { type: string; count: number; pct: number };
type StandoutAxis = { axis: string; label: string; value: number };
type RadarPoint = { key: string; label: string; neutral: number; user: number };

type PalateData = {
  totalRated: number;
  gated: boolean;
  entriesNeeded: number;
  regionCount: number;
  hasSurvey: boolean;
  topStyle: string | null;
  styleFamilies: string[];
  preferenceStrength: { level: number; label: string; detail: string; progress: number };
  topGrapes: GrapeCount[];
  regionStats: RegionStat[];
  wineTypeStats: WineTypeStat[];
  radarPoints: RadarPoint[];
  leansInto: StandoutAxis[];
  avoids: StandoutAxis[];
  typeBreakdown: {
    wineType: string;
    eventCount: number;
    topAxes: StandoutAxis[];
  }[];
  insights: string[];
  surveyFallback: { varietals: string[]; regions: string[] } | null;
};

// ─── Skeleton ───────────────────────────────────────────────
function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-[var(--color-surface-hover)] ${className}`}
    />
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Insights strip */}
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-7 w-52" />
      </div>
      {/* Two-col grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--color-border)] p-5 space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] p-5 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      </div>
      {/* Type bar */}
      <div className="rounded-2xl border border-[var(--color-border)] p-5 space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-full rounded-full" />
      </div>
      {/* Radar */}
      <div className="rounded-2xl border border-[var(--color-border)] p-5">
        <Skeleton className="mx-auto h-64 w-64 rounded-full" />
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────

function SensoryBar({
  label,
  value,
  max = 5,
}: {
  label: string;
  value: number;
  max?: number;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const isHigh = value >= 3.8;
  const isLow = value <= 2.2;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--color-text-secondary)]">{label}</span>
        <span
          className={`font-semibold ${
            isHigh
              ? "text-[var(--color-accent-secondary)]"
              : isLow
                ? "text-[var(--color-text-tertiary)]"
                : "text-[var(--color-text-primary)]"
          }`}
        >
          {value.toFixed(1)}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--color-surface-hover)]">
        <div
          className={`h-full rounded-full transition-all ${
            isHigh
              ? "bg-[var(--color-accent-secondary)]"
              : "bg-[var(--color-accent-primary)]"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TypeBar({ stats }: { stats: WineTypeStat[] }) {
  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full">
        {stats.map((s) => (
          <div
            key={s.type}
            className="transition-all"
            style={{
              width: `${s.pct}%`,
              backgroundColor:
                TYPE_COLORS[s.type] ?? "var(--color-surface-hover)",
              minWidth: s.pct > 0 ? "4px" : "0",
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {stats.map((s) => (
          <span
            key={s.type}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor:
                  TYPE_COLORS[s.type] ?? "var(--color-surface-hover)",
              }}
            />
            {s.type} {s.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Section label ──────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]"
    >
      {children}
    </p>
  );
}

// ─── Main component ─────────────────────────────────────────

export function TasteTab() {
  const [data, setData] = useState<PalateData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/palate");
        if (!res.ok) {
          setError("Failed to load palate data");
          return;
        }
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Failed to load palate data");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">{error}</p>
        <button
          onClick={() => {
            setError(null);
            setData(null);
            // Re-trigger fetch
            fetch("/api/palate")
              .then((r) => r.json())
              .then(setData)
              .catch(() => setError("Failed to load palate data"));
          }}
          className="text-xs font-semibold text-[var(--color-accent-secondary)] hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) {
    return <LoadingSkeleton />;
  }

  // ── Gated: not enough wines ──
  if (data.gated) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-5 px-6 text-center">
        <h2
          className="text-2xl font-light text-[var(--color-text-primary)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Almost there
        </h2>
        <p className="max-w-md text-sm text-[var(--color-text-secondary)]">
          {`Your palate profile unlocks at ${
            data.totalRated + data.entriesNeeded
          } rated wines — you've rated ${
            data.totalRated
          } so far. Wines logged without a rating don't count yet.`}
        </p>
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-[var(--color-surface-raised)]">
          <div
            className="h-full rounded-full bg-[var(--color-accent-secondary)] transition-[width]"
            style={{
              width: `${Math.min(
                100,
                Math.round(
                  (data.totalRated / (data.totalRated + data.entriesNeeded)) * 100
                )
              )}%`,
            }}
          />
        </div>
        <Link
          href="/entries/new"
          className="rounded-xl bg-[var(--color-accent-primary)] px-6 py-3 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-hover)]"
        >
          Log a wine
        </Link>
      </div>
    );
  }

  const {
    insights,
    topGrapes,
    regionStats,
    wineTypeStats,
    radarPoints,
    leansInto,
    avoids,
    topStyle,
    totalRated,
    regionCount,
    preferenceStrength,
    surveyFallback,
  } = data;

  // Map API radar points to SensoryRadarChart's expected shape
  const chartPoints = radarPoints.map((p) => ({
    key: p.key,
    label: p.label,
    wine: p.neutral as number | null,
    user: p.user as number | null,
  }));

  return (
    <div className="space-y-6">
      {/* ── Hero summary ── */}
      <header className="space-y-2">
        {topStyle ? (
          <h2
            className="text-[28px] leading-[34px] font-light text-[var(--color-text-primary)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Your style is{" "}
            <em className="text-[var(--color-accent-secondary)] not-italic">
              {topStyle}
            </em>
          </h2>
        ) : (
          <h2
            className="text-[28px] leading-[34px] font-light text-[var(--color-text-primary)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Your taste profile
          </h2>
        )}
        <p className="text-sm text-[var(--color-text-secondary)]">
          Based on {totalRated} rated wines across {regionCount}{" "}
          {regionCount === 1 ? "country" : "countries"}
        </p>
      </header>

      {/* ── Insights strip ── */}
      {insights.length > 0 && (
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
      )}

      {/* ── What you reach for ── */}
      <section className="grid gap-4 sm:grid-cols-2">
        {/* Top grapes */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] p-5 space-y-3">
          <SectionLabel>Top grapes</SectionLabel>
          {topGrapes.length > 0 ? (
            <div className="space-y-2">
              {topGrapes.map((grape, i) => (
                <div
                  key={grape.name}
                  className="flex items-center justify-between"
                >
                  <Link
                    href={grapeProfileUrl(grape.name)}
                    className={`text-sm transition hover:text-[var(--color-accent-secondary)] hover:underline ${
                      i === 0
                        ? "font-semibold text-[var(--color-text-primary)]"
                        : "text-[var(--color-text-secondary)]"
                    }`}
                  >
                    {grape.name}
                  </Link>
                  <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--color-text-tertiary)]">
                    {grape.count}
                  </span>
                </div>
              ))}
            </div>
          ) : surveyFallback && surveyFallback.varietals.length > 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">
              You said you love: {surveyFallback.varietals.join(", ")}
            </p>
          ) : (
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Log wines with grape tags to see patterns
            </p>
          )}
        </div>

        {/* Top regions */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] p-5 space-y-3">
          <SectionLabel>Top regions</SectionLabel>
          {regionStats.length > 0 ? (
            <div className="space-y-2">
              {regionStats.slice(0, 4).map((r, i) => (
                <div
                  key={r.region}
                  className="flex items-center justify-between gap-2"
                >
                  <Link
                    href={regionProfileUrl(r.region)}
                    className={`text-sm transition hover:text-[var(--color-accent-secondary)] hover:underline ${
                      i === 0
                        ? "font-semibold text-[var(--color-text-primary)]"
                        : "text-[var(--color-text-secondary)]"
                    }`}
                  >
                    {r.region}
                  </Link>
                  {r.delta > 0.5 ? (
                    <span className="text-[10px] font-semibold text-emerald-400">
                      +{Math.abs(r.delta).toFixed(1)} pts
                    </span>
                  ) : r.delta < -0.5 ? (
                    <span className="text-[10px] font-semibold text-[var(--color-text-tertiary)]">
                      -{Math.abs(r.delta).toFixed(1)} pts
                    </span>
                  ) : (
                    <span className="text-[10px] text-[var(--color-text-tertiary)]">
                      On par
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : surveyFallback && surveyFallback.regions.length > 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">
              You said you love: {surveyFallback.regions.join(", ")}
            </p>
          ) : (
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Log more wines to see regional patterns
            </p>
          )}
        </div>
      </section>

      {/* ── Wine type distribution ── */}
      {wineTypeStats.length > 0 && (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] p-5 space-y-3">
          <SectionLabel>What you drink</SectionLabel>
          <TypeBar stats={wineTypeStats} />
        </section>
      )}

      {/* ── Sensory signature ── */}
      {chartPoints.length > 0 && (
        <section className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,1.1fr)]">
            {/* Radar chart */}
            <SensoryRadarChart
              points={chartPoints}
              wineLabel="Neutral"
              userLabel={topStyle ? `Your palate` : "Your palate"}
            />

            {/* Standout axes */}
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] p-5 space-y-5">
              {leansInto.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-accent-secondary)]">
                    You lean into
                  </p>
                  {leansInto.map((a) => (
                    <SensoryBar
                      key={a.axis}
                      label={a.label}
                      value={a.value}
                    />
                  ))}
                </div>
              )}
              {avoids.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                    You tend to avoid
                  </p>
                  {avoids.map((a) => (
                    <SensoryBar
                      key={a.axis}
                      label={a.label}
                      value={a.value}
                    />
                  ))}
                </div>
              )}
              {leansInto.length === 0 && avoids.length === 0 && (
                <div>
                  <SectionLabel>Sensory signals</SectionLabel>
                  <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                    Log more wines with tasting details to see clear patterns
                    emerge
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

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
    </div>
  );
}
