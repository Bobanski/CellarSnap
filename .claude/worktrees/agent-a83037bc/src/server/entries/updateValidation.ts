export function resolvePersistedEntryRating({
  existingRating,
  nextRating,
}: {
  existingRating: unknown;
  nextRating: unknown;
}) {
  const rating = nextRating === undefined ? existingRating : nextRating;
  return typeof rating === "number" && Number.isFinite(rating) ? rating : null;
}
