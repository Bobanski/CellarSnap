type RatingBadgeProps = {
  rating: number | null | undefined;
  className?: string;
};

export default function RatingBadge({
  rating,
  className = "",
}: RatingBadgeProps) {
  const baseClasses = "text-zinc-400 " + className;
  if (typeof rating !== "number" || Number.isNaN(rating)) {
    return <span className={baseClasses.trim()}>Unrated</span>;
  }
  const normalizedRating = Math.max(0, Math.min(100, Math.round(rating)));
  return (
    <span className={baseClasses.trim()} title={`Rating ${normalizedRating} out of 100`}>
      {normalizedRating}/100
    </span>
  );
}
