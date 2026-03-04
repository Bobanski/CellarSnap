export const OTHER_BOTTLES_CONFIDENCE_THRESHOLD = 0.72;
export const NON_BOTTLE_INTENT_CONFIDENCE_THRESHOLD = 0.6;

export type ContextPhotoTag =
  | "place"
  | "pairing"
  | "people"
  | "other_bottles"
  | "unknown";

export type ContextTagResolvedPhotoType =
  | "place"
  | "pairing"
  | "people"
  | "other_bottles";

export function normalizeConfidence(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.min(1, Math.max(0, value));
}

export function normalizeContextPhotoTag(value: unknown): ContextPhotoTag {
  return value === "place" ||
    value === "pairing" ||
    value === "people" ||
    value === "other_bottles" ||
    value === "unknown"
    ? value
    : "unknown";
}

export function isPeoplePlaceOrPairingTag(tag: ContextPhotoTag) {
  return tag === "people" || tag === "place" || tag === "pairing";
}

export function isConfidentNonBottleIntentTag(
  tag: ContextPhotoTag,
  confidence: number | null,
  threshold = NON_BOTTLE_INTENT_CONFIDENCE_THRESHOLD
) {
  return isPeoplePlaceOrPairingTag(tag) && (confidence ?? 0) >= threshold;
}

export function mapContextTagToPhotoType(
  tag: ContextPhotoTag,
  {
    confidence,
    detectedBottleCount,
    identifiedBottleCount,
    otherBottlesConfidenceThreshold = OTHER_BOTTLES_CONFIDENCE_THRESHOLD,
  }: {
    confidence: number | null;
    detectedBottleCount: number;
    identifiedBottleCount: number;
    otherBottlesConfidenceThreshold?: number;
  }
): ContextTagResolvedPhotoType {
  if (tag === "place" || tag === "pairing" || tag === "people") {
    return tag;
  }

  const hasBottleEvidence = detectedBottleCount > 0 || identifiedBottleCount > 0;

  if (tag === "other_bottles") {
    if (
      hasBottleEvidence ||
      (confidence ?? 0) >= otherBottlesConfidenceThreshold
    ) {
      return "other_bottles";
    }
    return "place";
  }

  return hasBottleEvidence ? "other_bottles" : "place";
}
