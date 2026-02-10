type RatingBadgeProps = {
  rating: number | null | undefined;
  className?: string;
};

function getRatingToneClasses(): string {
  return "border-amber-300/70 bg-amber-400/20 text-amber-100";
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
      className={`${baseClasses} ${getRatingToneClasses()} ${className}`.trim()}
      title={`Rating ${normalizedRating} out of 100`}
    >
      {normalizedRating}/100
    </span>
  );
}
