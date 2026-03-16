import {
  mapContextTagToPhotoType,
  normalizeConfidence,
  normalizeContextPhotoTag,
  type ContextPhotoTag,
} from "@shared/entry-flow";
import type { EntryPhotoType } from "@/types/wine";

type LineupAutofillPayload = {
  total_bottles_detected?: number;
  wines?: Array<{
    wine_name?: string | null;
    producer?: string | null;
    vintage?: string | null;
    country?: string | null;
    region?: string | null;
    appellation?: string | null;
    classification?: string | null;
  }>;
};

type PhotoContextPayload = {
  tag?: ContextPhotoTag;
  confidence?: number | null;
};

export async function classifyPhotoTypeWithAi(
  contextFile: File
): Promise<EntryPhotoType> {
  try {
    const lineupFd = new FormData();
    lineupFd.append("photo", contextFile);
    const lineupResponse = await fetch("/api/lineup-autofill", {
      method: "POST",
      body: lineupFd,
    });
    if (lineupResponse.ok) {
      const lineupPayload = (await lineupResponse.json()) as LineupAutofillPayload;
      const detectedCount =
        typeof lineupPayload.total_bottles_detected === "number" &&
        Number.isFinite(lineupPayload.total_bottles_detected)
          ? Math.max(0, Math.round(lineupPayload.total_bottles_detected))
          : 0;
      const identifiedCount = Array.isArray(lineupPayload.wines)
        ? lineupPayload.wines.filter((wine) =>
            Boolean(
              wine.wine_name ||
                wine.producer ||
                wine.vintage ||
                wine.country ||
                wine.region ||
                wine.appellation ||
                wine.classification
            )
          ).length
        : 0;

      if (detectedCount >= 2 || identifiedCount >= 2) {
        return "lineup";
      }
      if (detectedCount === 1 || identifiedCount === 1) {
        return "label";
      }
    }
  } catch {
    // Fall through to lightweight context categorization.
  }

  try {
    const contextFd = new FormData();
    contextFd.append("photo", contextFile);
    const contextResponse = await fetch("/api/photo-context", {
      method: "POST",
      body: contextFd,
    });
    if (contextResponse.ok) {
      const payload = (await contextResponse.json()) as PhotoContextPayload;
      const tag = normalizeContextPhotoTag(payload.tag);
      const confidence = normalizeConfidence(payload.confidence);
      return mapContextTagToPhotoType(tag, {
        confidence,
        detectedBottleCount: 0,
        identifiedBottleCount: 0,
      });
    }
  } catch {
    // Final fallback below.
  }

  return "other_bottles";
}
