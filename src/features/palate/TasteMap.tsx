"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * TasteMap — Cluster's signature palate visualization.
 *
 * A radial "orbital constellation" built from the brand's overlapping grape-circle
 * geometry rather than a generic chart-library radar. Sixteen sensory axes are laid
 * out as berries orbiting a central grape cluster, grouped into five families around
 * the wheel. Each berry encodes two things at once:
 *   - distance from centre  → how strongly the palate leans into that axis (1–5)
 *   - size + opacity        → how confident we are in that reading
 * A translucent "palate shape" web connects the berries. An optional second series
 * (e.g. a specific wine on the entry-detail screen) is drawn as a dashed outline so
 * you can read a wine's fit against your palate at a glance.
 *
 * Pure hand-rolled SVG. Entrance animation is CSS-only (stroke draw + staggered
 * berry pop) and respects prefers-reduced-motion. Dark-theme colours come from the
 * existing token palette.
 */

// ── Axis taxonomy ──────────────────────────────────────────────
// Order matters: axes are laid out around the wheel in family-contiguous arcs so
// grouping reads spatially. Colours stay inside the warm brand range (gold is
// reserved for the "Quality" family — a legitimately premium signal).

export type TasteGroupKey =
  | "structure"
  | "flavor"
  | "aromatics"
  | "earth"
  | "quality";

type GroupMeta = { label: string; color: string };

const GROUP_META: Record<TasteGroupKey, GroupMeta> = {
  structure: { label: "Structure", color: "#7B1D3A" }, // grenache
  flavor: { label: "Flavor", color: "#C4607A" }, // rose
  aromatics: { label: "Aromatics", color: "#8E6FB0" }, // lifted purple
  earth: { label: "Earth", color: "#A08878" }, // fog
  quality: { label: "Quality", color: "#C9A84C" }, // gold — premium, earned
};

const GROUP_ORDER: TasteGroupKey[] = [
  "structure",
  "flavor",
  "aromatics",
  "earth",
  "quality",
];

// axis → { group, short label } — lets the component stay robust even when callers
// only hand it { axis, value, confidence }.
const AXIS_META: Record<string, { group: TasteGroupKey; label: string }> = {
  body: { group: "structure", label: "Body" },
  acidity: { group: "structure", label: "Acidity" },
  tannin: { group: "structure", label: "Tannin" },
  alcohol_perception: { group: "structure", label: "Warmth" },
  fruit_ripeness: { group: "flavor", label: "Fruit" },
  sweetness_perception: { group: "flavor", label: "Sweetness" },
  bitterness_phenolic_grip: { group: "flavor", label: "Grip" },
  aromatic_intensity: { group: "aromatics", label: "Aromatics" },
  oak_presence: { group: "aromatics", label: "Oak" },
  earthy: { group: "earth", label: "Earth" },
  mineral: { group: "earth", label: "Mineral" },
  savory: { group: "earth", label: "Savory" },
  finish_length: { group: "quality", label: "Finish" },
  concentration: { group: "quality", label: "Concentration" },
  complexity: { group: "quality", label: "Complexity" },
  freshness: { group: "quality", label: "Freshness" },
};

// Warm, concrete, zero-snobbery descriptions of what each axis actually
// tastes/feels like — shown in the tap-to-explore detail card (variant
// "full", interactive). One sentence, sensory language, brand voice.
const AXIS_DESCRIPTIONS: Record<string, string> = {
  body: "How much weight the wine carries on your tongue — light as skim milk or full as cream.",
  acidity:
    "The mouthwatering zing that keeps a wine lively — the difference between a squeeze of lemon and a ripe peach.",
  tannin:
    "The dry, gripping texture from grape skins and seeds — that feeling of your tongue sticking a little after a sip of black tea.",
  alcohol_perception:
    "The warming glow alcohol leaves behind — a gentle hum versus a hot finish that lingers in your throat.",
  fruit_ripeness:
    "Where the fruit sits on the ripeness spectrum — tart red berries versus jammy, sun-baked dark fruit.",
  sweetness_perception:
    "How much sugar you actually taste — bone-dry with nothing left over, or a noticeable touch of sweetness.",
  bitterness_phenolic_grip:
    "The bitter, gripping edge on the finish — think grapefruit pith or walnut skin catching the back of your tongue.",
  aromatic_intensity:
    "How loudly the wine announces itself before you even taste it — a quiet whisper or a perfume that fills the glass.",
  oak_presence:
    "The vanilla, toast, and baking-spice notes barrel aging leaves behind — none at all versus a wine that tastes like it grew up in a cellar.",
  earthy:
    "Forest-floor, mushroom, wet-stone notes — the smell of a walk through the woods after rain.",
  mineral: "A flinty, stony edge — like licking a wet rock or striking a match.",
  savory:
    "Umami, herbal, or meaty notes that pull a wine away from pure fruit — think olive brine, dried herbs, or a whiff of leather.",
  finish_length:
    "How long the flavor lingers after you swallow — gone in a blink or still humming a minute later.",
  concentration:
    "How densely packed the flavors feel — a whisper of fruit versus a mouth-filling wave.",
  complexity:
    "How many different things are happening in the glass at once — a simple one-note sip or a wine that keeps revealing something new.",
  freshness:
    "The crisp, energetic lift that makes a wine feel alive — cool and vibrant versus soft and settled.",
};

