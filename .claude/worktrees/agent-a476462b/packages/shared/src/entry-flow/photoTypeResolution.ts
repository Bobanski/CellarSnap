import {
  mapContextTagToPhotoType,
  type ContextPhotoTag,
  type ContextTagResolvedPhotoType,
} from "./photoContext";
import type { SourcePhotoRole } from "./lineupAnalysis";

export type EntryFlowPhotoType =
  | "label"
  | "pairing"
  | "people"
  | "other_bottles"
  | "lineup"
  | "place";

export type SourcePhotoTypeAnalysis = {
  role: SourcePhotoRole;
  detectedBottleCount: number;
  identifiedBottleCount: number;
  contextTag: ContextPhotoTag;
  contextConfidence: number | null;
};

function hasIdentifiedBottleDetails(analysis: SourcePhotoTypeAnalysis | null) {
  return (analysis?.identifiedBottleCount ?? 0) > 0;
}

function hasBottleEvidence(analysis: SourcePhotoTypeAnalysis | null) {
  if (!analysis) {
    return false;
  }
  return analysis.detectedBottleCount > 0 || analysis.identifiedBottleCount > 0;
}

function resolveAutoContextType(
  analysis: SourcePhotoTypeAnalysis | null
): ContextTagResolvedPhotoType {
  if (!analysis) {
    return "place";
  }

  return mapContextTagToPhotoType(analysis.contextTag, {
    confidence: analysis.contextConfidence,
    detectedBottleCount: analysis.detectedBottleCount,
    identifiedBottleCount: analysis.identifiedBottleCount,
  });
}

export function resolvePrimaryLabelPhotoIndex<TPhoto>({
  photos,
  sourceAnalysisByIndex,
  resolveManualPhotoType,
}: {
  photos: readonly TPhoto[];
  sourceAnalysisByIndex: ReadonlyMap<number, SourcePhotoTypeAnalysis>;
  resolveManualPhotoType: (
    photo: TPhoto,
    photoIndex: number
  ) => EntryFlowPhotoType | undefined;
}) {
  if (photos.length === 0) {
    return -1;
  }

  const manualLabelIndex = photos.findIndex(
    (photo, photoIndex) =>
      resolveManualPhotoType(photo, photoIndex) === "label"
  );
  if (manualLabelIndex >= 0) {
    return manualLabelIndex;
  }

  const firstIndividual = photos.findIndex(
    (_photo, photoIndex) =>
      sourceAnalysisByIndex.get(photoIndex)?.role === "individual"
  );
  if (firstIndividual >= 0) {
    return firstIndividual;
  }

  const firstLineup = photos.findIndex(
    (_photo, photoIndex) =>
      sourceAnalysisByIndex.get(photoIndex)?.role === "lineup"
  );
  if (firstLineup >= 0) {
    return firstLineup;
  }

  return 0;
}

export function resolvePhotoTypeAtIndex<TPhoto>({
  photoIndex,
  photos,
  sourceAnalysisByIndex,
  primaryLabelIndex,
  resolveManualPhotoType,
}: {
  photoIndex: number;
  photos: readonly TPhoto[];
  sourceAnalysisByIndex: ReadonlyMap<number, SourcePhotoTypeAnalysis>;
  primaryLabelIndex: number;
  resolveManualPhotoType: (
    photo: TPhoto,
    photoIndex: number
  ) => EntryFlowPhotoType | undefined;
}): EntryFlowPhotoType {
  const photo = photos[photoIndex];
  if (!photo) {
    return "other_bottles";
  }

  const manualType = resolveManualPhotoType(photo, photoIndex);
  if (manualType) {
    return manualType;
  }

  const analysis = sourceAnalysisByIndex.get(photoIndex) ?? null;
  if (analysis?.role === "lineup") {
    return "lineup";
  }

  // Keep likely primary bottle photos as label when details were extracted,
  // even if context tagging also sees place/people/pairing.
  if (photoIndex === primaryLabelIndex || hasIdentifiedBottleDetails(analysis)) {
    return "label";
  }

  const contextType = resolveAutoContextType(analysis);
  if (contextType === "other_bottles") {
    return hasBottleEvidence(analysis) ? "other_bottles" : contextType;
  }
  return contextType;
}

export function buildResolvedPhotoTypeMap<TPhoto>({
  photos,
  sourceAnalysisByIndex,
  resolveManualPhotoType,
}: {
  photos: readonly TPhoto[];
  sourceAnalysisByIndex: ReadonlyMap<number, SourcePhotoTypeAnalysis>;
  resolveManualPhotoType: (
    photo: TPhoto,
    photoIndex: number
  ) => EntryFlowPhotoType | undefined;
}) {
  const primaryLabelIndex = resolvePrimaryLabelPhotoIndex({
    photos,
    sourceAnalysisByIndex,
    resolveManualPhotoType,
  });

  return new Map(
    photos.map((_photo, photoIndex) => [
      photoIndex,
      resolvePhotoTypeAtIndex({
        photoIndex,
        photos,
        sourceAnalysisByIndex,
        primaryLabelIndex,
        resolveManualPhotoType,
      }),
    ])
  );
}
