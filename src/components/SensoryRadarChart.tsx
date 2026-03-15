"use client";

type RadarPoint = {
  key: string;
  label: string;
  wine: number | null;
  user: number | null;
};

function toCoordinates(value: number, index: number, total: number, radius: number, center: number) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const normalized = Math.max(0, Math.min(5, value)) / 5;
  const pointRadius = normalized * radius;
  const x = center + Math.cos(angle) * pointRadius;
  const y = center + Math.sin(angle) * pointRadius;
  return `${x},${y}`;
}

function buildPolygon(points: RadarPoint[], accessor: "wine" | "user", radius: number, center: number) {
  return points
    .map((point, index) =>
      toCoordinates(point[accessor] ?? 0, index, points.length, radius, center)
    )
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
  const size = 320;
  const center = size / 2;
  const radius = 112;
  const rings = [1, 2, 3, 4, 5];

  return (
    <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-amber-300/70">
            Sensory map
          </p>
          <p className="mt-1 text-sm text-zinc-300">
            Very Low to Very High labels are grouped into broader tasting dimensions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            {wineLabel}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
            {userLabel}
          </span>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/5 bg-[#0c0807]">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`${wineLabel} compared with ${userLabel}`}
          className="h-auto w-full"
        >
          {rings.map((ring) => (
            <polygon
              key={ring}
              points={points
                .map((point, index) => toCoordinates(ring, index, points.length, radius, center))
                .join(" ")}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
          ))}

          {points.map((point, index) => {
            const angle = (Math.PI * 2 * index) / points.length - Math.PI / 2;
            const labelRadius = radius + 26;
            const x = center + Math.cos(angle) * labelRadius;
            const y = center + Math.sin(angle) * labelRadius;
            return (
              <g key={point.key}>
                <line
                  x1={center}
                  y1={center}
                  x2={center + Math.cos(angle) * radius}
                  y2={center + Math.sin(angle) * radius}
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={y}
                  textAnchor={x < center - 12 ? "end" : x > center + 12 ? "start" : "middle"}
                  dominantBaseline="middle"
                  fill="rgba(228,228,231,0.92)"
                  fontSize="12"
                >
                  {point.label}
                </text>
              </g>
            );
          })}

          <polygon
            points={buildPolygon(points, "wine", radius, center)}
            fill="rgba(251,191,36,0.18)"
            stroke="#fbbf24"
            strokeWidth="2"
          />
          <polygon
            points={buildPolygon(points, "user", radius, center)}
            fill="rgba(52,211,153,0.14)"
            stroke="#34d399"
            strokeWidth="2"
          />
        </svg>
      </div>
    </div>
  );
}
