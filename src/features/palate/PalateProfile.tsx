"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { grapeProfileUrl, regionProfileUrl } from "@shared";
import TasteMap, { AXIS_DESCRIPTIONS, personalRead, type TasteMapAxis } from "@/features/palate/TasteMap";
import WineGlassConfidence from "@/features/palate/WineGlassConfidence";
import Button from "@/components/ui/Button";

// Auto-distillation (item 5): the palate page is the trigger point for the
// expensive "master somm reads your history" step — nothing else calls it
// automatically. ensurePalateProfile (server side, POST /api/palate/distill)
// already no-ops when the signal is unchanged and the cache is fresh, so it's
// safe to fire this on every page load once there's enough signal; the route's
// own rate limit is the cost guard.
const AUTO_DISTILL_MIN_ENTRIES = 5;
const AUTO_DISTILL_POLL_INTERVAL_MS = 4000;
const AUTO_DISTILL_MAX_WAIT_MS = 90_000;

// "Profile confidence" full-mark (src/lib/algorithm/matchUi.ts
// describePreferenceStrength): progress reaches 100 at 18 detailed entries.
// Not to be confused with SURVEY_FADE_THRESHOLD (15) in
// src/server/algorithm/constants.ts, which fades survey seeds in the scoring
// engine — a related but distinct threshold. This is the one that actually
// drives the confidence UI already shipping, so the glass stays consistent
// with it.
const FULL_CONFIDENCE_ENTRIES = 18;

// ─── Colors (wine-type swatches) ────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  Red: "#7B1D3A",
  White: "#C9A84C",
  Sparkling: "#7C8FE6",
  "Rosé": "#C4607A",
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
  tasteMap: TasteMapAxis[];
  leansInto: StandoutAxis[];
  avoids: StandoutAxis[];
  insights: string[];
  surveyFallback: { varietals: string[]; regions: string[] } | null;
};

type SommProfile = {
  narrative: string;
  wine_types: {
    wine_type: string;
    narrative: string;
    favored_varietals: string[];
    favored_regions: string[];
  }[];
};

// ─── Small UI helpers ───────────────────────────────────────
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-[var(--color-surface-hover)] ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-2/3" />
      </div>
      <div className="rounded-3xl border border-[var(--color-border)] p-6">
        <Skeleton className="mx-auto h-72 w-72 rounded-full" />
      </div>
      <div className="rounded-2xl border border-[var(--color-border)] p-5 space-y-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
      {children}
    </p>
  );
}