/**
 * Personal-read phrasing bands (spec): value bands describe lean direction
 * and strength; a confidence floor overrides everything else because a
 * strong-sounding claim on thin evidence is worse than no claim.
 */
function personalRead(label: string, value: number, confidence: number): string {
  if (confidence < 0.3) {
    return "We're still reading you on this one.";
  }
  const lower = label.toLowerCase();
  if (value >= 4) return `You lean strongly toward high ${lower}.`;
  if (value >= 3.5) return `You lean toward high ${lower}.`;
  if (value >= 2.5) return `You're right in the middle on ${lower} — no strong pull either way.`;
  if (value >= 2) return `You tend to avoid ${lower}.`;
  return `You tend to strongly avoid ${lower}.`;
}

// Canonical wheel order (family-contiguous).
const AXIS_ORDER = [
  "body",
  "acidity",
  "tannin",
  "alcohol_perception",
  "fruit_ripeness",
  "sweetness_perception",
  "bitterness_phenolic_grip",
  "aromatic_intensity",
  "oak_presence",
  "earthy",
  "mineral",
  "savory",
  "finish_length",
  "concentration",
  "complexity",
  "freshness",
];

// ── Public types ───────────────────────────────────────────────

export type TasteMapAxis = {
  axis: string;
  value: number; // 1–5
  confidence?: number; // 0–1
  label?: string;
  group?: TasteGroupKey;
};

export type TasteMapProps = {
  /** The primary palate series (usually the user's palate). */
  axes: TasteMapAxis[];
  /** Optional secondary series drawn as a dashed outline (e.g. a specific wine). */
  compareAxes?: TasteMapAxis[];
  size?: number;
  variant?: "full" | "card";
  animate?: boolean;
  showLegend?: boolean;
  showAxisLabels?: boolean;
  /** Legend labels when a compare series is present. */
  primaryLabel?: string;
  compareLabel?: string;
  /** Accessible summary. A sensible one is generated if omitted. */
  title?: string;
  className?: string;
  /**
   * Lets berries be tapped/focused to open a compact per-axis detail card
   * (personal read + brand-voice description) beneath the map. Only takes
   * effect on variant="full" — the "card" variant (used inside links/
   * ambient surfaces) always stays inert regardless of this prop.
   */
  interactive?: boolean;
  /** Shown in the fixed detail slot beneath the map when nothing is selected. */
  caption?: ReactNode;
};

// ── Geometry helpers ───────────────────────────────────────────

const SCALE_MIN = 1;
const SCALE_MAX = 5;

