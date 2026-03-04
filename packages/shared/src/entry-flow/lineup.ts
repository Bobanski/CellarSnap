export type LineupWineDetails = {
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  classification: string | null;
};

export function normalizeGrapeLookupValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeLineupText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function hasLineupWineDetails(wine: LineupWineDetails) {
  return Boolean(
    wine.wine_name ||
      wine.producer ||
      wine.vintage ||
      wine.country ||
      wine.region ||
      wine.appellation ||
      wine.classification
  );
}
