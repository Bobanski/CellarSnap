import type { MatchBand, SensoryAxis } from "@/server/algorithm/types";
import type { WineType } from "@/types/wine";

export type IdentifiedWine = {
  name: string | null;
  producer: string | null;
  vintage: string | null;
  region: string | null;
  country: string | null;
  grapes: string[];
  wine_type: WineType | null;
};

export type IdentifyBottleAxisHighlight = {
  axis: SensoryAxis;
  label: string;
  aligned: boolean;
};

export type IdentifyBottleMatch = {
  score: number;
  band: MatchBand;
  confidence: number;
};

export type IdentifyBottleResponse = {
  wine: IdentifiedWine;
  match: IdentifyBottleMatch | null;
  axis_highlights: IdentifyBottleAxisHighlight[];
};

export class IdentifyBottleError extends Error {}

/** A wine counts as "identified" once the label yielded a name or producer. */
export function isBottleIdentified(wine: IdentifiedWine): boolean {
  return Boolean(wine.name || wine.producer);
}

export async function identifyBottlePhoto(
  file: File,
  options?: { signal?: AbortSignal }
): Promise<IdentifyBottleResponse> {
  const formData = new FormData();
  formData.append("photo", file);

  const response = await fetch("/api/sommelier/identify-bottle", {
    method: "POST",
    body: formData,
    signal: options?.signal,
  });

  const payload = (await response.json().catch(() => null)) as
    | IdentifyBottleResponse
    | { error?: string }
    | null;

  if (!response.ok) {
    const message =
      payload && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "Could not identify that bottle. Try again in a moment.";
    throw new IdentifyBottleError(message);
  }

  return payload as IdentifyBottleResponse;
}
