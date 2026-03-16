/**
 * Formats a date string (e.g. "2026-01-26" or ISO "2026-01-26T00:00:00.000Z") as "Jan 26, 2026".
 */
export function formatConsumedDate(dateString: string): string {
  const dateOnly = dateString.slice(0, 10);
  const date = new Date(dateOnly + "T00:00:00");
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