// Tappable — mirrors the TasteMap berries' "teach on tap" behavior so the
// lean-into/avoid chips aren't a dead end. `onSelect` opens the shared
// AxisDetailCard beneath the section; `selected` gets a subtle highlight.
function SensoryBar({
  axis,
  label,
  value,
  max = 5,
  selected = false,
  onSelect,
}: {
  axis: string;
  label: string;
  value: number;
  max?: number;
  selected?: boolean;
  onSelect?: (axis: string) => void;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const isHigh = value >= 3.8;
  return (
    <button
      type="button"
      onClick={() => onSelect?.(axis)}
      aria-pressed={onSelect ? selected : undefined}
      className={`w-full space-y-1 rounded-lg text-left transition ${
        onSelect ? "cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/35" : ""
      } ${selected ? "ring-2 ring-[var(--color-accent-secondary)]/50" : ""}`}
    >
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--color-text-secondary)]">{label}</span>
        <span
          className={`font-semibold tabular-nums ${
            isHigh ? "text-[var(--color-accent-secondary)]" : "text-[var(--color-text-primary)]"
          }`}
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {value.toFixed(1)}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--color-surface-hover)]">
        <div
          className={`h-full rounded-full transition-all ${
            isHigh ? "bg-[var(--color-accent-secondary)]" : "bg-[var(--color-accent-primary)]"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </button>
  );
}

// Same compact card pattern as TasteMap's interactive berry detail — personal
// read + brand-voice axis description, no modal. Shared by the lean-into and
// avoid sections so tapping either kind of chip teaches the same way.
function AxisDetailCard({
  axis,
  label,
  value,
  confidence,
  onClose,
}: {
  axis: string;
  label: string;
  value: number;
  confidence: number;
  onClose: () => void;
}) {
  return (
    <div className="relative rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/25 px-4 py-3.5">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close axis detail"
        className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/40"
      >
        <span aria-hidden="true">×</span>
      </button>
      <p className="pr-6 text-[15px] leading-tight text-[var(--color-text-primary)]" style={{ fontFamily: "var(--font-serif)" }}>
        {label}
      </p>
      <p className="mt-1.5 text-[12.5px] font-medium leading-snug text-[var(--color-accent-secondary)]">
        {personalRead(label, value, confidence)}
      </p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-text-secondary)]">
        {AXIS_DESCRIPTIONS[axis] ?? ""}
      </p>
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
              backgroundColor: TYPE_COLORS[s.type] ?? "var(--color-surface-hover)",
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
              style={{ backgroundColor: TYPE_COLORS[s.type] ?? "var(--color-surface-hover)" }}
            />
            {s.type} {s.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Somm narrative block ───────────────────────────────────
// "ready" isn't tracked as its own state — `somm` being non-null already
// means ready, so SommNarrative branches on `somm` first and only consults
// this for what to show while there's no narrative yet.
type DistillStatus = "idle" | "pending" | "timeout";

function SommReadingIndicator() {
  return (
    <div
      className="mt-4 flex items-center gap-2.5 text-[15px] italic leading-[1.6] text-[var(--color-text-secondary)] sm:text-[17px]"
      style={{ fontFamily: "var(--font-serif)" }}
      role="status"
      aria-label="The somm is reading your palate"
    >
      <span>The somm is reading your palate…</span>
      <span className="inline-flex items-center gap-1" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-accent-secondary)]/80"
            style={{ animationDelay: `${index * 180}ms` }}
          />
        ))}
      </span>
    </div>
  );
}

function SommNarrative({
  somm,
  hasSurvey,
  totalRated,
  distillStatus,
}: {
  somm: SommProfile | null;
  hasSurvey: boolean;
  totalRated: number;
  distillStatus: DistillStatus;
}) {
  return (
    <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-6 sm:p-7">
      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-accent-secondary)]">
        Your palate, read by the somm
      </p>
      {somm ? (
        <>
          <p
            className="mt-4 text-[19px] leading-[1.6] text-[var(--color-text-primary)] sm:text-[21px]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {somm.narrative}
          </p>
          {somm.wine_types.length > 0 && somm.wine_types[0].narrative ? (
            <div className="mt-5 border-t border-[var(--color-border)] pt-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                On {somm.wine_types[0].wine_type.toLowerCase()}
              </p>
              <p
                className="mt-2 text-[16px] leading-[1.6] text-[var(--color-text-secondary)]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {somm.wine_types[0].narrative}
              </p>
            </div>
          ) : null}
        </>
      ) : distillStatus === "pending" ? (
        <SommReadingIndicator />
      ) : distillStatus === "timeout" ? (
        <p
          className="mt-4 text-[19px] leading-[1.6] text-[var(--color-text-primary)] sm:text-[21px]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          The somm is taking a little longer than usual with your palate — check back in a bit.
        </p>
      ) : (
        <>
          <p
            className="mt-4 text-[19px] leading-[1.6] text-[var(--color-text-primary)] sm:text-[21px]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {totalRated >= 8
              ? "Your somm is still reading the room. Keep logging pours and your palate portrait will take shape here — in words, not just numbers."
              : "The somm hasn't met your palate yet. A few honest pours — or the taste quiz — and they'll start writing your story."}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button href="/entries/new" variant="primary" size="sm">
              Log a pour
            </Button>
            {!hasSurvey ? (
              <Button href="/taste-survey" variant="secondary" size="sm">
                Take the taste quiz
              </Button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

// ─── Main component ─────────────────────────────────────────
export default function PalateProfile() {
  const [data, setData] = useState<PalateData | null>(null);
  const [somm, setSomm] = useState<SommProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [distillTimedOut, setDistillTimedOut] = useState(false);
  const [selectedAxis, setSelectedAxis] = useState<string | null>(null);
  const distillTriggeredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [palateRes, sommRes] = await Promise.all([
          fetch("/api/palate"),
          fetch("/api/palate/distill").catch(() => null),
        ]);
        if (!palateRes.ok) {
          if (!cancelled) setError("Failed to load palate data");
          return;
        }
        const json = (await palateRes.json()) as PalateData;
        if (!cancelled) setData(json);
        if (sommRes && sommRes.ok) {
          const sJson = (await sommRes.json()) as { profile: SommProfile | null };
          if (!cancelled) setSomm(sJson.profile ?? null);
        }
      } catch {
        if (!cancelled) setError("Failed to load palate data");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-distillation (item 5 / Ethan's bug): "Your palate, read by the somm"
  // never filled because nothing ever called the distill endpoint — it was
  // POST-only, manual. Once we know the user has enough signal and there's
  // no distilled profile yet, kick off a background refresh and poll for the
  // result. ensurePalateProfile (server side) already handles the
  // hash/staleness check and no-ops when the cache is fresh, and the route
  // is rate-limited — so firing this fire-and-forget on every qualifying
  // page load is safe and cheap. We never distill inline on a request path;
  // this only ever calls the existing POST/GET /api/palate/distill routes.
  //
  // No "pending" state is set here directly — the "pending" UI is *derived*
  // from (data loaded, no somm yet, enough signal, not timed out) below, so
  // this effect only ever calls setState from inside async callbacks
  // (fetch .then / setTimeout), never synchronously in the effect body.
  useEffect(() => {
    if (!data || somm || distillTriggeredRef.current) return;
    if (data.totalRated < AUTO_DISTILL_MIN_ENTRIES) return;
    distillTriggeredRef.current = true;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

    // Fire-and-forget — we don't need the response body, only its side
    // effect (writing/refreshing the cached profile row).
    fetch("/api/palate/distill", { method: "POST" }).catch(() => {
      // Best-effort; the poll loop below will simply time out if this failed
      // (e.g. rate-limited or Anthropic not configured).
    });

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/palate/distill");
        if (res.ok) {
          const json = (await res.json()) as { profile: SommProfile | null };
          if (json.profile) {
            if (!cancelled) setSomm(json.profile);
            return;
          }
        }
      } catch {
        // Ignore — retry on the next tick until the timeout.
      }
      if (cancelled) return;
      if (Date.now() - startedAt >= AUTO_DISTILL_MAX_WAIT_MS) {
        setDistillTimedOut(true);
        return;
      }
      pollTimer = setTimeout(poll, AUTO_DISTILL_POLL_INTERVAL_MS);
    };

    pollTimer = setTimeout(poll, AUTO_DISTILL_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [data, somm]);

  if (error) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">{error}</p>
        <button
          onClick={() => {
            setError(null);
            setData(null);
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

  if (!data) return <LoadingSkeleton />;

  // ── Gated: not enough wines ──
  if (data.gated) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-5 px-6 text-center">
        <h2
          className="text-3xl font-light text-[var(--color-text-primary)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Your taste map is forming
        </h2>
        <p className="max-w-md text-sm text-[var(--color-text-secondary)]">
          {`It unlocks at ${data.totalRated + data.entriesNeeded} rated wines — you've rated ${
            data.totalRated
          } so far. Every honest pour sharpens the picture.`}
        </p>
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-[var(--color-surface-raised)]">
          <div
            className="h-full rounded-full bg-[var(--color-accent-secondary)] transition-[width]"
            style={{
              width: `${Math.min(
                100,
                Math.round((data.totalRated / (data.totalRated + data.entriesNeeded)) * 100)
              )}%`,
            }}
          />
        </div>
        <Link
          href="/entries/new"
          className="rounded-full bg-[var(--color-accent-primary)] px-6 py-3 text-sm font-medium text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-hover)]"
        >
          Log a wine
        </Link>
      </div>
    );
  }

  const {
    topGrapes,
    regionStats,
    wineTypeStats,
    tasteMap,
    leansInto,
    avoids,
    topStyle,
    totalRated,
    regionCount,
    preferenceStrength,
    surveyFallback,
  } = data;

  // Derived, not stored: "pending" just means we've kicked off the
  // background distill (see the effect above) and are still waiting on it.
  const distillStatus: DistillStatus = distillTimedOut
    ? "timeout"
    : totalRated >= AUTO_DISTILL_MIN_ENTRIES
      ? "pending"
      : "idle";

  return (
    <div className="space-y-7">
      {/* ── Hero headline ── */}
      <header className="space-y-2">
        {topStyle ? (
          <h2
            className="text-[30px] leading-[1.1] font-light text-[var(--color-text-primary)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Your style is{" "}
            <em className="not-italic text-[var(--color-accent-secondary)]">{topStyle}</em>
          </h2>
        ) : (
          <h2
            className="text-[30px] leading-[1.1] font-light text-[var(--color-text-primary)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Your taste map
          </h2>
        )}
        <p className="text-sm text-[var(--color-text-secondary)]">
          Read across {totalRated} rated {totalRated === 1 ? "wine" : "wines"} and {regionCount}{" "}
          {regionCount === 1 ? "country" : "countries"}
        </p>
      </header>

      {/* ── The TasteMap — leads the page ── */}
      {tasteMap.length > 0 ? (
        <section className="rounded-3xl border border-[var(--color-border)] bg-gradient-to-b from-[var(--color-surface-primary)]/25 to-[var(--color-surface-primary)]/5 px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto max-w-[380px]">
            <TasteMap
              axes={tasteMap}
              variant="full"
              interactive
              caption={
                <p className="mx-auto max-w-sm text-center text-[11px] leading-relaxed text-[var(--color-text-tertiary)]">
                  Tap a berry to see what it means. Distance from centre is how far you
                  lean into each note — bigger, brighter berries are the ones
                  we&apos;re most sure of.
                </p>
              }
            />
          </div>
        </section>
      ) : null}

      {/* ── Somm narrative ── */}
      <SommNarrative
        somm={somm}
        hasSurvey={data.hasSurvey}
        totalRated={totalRated}
        distillStatus={distillStatus}
      />

      {/* ── Lean into / avoid ──
          Chips teach like the TasteMap berries: tapping one opens the same
          compact detail card (personal read + axis description) instead of
          just sitting there as a static bar. Per-axis confidence comes from
          the same tasteMap array the TasteMap component itself renders from,
          so the read matches exactly. */}
      {(leansInto.length > 0 || avoids.length > 0) && (
        <section className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            {leansInto.length > 0 ? (
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-5 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-accent-secondary)]">
                  You lean into
                </p>
                {leansInto.map((a) => (
                  <SensoryBar
                    key={a.axis}
                    axis={a.axis}
                    label={a.label}
                    value={a.value}
                    selected={selectedAxis === a.axis}
                    onSelect={(axis) => setSelectedAxis((cur) => (cur === axis ? null : axis))}
                  />
                ))}
              </div>
            ) : null}
            {avoids.length > 0 ? (
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-5 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                  You tend to avoid
                </p>
                {avoids.map((a) => (
                  <SensoryBar
                    key={a.axis}
                    axis={a.axis}
                    label={a.label}
                    value={a.value}
                    selected={selectedAxis === a.axis}
                    onSelect={(axis) => setSelectedAxis((cur) => (cur === axis ? null : axis))}
                  />
                ))}
              </div>
            ) : null}
          </div>
          {(() => {
            const selected =
              selectedAxis != null
                ? ([...leansInto, ...avoids].find((a) => a.axis === selectedAxis) ?? null)
                : null;
            if (!selected) return null;
            const confidence = tasteMap.find((t) => t.axis === selected.axis)?.confidence ?? 0.5;
            return (
              <AxisDetailCard
                axis={selected.axis}
                label={selected.label}
                value={selected.value}
                confidence={confidence}
                onClose={() => setSelectedAxis(null)}
              />
            );
          })()}
        </section>
      )}

      {/* ── Grapes + regions ── */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-5 space-y-3">
          <SectionLabel>Top grapes</SectionLabel>
          {topGrapes.length > 0 ? (
            <div className="space-y-2">
              {topGrapes.map((grape, i) => (
                <div key={grape.name} className="flex items-center justify-between">
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
                  <span
                    className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--color-text-tertiary)]"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
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

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-5 space-y-3">
          <SectionLabel>Top regions</SectionLabel>
          {regionStats.length > 0 ? (
            <div className="space-y-2">
              {regionStats.slice(0, 4).map((r, i) => (
                <div key={r.region} className="flex items-center justify-between gap-2">
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
                    <span className="text-[11px] font-semibold tabular-nums text-[var(--color-accent-secondary)]">
                      +{Math.abs(r.delta).toFixed(1)}
                    </span>
                  ) : r.delta < -0.5 ? (
                    <span className="text-[11px] font-semibold tabular-nums text-[var(--color-text-tertiary)]">
                      -{Math.abs(r.delta).toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-[11px] text-[var(--color-text-tertiary)]">On par</span>
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
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-5 space-y-3">
          <SectionLabel>What you drink</SectionLabel>
          <TypeBar stats={wineTypeStats} />
        </section>
      )}

      {/* ── Confidence footer — a filling wine glass ──
          Fill level mirrors preferenceStrength.progress (0-100), the same
          number that already drives the "Profile confidence" label — see
          FULL_CONFIDENCE_ENTRIES above for why that's 18, not the
          SURVEY_FADE_THRESHOLD (15) from the scoring engine. The countdown
          caption is an approximation back from that rounded progress
          percentage — close enough for a motivational nudge, not meant to
          be exact. */}
      <div className="flex items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-tinted)] px-5 py-3">
        <WineGlassConfidence progress={preferenceStrength.progress} />
        <div className="flex-1">
          <p className="text-xs font-semibold text-[var(--color-text-primary)]">
            Profile confidence: {preferenceStrength.label}
          </p>
          <p className="mt-0.5 text-[11px] italic text-[var(--color-text-tertiary)]">
            {(() => {
              if (preferenceStrength.progress >= 100) {
                return "I've got a real read on your palate now.";
              }
              const remaining = Math.max(
                1,
                Math.round(((100 - preferenceStrength.progress) / 100) * FULL_CONFIDENCE_ENTRIES)
              );
              return remaining === 1
                ? "One more pour and I'll really know you."
                : `${remaining} more pours and I'll really know you.`;
            })()}
          </p>
        </div>
      </div>
    </div>
  );
}
