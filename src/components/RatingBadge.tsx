type RatingBadgeProps = {
  rating: number | null | undefined;
  className?: string;
};

const BASE_CLASSES =
  "inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide tabular-nums";

const UNRATED_CLASSES = "border-zinc-500/40 bg-zinc-700/20 text-zinc-300";

function ratingClasses(rating: number) {
  if (rating >= 95) {
    return "border-amber-200/90 bg-gradient-to-r from-amber-300/80 via-yellow-100/90 to-amber-300/80 text-amber-950 shadow-[0_0_18px_rgba(251,191,36,0.45)]";
  }
  if (rating >= 90) {
    return "border-emerald-300/50 bg-emerald-500/15 text-emerald-100";
  }
  if (rating >= 85) {
    return "border-lime-300/50 bg-lime-500/15 text-lime-100";
  }
  if (rating >= 80) {
    return "border-yellow-300/60 bg-yellow-400/20 text-yellow-100";
  }
  if (rating >= 75) {
    return "border-rose-300/50 bg-rose-400/15 text-rose-100";
  }
  return "border-red-400/70 bg-red-500/25 text-red-50 shadow-[0_0_12px_rgba(239,68,68,0.35)]";
}

export default function RatingBadge({
  rating,
  className = "",
}: RatingBadgeProps) {
  if (typeof rating !== "number" || Number.isNaN(rating)) {
    return (
      <span className={`${BASE_CLASSES} ${UNRATED_CLASSES} ${className}`.trim()}>
        Unrated
      </span>
    );
  }

  const normalizedRating = Math.max(0, Math.min(100, Math.round(rating)));

  return (
    <span
      className={`${BASE_CLASSES} ${ratingClasses(normalizedRating)} ${className}`.trim()}
      title={`Rating ${normalizedRating} out of 100`}
    >
      {normalizedRating}/100
    </span>
  );
}
