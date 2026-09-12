"use client";

/**
 * ProducerMark — deterministic crest-style avatar for a producer.
 *
 * Feedback (round 2, "Producer visual marks"): Eitan wants producer logos,
 * but real logos have no rights-cleared source we can pull from. This is the
 * tasteful middle ground — a small SVG crest with the producer's initials in
 * Cormorant, a background/accent pair and a crest shape both picked
 * deterministically from a hash of the producer's name (so the same producer
 * always renders the same mark, and different producers visibly differ in
 * shape and tone rather than reading as default-avatar soup), plus a subtle
 * grape-cluster watermark tying it back to the brand.
 *
 * Use this wherever producers are listed on explore surfaces (browse lists,
 * search results, notable/similar-producer rows, community-pulse cards). It
 * is NOT a replacement for the AI-generated hero image on a producer's own
 * detail page — that stays a photo; this is for list contexts.
 */

// Palette pairs pulled from the same brand tones used across explore pages
// and BadgeIcon (Grenache/Rose/Nebbiolo/Viognier/Verdot/Fog) — kept in-family
// rather than inventing new hues so producer marks read as part of the app,
// not a bolt-on avatar system.
const PALETTE: Array<{ bg: string; accent: string }> = [
  { bg: "#7B1D3A", accent: "#C4607A" }, // Grenache / Rose
  { bg: "#4A3060", accent: "#9B7EC2" }, // Nebbiolo / lightened Nebbiolo
  { bg: "#2F4A3B", accent: "#6FAE85" }, // deep Verdot / lightened Verdot
  { bg: "#5C4014", accent: "#C9A84C" }, // deep amber / Viognier
  { bg: "#3A2430", accent: "#C4607A" }, // deep plum / Rose
  { bg: "#3D2E24", accent: "#A08878" }, // deep umber / Fog
];

const CHAMPAGNE = "#F5EDD6";

type MarkShape = "circle" | "hexagon" | "shield";

// Small, stable string hash (not cryptographic — just needs to be
// deterministic and reasonably well-distributed across producer names).
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const SKIP_WORDS = new Set(["de", "du", "des", "la", "le", "les", "el", "los", "las", "di", "della", "van", "von"]);

function initialsFor(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !SKIP_WORDS.has(w.toLowerCase()));
  if (words.length === 0) return "?";
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[words.length > 2 ? 1 : 1][0]).toUpperCase();
}

function crestPath(shape: MarkShape, size: number): string {
  const c = size / 2;
  if (shape === "hexagon") {
    const r = size * 0.5;
    const pts = [0, 1, 2, 3, 4, 5].map((i) => {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      return [c + r * Math.cos(angle), c + r * Math.sin(angle)];
    });
    return `M${pts.map((p) => p.join(",")).join(" L")} Z`;
  }
  if (shape === "shield") {
    const w = size * 0.46;
    const top = size * 0.06;
    const bottom = size * 0.96;
    return `M${c - w},${top} L${c + w},${top} L${c + w},${size * 0.55} Q${c + w},${bottom} ${c},${bottom} Q${c - w},${bottom} ${c - w},${size * 0.55} Z`;
  }
  return ""; // circle handled separately
}

export default function ProducerMark({
  name,
  size = 40,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const hash = hashString(name || "?");
  const palette = PALETTE[hash % PALETTE.length];
  const shapes: MarkShape[] = ["circle", "hexagon", "shield"];
  const shape = shapes[Math.floor(hash / PALETTE.length) % shapes.length];
  const watermarkRotation = (hash % 4) * 90;
  const initials = initialsFor(name || "?");
  const fontSize = size * 0.38;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={name}
    >
      {shape === "circle" ? (
        <circle cx={size / 2} cy={size / 2} r={size / 2} fill={palette.bg} />
      ) : (
        <path d={crestPath(shape, size)} fill={palette.bg} />
      )}
      {/* Subtle grape-cluster watermark, low-opacity, rotated by hash so
          repeated marks in a list don't all share the same silhouette. */}
      <g
        opacity="0.16"
        transform={`rotate(${watermarkRotation} ${size / 2} ${size / 2}) translate(${size * 0.58} ${size * 0.08})`}
      >
        <circle cx={size * 0.09} cy={size * 0.14} r={size * 0.07} fill={palette.accent} />
        <circle cx={size * 0.02} cy={size * 0.24} r={size * 0.07} fill={palette.accent} />
        <circle cx={size * 0.16} cy={size * 0.24} r={size * 0.07} fill={palette.accent} />
        <circle cx={size * 0.09} cy={size * 0.34} r={size * 0.07} fill={palette.accent} />
      </g>
      <text
        x="50%"
        y="52%"
        textAnchor="middle"
        dominantBaseline="middle"
        fill={CHAMPAGNE}
        fontFamily="var(--font-serif)"
        fontSize={fontSize}
        fontWeight={500}
      >
        {initials}
      </text>
    </svg>
  );
}
