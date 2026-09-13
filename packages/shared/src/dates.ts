/**
 * Display the recorded tasting calendar day, independent of the viewer's zone.
 * Legacy ISO timestamps keep their written date prefix; this is deliberately
 * not an instant formatter for created_at, comments, or activity timestamps.
 * Invalid calendar dates are returned unchanged rather than silently rolled over.
 */
export function formatConsumedDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return value;
  const day = value.slice(0, 10);
  const date = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
    return value;
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
