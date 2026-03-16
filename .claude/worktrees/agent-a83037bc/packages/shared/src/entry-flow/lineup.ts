import {
  isUnknownWineName,
  normalizeProducerText,
  normalizeWineNameText,
  normalizeWineText,
} from "../wineText";

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
  return normalizeWineText(value);
}

export function resolveLineupWineDisplayName(
  wine: LineupWineDetails & { primary_grape_suggestions?: string[] | null }
) {
  const normalizedWineName = normalizeWineNameText(wine.wine_name);
  if (normalizedWineName && !isUnknownWineName(normalizedWineName)) {
    return normalizedWineName;
  }

  return (
    normalizeProducerText(wine.producer) ??
    normalizeWineText(wine.appellation) ??
    normalizeWineText(wine.region) ??
    normalizeWineText(wine.primary_grape_suggestions?.[0]) ??
    "Unknown wine"
  );
}

export function hasLineupWineDetails(wine: LineupWineDetails) {
  const normalizedWineName = normalizeWineText(wine.wine_name);
  const hasExplicitWineName = Boolean(
    normalizedWineName && !isUnknownWineName(normalizedWineName)
  );

  return Boolean(
    hasExplicitWineName ||
      wine.producer ||
      wine.vintage ||
      wine.country ||
      wine.region ||
      wine.appellation ||
      wine.classification
  );
}