/** Value → fraction of the outer radius (1 sits near centre, 5 at the rim). */
function valueFraction(value: number) {
  const clamped = Math.max(SCALE_MIN, Math.min(SCALE_MAX, value));
  return 0.15 + ((clamped - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 0.85;
}

function angleFor(index: number, total: number) {
  return (-90 + (index * 360) / total) * (Math.PI / 180);
}

function pointOnCircle(cx: number, cy: number, radius: number, angle: number) {
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
}

/** SVG arc path between two angles at a fixed radius. */
function arcPath(cx: number, cy: number, radius: number, a0: number, a1: number) {
  const start = pointOnCircle(cx, cy, radius, a0);
  const end = pointOnCircle(cx, cy, radius, a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

/** Order + normalise incoming axes onto the canonical 16-slot wheel. */
function normaliseAxes(input: TasteMapAxis[]) {
  const byAxis = new Map(input.map((a) => [a.axis, a]));
  return AXIS_ORDER.map((axisKey) => {
    const found = byAxis.get(axisKey);
    const meta = AXIS_META[axisKey];
    return {
      axis: axisKey,
      label: found?.label ?? meta?.label ?? axisKey,
      group: (found?.group ?? meta?.group ?? "structure") as TasteGroupKey,
      value:
        typeof found?.value === "number" && !Number.isNaN(found.value)
          ? Math.max(SCALE_MIN, Math.min(SCALE_MAX, found.value))
          : 3,
      confidence:
        typeof found?.confidence === "number"
          ? Math.max(0, Math.min(1, found.confidence))
          : 0.5,
    };
  });
}

function polygonPoints(
  values: number[],
  cx: number,
  cy: number,
  radius: number
) {
  return values
    .map((value, i) => {
      const p = pointOnCircle(cx, cy, radius * valueFraction(value), angleFor(i, values.length));
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    })
    .join(" ");
}

function polygonPerimeter(
  values: number[],
  cx: number,
  cy: number,
  radius: number
) {
  const pts = values.map((value, i) =>
    pointOnCircle(cx, cy, radius * valueFraction(value), angleFor(i, values.length))
  );
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

// ── Component ──────────────────────────────────────────────────

export default function TasteMap({
  axes,
  compareAxes,
  size,
  variant = "full",
  animate = true,
  showLegend,
  showAxisLabels,
  primaryLabel = "Your palate",
  compareLabel = "This wine",
  title,
  className = "",
  interactive = false,
  caption,
}: TasteMapProps) {
  const uid = useId().replace(/:/g, "");
  const isCard = variant === "card";
  // The "card" variant is used inside ambient links/previews — it never
  // becomes interactive, no matter what the caller passes.
  const isInteractive = interactive && !isCard;
  const [selectedAxis, setSelectedAxis] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dim = size ?? (isCard ? 168 : 340);
  const showLabels = showAxisLabels ?? !isCard;
  const withLegend = showLegend ?? (!isCard && !compareAxes);

  const selectAxis = (axisKey: string) => {
    setSelectedAxis((current) => (current === axisKey ? null : axisKey));
  };

  // Tap/click outside the map dismisses the open detail card.
  useEffect(() => {
    if (!isInteractive || !selectedAxis) return;
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setSelectedAxis(null);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isInteractive, selectedAxis]);

  const cx = dim / 2;
  const cy = dim / 2;
  // Reserve room for outer labels on the full variant.
  const pad = isCard ? dim * 0.06 : dim * (showLabels ? 0.19 : 0.08);
  const radius = cx - pad;

  const data = useMemo(() => normaliseAxes(axes), [axes]);
  const compareData = useMemo(
    () => (compareAxes && compareAxes.length > 0 ? normaliseAxes(compareAxes) : null),
    [compareAxes]
  );
  const selectedData = isInteractive
    ? (data.find((d) => d.axis === selectedAxis) ?? null)
    : null;

  const values = data.map((d) => d.value);
  const webPoints = polygonPoints(values, cx, cy, radius);
  const perimeter = Math.ceil(polygonPerimeter(values, cx, cy, radius));

  const comparePoints = compareData
    ? polygonPoints(
        compareData.map((d) => d.value),
        cx,
        cy,
        radius
      )
    : null;

  // Scale rings at values 2/3/4/5; the neutral (3) ring is emphasised.
  const ringValues = [2, 3, 4, 5];

  // Family arc spans.
  const familyArcs = GROUP_ORDER.map((groupKey) => {
    const indices = data
      .map((d, i) => (d.group === groupKey ? i : -1))
      .filter((i) => i >= 0);
    if (indices.length === 0) return null;
    const first = indices[0];
    const last = indices[indices.length - 1];
    const gap = 4 * (Math.PI / 180);
    const a0 = angleFor(first, 16) - 11.25 * (Math.PI / 180) + gap;
    const a1 = angleFor(last, 16) + 11.25 * (Math.PI / 180) - gap;
    return { groupKey, path: arcPath(cx, cy, radius + (isCard ? 3 : 8), a0, a1) };
  }).filter(Boolean) as { groupKey: TasteGroupKey; path: string }[];

  // Accessible summary.
  const strongest = [...data]
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((d) => d.label);
  const autoTitle =
    title ??
    `Palate taste map across 16 sensory axes. Leans most into ${strongest.join(", ")}.`;

  const berryBase = isCard ? 1.7 : 3;
  const berryRange = isCard ? 2.3 : 4.2;
  const centerMark = radius * 0.075;

  const styleTag = `
    @keyframes tm-${uid}-draw { from { stroke-dashoffset: var(--tm-perim); } to { stroke-dashoffset: 0; } }
    @keyframes tm-${uid}-fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes tm-${uid}-pop { from { opacity: 0; transform: scale(0.2); } to { opacity: 1; transform: scale(1); } }
    @keyframes tm-${uid}-card-swap { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
    .tm-${uid}-web { stroke-dasharray: var(--tm-perim); ${animate ? `animation: tm-${uid}-draw 1100ms cubic-bezier(.2,.8,.2,1) forwards;` : "stroke-dashoffset: 0;"} }
    .tm-${uid}-fill { ${animate ? `opacity: 0; animation: tm-${uid}-fade 900ms ease 500ms forwards;` : "opacity: 1;"} }
    .tm-${uid}-cmp { ${animate ? `opacity: 0; animation: tm-${uid}-fade 800ms ease 300ms forwards;` : "opacity: 1;"} }
    .tm-${uid}-static { ${animate ? `opacity: 0; animation: tm-${uid}-fade 700ms ease forwards;` : "opacity: 1;"} }
    .tm-${uid}-berry { transform-box: fill-box; transform-origin: center; ${animate ? `opacity: 0; animation: tm-${uid}-pop 520ms cubic-bezier(.2,1.1,.3,1) forwards;` : "opacity: 1;"} }
    .tm-${uid}-node { transform-box: fill-box; transform-origin: center; outline: none; transition: transform var(--motion-duration-standard) var(--motion-ease-standard), opacity var(--motion-duration-standard) var(--motion-ease-standard); }
    .tm-${uid}-node:focus { outline: none; }
    .tm-${uid}-node:focus-visible { outline: 2px solid var(--color-accent-secondary); outline-offset: 3px; border-radius: 50%; }
    .tm-${uid}-ring { transition: opacity var(--motion-duration-standard) var(--motion-ease-standard), transform var(--motion-duration-standard) var(--motion-ease-standard); transform-box: fill-box; transform-origin: center; }
    .tm-${uid}-card { animation: tm-${uid}-card-swap var(--motion-duration-standard) var(--motion-ease-standard); }
    @media (prefers-reduced-motion: reduce) {
      .tm-${uid}-web, .tm-${uid}-fill, .tm-${uid}-cmp, .tm-${uid}-static, .tm-${uid}-berry, .tm-${uid}-card {
        animation: none !important; opacity: 1 !important; stroke-dashoffset: 0 !important; transform: none !important;
      }
      .tm-${uid}-node, .tm-${uid}-ring {
        transition: none !important;
      }
    }
  `;

  return (
    <div className={className} ref={rootRef}>
      <style dangerouslySetInnerHTML={{ __html: styleTag }} />
      <svg
        viewBox={`0 0 ${dim} ${dim}`}
        width="100%"
        role="img"
        aria-labelledby={`${uid}-title ${uid}-desc`}
        style={{ display: "block", overflow: "visible", maxWidth: dim }}
      >
        <title id={`${uid}-title`}>Your palate taste map</title>
        <desc id={`${uid}-desc`}>
          {autoTitle}
          {compareData ? ` The dashed outline shows ${compareLabel}.` : ""}
        </desc>

        <defs>
          <radialGradient id={`${uid}-fill`} cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor="#C4607A" stopOpacity="0.34" />
            <stop offset="55%" stopColor="#7B1D3A" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#7B1D3A" stopOpacity="0.05" />
          </radialGradient>
        </defs>

        {/* Guide orbits */}
        {ringValues.map((rv) => {
          const isNeutral = rv === 3;
          return (
            <circle
              key={`ring-${rv}`}
              className={`tm-${uid}-static`}
              cx={cx}
              cy={cy}
              r={radius * valueFraction(rv)}
              fill="none"
              stroke={isNeutral ? "rgba(196,96,122,0.22)" : "rgba(196,96,122,0.10)"}
              strokeWidth={isNeutral ? 1.1 : 0.8}
              strokeDasharray={isNeutral ? "none" : "2 4"}
              style={{ animationDelay: "40ms" }}
            />
          );
        })}

        {/* Spokes */}
        {data.map((d, i) => {
          const end = pointOnCircle(cx, cy, radius, angleFor(i, 16));
          return (
            <line
              key={`spoke-${d.axis}`}
              className={`tm-${uid}-static`}
              x1={cx}
              y1={cy}
              x2={end.x}
              y2={end.y}
              stroke="rgba(196,96,122,0.07)"
              strokeWidth={0.6}
              style={{ animationDelay: "60ms" }}
            />
          );
        })}

        {/* Family arcs */}
        {familyArcs.map(({ groupKey, path }) => (
          <path
            key={`arc-${groupKey}`}
            className={`tm-${uid}-static`}
            d={path}
            fill="none"
            stroke={GROUP_META[groupKey].color}
            strokeOpacity={0.5}
            strokeWidth={isCard ? 1.4 : 2.4}
            strokeLinecap="round"
            style={{ animationDelay: "120ms" }}
          />
        ))}

        {/* Compare series (e.g. this wine) — dashed outline */}
        {comparePoints ? (
          <polygon
            className={`tm-${uid}-cmp`}
            points={comparePoints}
            fill="none"
            stroke="#F5EDD6"
            strokeOpacity={0.62}
            strokeWidth={isCard ? 1.3 : 1.7}
            strokeDasharray="4 4"
            strokeLinejoin="round"
          />
        ) : null}

        {/* Palate shape — fill + drawn stroke */}
        <polygon
          className={`tm-${uid}-fill`}
          points={webPoints}
          fill={`url(#${uid}-fill)`}
          stroke="none"
        />
        <polygon
          className={`tm-${uid}-web`}
          points={webPoints}
          fill="none"
          stroke="#C4607A"
          strokeWidth={isCard ? 1.6 : 2.2}
          strokeLinejoin="round"
          style={{ ["--tm-perim" as string]: `${perimeter}` }}
        />

        {/* Central grape-cluster mark */}
        <g
          className={`tm-${uid}-static`}
          style={{ animationDelay: "220ms" }}
          aria-hidden
        >
          <circle cx={cx} cy={cy - centerMark * 0.5} r={centerMark} fill="#C4607A" fillOpacity={0.85} />
          <circle cx={cx - centerMark * 0.85} cy={cy + centerMark * 0.7} r={centerMark} fill="#7B1D3A" fillOpacity={0.8} />
          <circle cx={cx + centerMark * 0.85} cy={cy + centerMark * 0.7} r={centerMark} fill="#7B1D3A" fillOpacity={0.65} />
        </g>

        {/* Berries — one per axis */}
        {data.map((d, i) => {
          const angle = angleFor(i, 16);
          const p = pointOnCircle(cx, cy, radius * valueFraction(d.value), angle);
          const r = berryBase + d.confidence * berryRange;
          const opacity = 0.35 + d.confidence * 0.5;
          const isReserve = d.value >= 4.2;
          const color = GROUP_META[d.group].color;
          const isSelected = selectedAxis === d.axis;
          const isDimmed = isInteractive && selectedAxis !== null && !isSelected;
          const nodeLabel = `${d.label}: ${d.value.toFixed(1)} of 5${
            d.confidence < 0.3 ? ", limited data" : ""
          }${isSelected ? ", selected" : ""}`;
          return (
            <g
              key={`berry-${d.axis}`}
              className={`tm-${uid}-berry`}
              style={{ animationDelay: `${560 + i * 34}ms` }}
            >
              <g
                className={`tm-${uid}-node`}
                style={{
                  transform: isSelected ? "scale(1.4)" : "scale(1)",
                  opacity: isDimmed ? 0.32 : 1,
                  cursor: isInteractive ? "pointer" : undefined,
                }}
                tabIndex={isInteractive ? 0 : undefined}
                role={isInteractive ? "button" : undefined}
                aria-label={isInteractive ? nodeLabel : undefined}
                aria-pressed={isInteractive ? isSelected : undefined}
                onClick={isInteractive ? () => selectAxis(d.axis) : undefined}
                onKeyDown={
                  isInteractive
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectAxis(d.axis);
                        }
                      }
                    : undefined
                }
              >
                {isSelected ? (
                  <circle
                    className={`tm-${uid}-ring`}
                    cx={p.x}
                    cy={p.y}
                    r={r + 5}
                    fill="none"
                    stroke="#F5EDD6"
                    strokeOpacity={0.85}
                    strokeWidth={1.4}
                  />
                ) : null}
                {isReserve ? (
                  <circle cx={p.x} cy={p.y} r={r + 2.4} fill="none" stroke="#C9A84C" strokeOpacity={0.9} strokeWidth={1} />
                ) : null}
                <circle cx={p.x} cy={p.y} r={r} fill={color} fillOpacity={opacity} />
                <circle cx={p.x} cy={p.y} r={Math.max(0.8, r * 0.34)} fill="#F5EDD6" fillOpacity={0.5} />
                {isInteractive ? (
                  <circle cx={p.x} cy={p.y} r={Math.max(14, r + 9)} fill="transparent" />
                ) : null}
              </g>
            </g>
          );
        })}

        {/* Axis labels */}
        {showLabels
          ? data.map((d, i) => {
              const angle = angleFor(i, 16);
              const lp = pointOnCircle(cx, cy, radius + dim * 0.075, angle);
              const anchor =
                lp.x < cx - dim * 0.02 ? "end" : lp.x > cx + dim * 0.02 ? "start" : "middle";
              const isSelected = selectedAxis === d.axis;
              const isDimmed = isInteractive && selectedAxis !== null && !isSelected;
              return (
                <text
                  key={`label-${d.axis}`}
                  className={`tm-${uid}-static`}
                  x={lp.x}
                  y={lp.y}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  fontSize={dim * 0.026}
                  fontWeight={isSelected ? 700 : 500}
                  fill={isSelected ? "#F5EDD6" : "#A08878"}
                  opacity={isDimmed ? 0.5 : 1}
                  style={{
                    animationDelay: "300ms",
                    transition: `opacity var(--motion-duration-standard) var(--motion-ease-standard)`,
                  }}
                >
                  {d.label}
                </text>
              );
            })
          : null}
      </svg>

      {isInteractive ? (
        <div className="mt-4" aria-live="polite">
          {selectedData ? (
            <div
              key={selectedData.axis}
              className={`tm-${uid}-card relative rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/25 px-4 py-3.5`}
            >
              <button
                type="button"
                onClick={() => setSelectedAxis(null)}
                aria-label="Close axis detail"
                className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/40"
              >
                <span aria-hidden="true">×</span>
              </button>
              <p
                className="pr-6 text-[15px] leading-tight text-[var(--color-text-primary)]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {selectedData.label}
              </p>
              <p className="mt-1.5 text-[12.5px] font-medium leading-snug text-[var(--color-accent-secondary)]">
                {personalRead(selectedData.label, selectedData.value, selectedData.confidence)}
              </p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-text-secondary)]">
                {AXIS_DESCRIPTIONS[selectedData.axis] ?? ""}
              </p>
            </div>
          ) : caption ? (
            <div key="caption" className={`tm-${uid}-card`}>
              {caption}
            </div>
          ) : null}
        </div>
      ) : null}

      {withLegend ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
          {GROUP_ORDER.map((groupKey) => (
            <span
              key={groupKey}
              className="inline-flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-[var(--color-text-tertiary)]"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: GROUP_META[groupKey].color, opacity: 0.85 }}
              />
              {GROUP_META[groupKey].label}
            </span>
          ))}
        </div>
      ) : null}

      {compareData ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-secondary)]">
            <span className="inline-block h-2 w-3 rounded-full" style={{ backgroundColor: "#C4607A" }} />
            {primaryLabel}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-secondary)]">
            <span
              className="inline-block h-0 w-3 border-t-2 border-dashed"
              style={{ borderColor: "#F5EDD6" }}
            />
            {compareLabel}
          </span>
        </div>
      ) : null}
    </div>
  );
}
