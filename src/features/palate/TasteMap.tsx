"use client";

import { useId, useMemo } from "react";

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
}: TasteMapProps) {
  const uid = useId().replace(/:/g, "");
  const isCard = variant === "card";
  const dim = size ?? (isCard ? 168 : 340);
  const showLabels = showAxisLabels ?? !isCard;
  const withLegend = showLegend ?? (!isCard && !compareAxes);

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
    .tm-${uid}-web { stroke-dasharray: var(--tm-perim); ${animate ? `animation: tm-${uid}-draw 1100ms cubic-bezier(.2,.8,.2,1) forwards;` : "stroke-dashoffset: 0;"} }
    .tm-${uid}-fill { ${animate ? `opacity: 0; animation: tm-${uid}-fade 900ms ease 500ms forwards;` : "opacity: 1;"} }
    .tm-${uid}-cmp { ${animate ? `opacity: 0; animation: tm-${uid}-fade 800ms ease 300ms forwards;` : "opacity: 1;"} }
    .tm-${uid}-static { ${animate ? `opacity: 0; animation: tm-${uid}-fade 700ms ease forwards;` : "opacity: 1;"} }
    .tm-${uid}-berry { transform-box: fill-box; transform-origin: center; ${animate ? `opacity: 0; animation: tm-${uid}-pop 520ms cubic-bezier(.2,1.1,.3,1) forwards;` : "opacity: 1;"} }
    @media (prefers-reduced-motion: reduce) {
      .tm-${uid}-web, .tm-${uid}-fill, .tm-${uid}-cmp, .tm-${uid}-static, .tm-${uid}-berry {
        animation: none !important; opacity: 1 !important; stroke-dashoffset: 0 !important; transform: none !important;
      }
    }
  `;

  return (
    <div className={className}>
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
          return (
            <g
              key={`berry-${d.axis}`}
              className={`tm-${uid}-berry`}
              style={{ animationDelay: `${560 + i * 34}ms` }}
            >
              {isReserve ? (
                <circle cx={p.x} cy={p.y} r={r + 2.4} fill="none" stroke="#C9A84C" strokeOpacity={0.9} strokeWidth={1} />
              ) : null}
              <circle cx={p.x} cy={p.y} r={r} fill={color} fillOpacity={opacity} />
              <circle cx={p.x} cy={p.y} r={Math.max(0.8, r * 0.34)} fill="#F5EDD6" fillOpacity={0.5} />
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
              return (
                <text
                  key={`label-${d.axis}`}
                  className={`tm-${uid}-static`}
                  x={lp.x}
                  y={lp.y}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  fontSize={dim * 0.026}
                  fontWeight={500}
                  fill="#A08878"
                  style={{ animationDelay: "300ms" }}
                >
                  {d.label}
                </text>
              );
            })
          : null}
      </svg>

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
