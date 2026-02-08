/**
 * Formats a date string (e.g. "2026-01-26") as "Jan 26, 2026".
 */
export function formatConsumedDate(dateString: string): string {
  const date = new Date(dateString + "T00:00:00");
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
