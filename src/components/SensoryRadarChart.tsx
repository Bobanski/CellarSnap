"use client";

type RadarPoint = {
  key: string;
  label: string;
  wine: number | null;
  user: number | null;
};

function computeDynamicScale(points: RadarPoint[]) {
  const values = points
    .flatMap((p) => [p.user, p.wine])
    .filter((v): v is number => v !== null);
  if (values.length === 0) return { min: 1, max: 5 };

  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  // Pad by ~0.5 beyond the data range, rounded to nearest 0.5, clamped to 1-5
  const scaleMin = Math.max(1, Math.floor((dataMin - 0.5) * 2) / 2);
  const scaleMax = Math.min(5, Math.ceil((dataMax + 0.5) * 2) / 2);
  // Ensure at least 1.5 range so the chart isn't too zoomed in
  if (scaleMax - scaleMin < 1.5) {
    const mid = (scaleMin + scaleMax) / 2;
    return {
      min: Math.max(1, mid - 0.75),
      max: Math.min(5, mid + 0.75),
    };
  }
  return { min: scaleMin, max: scaleMax };
}

function toCoordinates(
  value: number,
  index: number,
  total: number,
  radius: number,
  center: number,
  scaleMin: number,
  scaleMax: number
) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const range = scaleMax - scaleMin;
  // Min sits at 10% radius so it's still visible, max at 100%
  const normalized = 0.10 + ((Math.max(scaleMin, Math.min(scaleMax, value)) - scaleMin) / range) * 0.90;
  const pointRadius = normalized * radius;
  return {
    x: center + Math.cos(angle) * pointRadius,
    y: center + Math.sin(angle) * pointRadius,
  };
}

function buildPolygonPath(
  points: RadarPoint[],
  accessor: "wine" | "user",
  radius: number,
  center: number,
  scaleMin: number,
  scaleMax: number
) {
  return points
    .map((point, index) => {
      const { x, y } = toCoordinates(point[accessor] ?? scaleMin, index, points.length, radius, center, scaleMin, scaleMax);
      return `${x},${y}`;
    })
    .join(" ");
}

export default function SensoryRadarChart({
  points,
  wineLabel = "Wine profile",
  userLabel = "Your palate",
}: {
  points: RadarPoint[];
  wineLabel?: string;
  userLabel?: string;
}) {
  if (points.length === 0) return null;

  const size = 420;
  const center = size / 2;
  const radius = 140;
  const { min: scaleMin, max: scaleMax } = computeDynamicScale(points);
  const range = scaleMax - scaleMin;
  // Generate ~4 ring lines evenly spaced within the dynamic scale
  const ringCount = 4;
  const rings = Array.from({ length: ringCount }, (_, i) =>
    Number((scaleMin + ((i + 1) / ringCount) * range).toFixed(1))
  );
  // Find which ring is closest to the neutral value (3.0) for highlighting
  const neutralRing = rings.reduce((closest, ring) =>
    Math.abs(ring - 3) < Math.abs(closest - 3) ? ring : closest
  );

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-[9px] font-bold uppercase tracking-[2px] text-[var(--color-text-tertiary)]">
          Sensory map
        </p>
        <div className="flex items-center gap-4 text-[10px] text-[var(--color-text-tertiary)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--color-surface-hover)]" />
            {wineLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#C4607A" }} />
            {userLabel}
          </span>
        </div>
      </div>

      <div className="rounded-xl bg-[var(--color-screen-bg)] p-3">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`${wineLabel} compared with ${userLabel}`}
          className="h-auto w-full max-w-[400px] mx-auto"
        >
          {/* Grid rings */}
          {rings.map((ring) => (
            <polygon
              key={ring}
              points={points
                .map((_, index) => {
                  const { x, y } = toCoordinates(ring, index, points.length, radius, center, scaleMin, scaleMax);
                  return `${x},${y}`;
                })
                .join(" ")}
              fill="none"
              stroke={ring === neutralRing ? "rgba(44, 26, 14, 0.20)" : "rgba(44, 26, 14, 0.14)"}
              strokeWidth={ring === neutralRing ? "1.5" : "1"}
            />
          ))}

          {/* Spoke lines + labels */}
          {points.map((point, index) => {
            const angle = (Math.PI * 2 * index) / points.length - Math.PI / 2;
            const spokeEnd = toCoordinates(scaleMax, index, points.length, radius, center, scaleMin, scaleMax);
            const labelRadius = radius + 28;
            const lx = center + Math.cos(angle) * labelRadius;
            const ly = center + Math.sin(angle) * labelRadius;
            return (
              <g key={point.key}>
                <line
                  x1={center}
                  y1={center}
                  x2={spokeEnd.x}
                  y2={spokeEnd.y}
                  stroke="rgba(44, 26, 14, 0.14)"
                  strokeWidth="1"
                />
                <text
                  x={lx}
                  y={ly}
                  textAnchor={lx < center - 15 ? "end" : lx > center + 15 ? "start" : "middle"}
                  dominantBaseline="middle"
                  fill="var(--color-text-secondary)"
                  fontSize="10.5"
                  fontWeight="500"
                >
                  {point.label}
                </text>
              </g>
            );
          })}

          {/* Neutral baseline — subtle dashed */}
          <polygon
            points={buildPolygonPath(points, "wine", radius, center, scaleMin, scaleMax)}
            fill="rgba(196, 96, 122, 0.03)"
            stroke="rgba(196, 96, 122, 0.18)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />

          {/* User palate — vivid fill + stroke */}
          <polygon
            points={buildPolygonPath(points, "user", radius, center, scaleMin, scaleMax)}
            fill="rgba(196, 96, 122, 0.12)"
            stroke="#C4607A"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />

          {/* Data point dots */}
          {points.map((point, index) => {
            if (point.user === null) return null;
            const { x, y } = toCoordinates(point.user, index, points.length, radius, center, scaleMin, scaleMax);
            return (
              <circle
                key={`dot-${point.key}`}
                cx={x}
                cy={y}
                r="3.5"
                fill="#C4607A"
                stroke="var(--color-screen-bg)"
                strokeWidth="1.5"
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
