type RatingBadgeProps = {
  rating: number | null | undefined;
  className?: string;
  variant?: "badge" | "text";
};

function getRatingToneClasses(): string {
  return "border-[var(--color-accent-secondary)]/70 bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-secondary)]";
}

export default function RatingBadge({
  rating,
  className = "",
  variant = "badge",
}: RatingBadgeProps) {
  const baseClasses =
    variant === "text"
      ? "inline-flex items-center text-sm font-bold leading-none tabular-nums text-[var(--color-accent-secondary)]"
      : "inline-flex items-center rounded-full border px-2.5 py-1 text-sm font-semibold leading-none tabular-nums";

  if (typeof rating !== "number" || Number.isNaN(rating)) {
    return (
      <span
        className={
          variant === "text"
            ? `${baseClasses} text-[var(--color-text-tertiary)] ${className}`.trim()
            : `${baseClasses} border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 text-[var(--color-text-tertiary)] ${className}`.trim()
        }
      >
        Unrated
      </span>
    );
  }

  const normalizedRating = Math.max(0, Math.min(100, Math.round(rating)));

  return (
    <span
      className={
        variant === "text"
          ? `${baseClasses} ${className}`.trim()
          : `${baseClasses} ${getRatingToneClasses()} ${className}`.trim()
      }
      title={`Rating ${normalizedRating} out of 100`}
    >
      {normalizedRating}/100
    </span>
  );
}
