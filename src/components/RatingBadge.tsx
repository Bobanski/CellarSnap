type RatingBadgeProps = {
  rating: number | null | undefined;
  className?: string;
};

function getRatingToneClasses(rating: number): string {
  if (rating >= 95) {
    return "border-amber-300/70 bg-amber-400/20 text-amber-100";
  }
  if (rating >= 90) {
    return "border-emerald-300/70 bg-emerald-400/20 text-emerald-100";
  }
  if (rating >= 85) {
    return "border-emerald-200/60 bg-emerald-300/10 text-emerald-200";
  }
  if (rating >= 80) {
    return "border-yellow-300/70 bg-yellow-400/20 text-yellow-100";
  }
  if (rating >= 75) {
    return "border-rose-300/60 bg-rose-400/15 text-rose-200";
  }
  return "border-red-300/70 bg-red-500/25 text-red-100";
}

export default function RatingBadge({
  rating,
  className = "",
}: RatingBadgeProps) {
  const baseClasses =
    "inline-flex items-center rounded-full border px-2.5 py-1 text-sm font-semibold leading-none tabular-nums";

  if (typeof rating !== "number" || Number.isNaN(rating)) {
    return (
      <span className={`${baseClasses} border-white/10 bg-white/5 text-zinc-400 ${className}`.trim()}>
        Unrated
      </span>
    );
  }

  const normalizedRating = Math.max(0, Math.min(100, Math.round(rating)));

  return (
    <span
      className={`${baseClasses} ${getRatingToneClasses(normalizedRating)} ${className}`.trim()}
      title={`Rating ${normalizedRating} out of 100`}
    >
      {normalizedRating}/100
    </span>
  );
}
