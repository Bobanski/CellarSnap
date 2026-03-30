export const ENTRY_SHARE_TEXT = "Check out this wine from my Cluster.";

export const ENTRY_MATCH_BAND_LABELS = {
  excellent: "Perfect match",
  strong: "Great match",
  decent: "Decent match",
  not_your_style: "Not your style",
} as const;

export type EntryMatchBand = keyof typeof ENTRY_MATCH_BAND_LABELS;

export function buildEntryShareText() {
  return ENTRY_SHARE_TEXT;
}

export function buildEntryLocationDisplayLabel(locationText: string): string {
  const normalized = locationText.trim();
  if (!normalized) {
    return normalized;
  }

  const parts = normalized
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return normalized;
  }

  const name = parts[0];
  const city = parts.length >= 4 ? parts[parts.length - 3] : parts[1];
  if (!city || city.toLowerCase() === name.toLowerCase()) {
    return name;
  }

  return `${name}, ${city}`;
}

export function buildEntryGoogleMapsLocationUrl(locationText: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    locationText
  )}`;
}
