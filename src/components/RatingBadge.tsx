type RatingBadgeProps = {
  rating: number | null | undefined;
  className?: string;
};

export default function RatingBadge({
  rating,
  className = "",
}: RatingBadgeProps) {
  const classes = className.trim() ? className : "text-zinc-400";
  if (typeof rating !== "number" || Number.isNaN(rating)) {
    return <span className={classes}>Unrated</span>;
  }
  const normalizedRating = Math.max(0, Math.min(100, Math.round(rating)));
  return (
    <span className={classes} title={`Rating ${normalizedRating} out of 100`}>
      {normalizedRating}/100
    </span>
  );
}
