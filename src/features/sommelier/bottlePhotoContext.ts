import type {
  IdentifiedWine,
  IdentifyBottleAxisHighlight,
  IdentifyBottleMatch,
} from "@/lib/sommelier/identifyBottleApi";

/**
 * Builds the readable text block sent to /api/sommelier/chat after a bottle
 * photo is identified. This text — not the photo — is what gets persisted
 * to the conversation transcript (see appendSommelierMessages), so it needs
 * to stand on its own as context for the somm's reply.
 */

const MATCH_BAND_LABELS: Record<string, string> = {
  excellent: "excellent match",
  strong: "strong match",
  decent: "decent match",
  not_your_style: "not really their style",
};

function describeWine(wine: IdentifiedWine): string {
  const headline = [wine.name ?? "Unknown wine", wine.producer, wine.vintage, wine.region || wine.country]
    .filter(Boolean)
    .join(", ");
  // wine.grapes is typed as always string[] (server-side normalization
  // guarantees this), but this boundary crosses an API response, so guard
  // defensively rather than trusting the type at runtime.
  const grapeList = Array.isArray(wine.grapes) ? wine.grapes : [];
  const grapes = grapeList.length > 0 ? ` Grapes: ${grapeList.join(", ")}.` : "";
  return `${headline}.${grapes}`;
}

export function buildIdentifiedWithMatchPrompt(
  wine: IdentifiedWine,
  match: IdentifyBottleMatch,
  highlights: IdentifyBottleAxisHighlight[]
): string {
  const bandLabel = MATCH_BAND_LABELS[match.band] ?? match.band;
  const aligned = highlights.filter((highlight) => highlight.aligned).map((highlight) => highlight.label);
  const misaligned = highlights.filter((highlight) => !highlight.aligned).map((highlight) => highlight.label);
  const highlightLines = [
    aligned.length > 0 ? `Aligned: ${aligned.join("; ")}.` : null,
    misaligned.length > 0 ? `Misaligned: ${misaligned.join("; ")}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    `[The user just photographed a bottle. Identified: ${describeWine(wine)} ` +
    `Match: ${match.score}% (${bandLabel}) for this user.${highlightLines ? ` ${highlightLines}` : ""}] ` +
    `Tell them about this wine, whether they'd like it and why, and what to expect.`
  );
}

export function buildIdentifiedWithoutMatchPrompt(wine: IdentifiedWine): string {
  return (
    `[The user just photographed a bottle. Identified: ${describeWine(wine)} ` +
    `No palate match is available for this user yet.] ` +
    `Tell them about this wine and what to expect. Briefly note that the app learns their taste as they log more wines, without dwelling on it.`
  );
}

export const UNREADABLE_BOTTLE_PHOTO_PROMPT =
  "[The user just photographed a bottle, but the label couldn't be read clearly enough to identify it.] " +
  "Let them know in your voice and ask them to try a clearer, well-lit photo of the label.";
