export const ENTRY_SHARE_TEXT = "Check out this wine from my Cluster.";

export const ENTRY_MATCH_BAND_LABELS = {
  excellent: "Perfect match",
  strong: "Great match",
  decent: "Decent match",
  not_your_style: "Not your style",
} as const;

export type EntryMatchBand = keyof typeof ENTRY_MATCH_BAND_LABELS;

/**
 * Public rating bands (overhaul-plan decision 1) — the private 1-100 rating
 * never renders on a public surface for a viewer who isn't the entry owner.
 * These warm, non-numeric bands stand in on feed cards, share/OG, and
 * friend-profile entry lists. Thresholds mirror SCORE_BANDS
 * (src/server/algorithm/constants.ts) for one mental model across the app,
 * but the wording here is about the owner's own enjoyment, not a palate
 * match — those are different concepts and shouldn't be confused.
 */
export const PUBLIC_RATING_BAND_LABELS = {
  loved: "Loved it",
  really_liked: "Really liked it",
  liked: "Liked it",
  tried: "Tried it",
} as const;

export type PublicRatingBand = keyof typeof PUBLIC_RATING_BAND_LABELS;

const PUBLIC_RATING_BAND_THRESHOLDS: readonly {
  min: number;
  band: PublicRatingBand;
}[] = [
  { min: 90, band: "loved" },
  { min: 75, band: "really_liked" },
  { min: 60, band: "liked" },
  { min: 0, band: "tried" },
];

export function getPublicRatingBand(rating: number): PublicRatingBand {
  const clamped = Math.max(0, Math.min(100, rating));
  return (
    PUBLIC_RATING_BAND_THRESHOLDS.find((threshold) => clamped >= threshold.min) ??
    PUBLIC_RATING_BAND_THRESHOLDS[PUBLIC_RATING_BAND_THRESHOLDS.length - 1]
  ).band;
}

/** Returns the warm public-facing band label for a private rating, or null if unrated. */
export function getPublicRatingBandLabel(
  rating: number | null | undefined
): string | null {
  if (typeof rating !== "number" || Number.isNaN(rating)) {
    return null;
  }
  return PUBLIC_RATING_BAND_LABELS[getPublicRatingBand(rating)];
}

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
