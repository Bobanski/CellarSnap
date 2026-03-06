import {
  hasLineupWineDetails,
  isConfidentNonBottleIntentTag,
  isPeoplePlaceOrPairingTag,
  mapContextTagToPhotoType,
  type ContextPhotoTag,
} from "@cellarsnap/shared";
import {
  normalizeAnalysisErrorMessage,
  requestBottleCount,
  requestLabelAutofill,
  requestLineupAutofill,
  requestPhotoContext,
  type AnalyzedLineupWine,
  type LabelAutofillResponse,
} from "./photoAnalysisClient";

export type UploadPhotoType =
  | "label"
  | "place"
  | "people"
  | "pairing"
  | "lineup"
  | "other_bottles";

export type UploadPhotoItem = {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  type: UploadPhotoType;
  contextConfidence: number | null;
};

type PhotoContextResult = {
  id: string;
  tag: ContextPhotoTag;
  confidence: number | null;
};

type LineupResult = {
  photoIndex: number;
  wines: AnalyzedLineupWine[];
  detectedBottleCount: number;
  errorMessage: string | null;
};

const MAX_GUARDRAIL_BOTTLE_COUNT = 6;

export async function runPhotoAnalysisWorkflow({
  analysisPhotos,
  labelTarget,
  accessToken,
  baseUrl,
  setUploadPhotos,
  setLineupWines,
  setBulkCreateMessage,
  setUploadAnalysisStatus,
  setUploadMessage,
  setIsAutofillLoading,
  applyLabelAutofill,
  applyLineupAutofill,
  computeOverallConfidence,
  setLastAnalysisConfidence,
}: {
  analysisPhotos: UploadPhotoItem[];
  labelTarget: UploadPhotoItem | null;
  accessToken: string;
  baseUrl: string | null;
  setUploadPhotos: (
    updater: (current: UploadPhotoItem[]) => UploadPhotoItem[]
  ) => void;
  setLineupWines: (value: AnalyzedLineupWine[]) => void;
  setBulkCreateMessage: (value: string | null) => void;
  setUploadAnalysisStatus: (value: "success" | "error") => void;
  setUploadMessage: (value: string) => void;
  setIsAutofillLoading: (value: boolean) => void;
  applyLabelAutofill: (payload: LabelAutofillResponse) => Promise<boolean>;
  applyLineupAutofill: (wine: AnalyzedLineupWine) => Promise<boolean>;
  computeOverallConfidence: (values: Array<number | null>) => number | null;
  setLastAnalysisConfidence?: (value: number | null) => void;
}) {
  const shouldRunLabelAutofill = analysisPhotos.length === 1;
  const contextTargets = analysisPhotos;

  const shouldTreatPhotoAsBottleSource = ({
    context,
    detectedBottleCount,
    identifiedBottleCount,
  }: {
    context: PhotoContextResult | null | undefined;
    detectedBottleCount: number;
    identifiedBottleCount: number;
  }) => {
    if (!context) {
      return detectedBottleCount > 0 || identifiedBottleCount > 0;
    }

    if (isConfidentNonBottleIntentTag(context.tag, context.confidence)) {
      return false;
    }

    if (isPeoplePlaceOrPairingTag(context.tag)) {
      return detectedBottleCount >= 2 || identifiedBottleCount >= 2;
    }

    return detectedBottleCount > 0 || identifiedBottleCount > 0;
  };

  try {
    const [labelResult, contextResults, lineupResults] = await Promise.all([
      shouldRunLabelAutofill && labelTarget
        ? requestLabelAutofill({
            baseUrl,
            photo: labelTarget,
            accessToken,
          })
        : Promise.resolve({
            payload: null as LabelAutofillResponse | null,
            errorMessage: null as string | null,
          }),
      Promise.all(
        contextTargets.map(async (photo): Promise<PhotoContextResult> => {
          const context = await requestPhotoContext({
            baseUrl,
            photo,
            accessToken,
          });
          return {
            id: photo.id,
            tag: context.tag,
            confidence: context.confidence,
          };
        })
      ),
      Promise.all(
        analysisPhotos.map(
          async (photo, photoIndex): Promise<LineupResult> => {
            const lineup = await requestLineupAutofill({
              baseUrl,
              photo,
              accessToken,
            });
            return {
              photoIndex,
              ...lineup,
            };
          }
        )
      ),
    ]);

    const photoIndexById = new Map(
      analysisPhotos.map((photo, index) => [photo.id, index])
    );
    const contextByPhotoId = new Map(contextResults.map((result) => [result.id, result]));

    const guardrailCountByPhotoIndex = new Map<number, number>();
    await Promise.all(
      analysisPhotos.map(async (photo, photoIndex) => {
        const context = contextByPhotoId.get(photo.id) ?? null;
        if (isConfidentNonBottleIntentTag(context?.tag ?? "unknown", context?.confidence ?? null)) {
          return;
        }

        const lineupResult = lineupResults[photoIndex];
        const identifiedBottleCount = lineupResult?.wines.length ?? 0;
        const detectedBottleCount =
          lineupResult?.detectedBottleCount ?? identifiedBottleCount;
        if (identifiedBottleCount > 1 || detectedBottleCount > 1) {
          return;
        }

        const countResult = await requestBottleCount({
          baseUrl,
          photo,
          accessToken,
        }).catch(() => ({
          bottleCount: null as number | null,
          errorMessage: null as string | null,
        }));
        if (
          typeof countResult.bottleCount === "number" &&
          Number.isFinite(countResult.bottleCount)
        ) {
          guardrailCountByPhotoIndex.set(
            photoIndex,
            Math.max(
              0,
              Math.min(MAX_GUARDRAIL_BOTTLE_COUNT, Math.round(countResult.bottleCount))
            )
          );
        }
      })
    );

    const resolveDetectedBottleCount = ({
      photoIndex,
      lineupResult,
    }: {
      photoIndex: number;
      lineupResult: LineupResult | null | undefined;
    }) => {
      const identifiedBottleCount = lineupResult?.wines.length ?? 0;
      const lineupDetectedCount =
        lineupResult?.detectedBottleCount ?? identifiedBottleCount;
      const guardrailCount = guardrailCountByPhotoIndex.get(photoIndex) ?? 0;
      return Math.max(
        0,
        Math.min(
          MAX_GUARDRAIL_BOTTLE_COUNT,
          Math.max(lineupDetectedCount, identifiedBottleCount, guardrailCount)
        )
      );
    };

    const labelTargetContext =
      labelTarget ? contextByPhotoId.get(labelTarget.id) ?? null : null;
    const shouldSkipSinglePhotoBottleExtraction = Boolean(
      shouldRunLabelAutofill &&
        labelTargetContext &&
        isConfidentNonBottleIntentTag(
          labelTargetContext.tag,
          labelTargetContext.confidence
        )
    );

    const taggedById = new Map<
      string,
      { type: UploadPhotoType; confidence: number | null }
    >(
      contextResults.map((result) => {
        const photoIndex = photoIndexById.get(result.id);
        const lineupResult =
          typeof photoIndex === "number" ? lineupResults[photoIndex] : null;
        const identifiedBottleCount = lineupResult?.wines.length ?? 0;
        const detectedBottleCount =
          typeof photoIndex === "number"
            ? resolveDetectedBottleCount({
                photoIndex,
                lineupResult,
              })
            : lineupResult?.detectedBottleCount ?? identifiedBottleCount;
        const hasExtractedWineDetails = identifiedBottleCount > 0;
        const hasStrongNonBottleIntent = isConfidentNonBottleIntentTag(
          result.tag,
          result.confidence
        );
        const hasStrongBottleEvidence =
          detectedBottleCount >= 2 ||
          identifiedBottleCount >= 2 ||
          hasExtractedWineDetails;
        const shouldForceBottleType =
          hasStrongBottleEvidence && !hasStrongNonBottleIntent;
        const forcedBottleType: UploadPhotoType | null = shouldForceBottleType
          ? labelTarget && result.id === labelTarget.id
            ? "label"
            : "other_bottles"
          : null;
        return [
          result.id,
          {
            type:
              forcedBottleType ??
              mapContextTagToPhotoType(result.tag, {
                confidence: result.confidence,
                detectedBottleCount,
                identifiedBottleCount,
              }),
            confidence: result.confidence,
          },
        ];
      })
    );

    setUploadPhotos((current) =>
      current.map((photo) => {
        if (shouldRunLabelAutofill && labelTarget && photo.id === labelTarget.id) {
          if (shouldSkipSinglePhotoBottleExtraction && labelTargetContext) {
            return {
              ...photo,
              type: mapContextTagToPhotoType(labelTargetContext.tag, {
                confidence: labelTargetContext.confidence,
                detectedBottleCount: 0,
                identifiedBottleCount: 0,
              }),
              contextConfidence: labelTargetContext.confidence,
            };
          }
          return {
            ...photo,
            type: "label",
          };
        }
        const tagged = taggedById.get(photo.id);
        if (!tagged) {
          return photo;
        }
        return {
          ...photo,
          type: tagged.type,
          contextConfidence: tagged.confidence,
        };
      })
    );

    let grapesFilled = false;
    if (!shouldSkipSinglePhotoBottleExtraction && labelResult.payload) {
      grapesFilled = await applyLabelAutofill(labelResult.payload);
    }

    const lineupErrors = lineupResults
      .filter((result) => {
        const sourcePhoto = analysisPhotos[result.photoIndex];
        if (!sourcePhoto) {
          return true;
        }
        const context = contextByPhotoId.get(sourcePhoto.id) ?? null;
        const identifiedBottleCount = result.wines.length;
        const detectedBottleCount = resolveDetectedBottleCount({
          photoIndex: result.photoIndex,
          lineupResult: result,
        });
        return shouldTreatPhotoAsBottleSource({
          context,
          detectedBottleCount,
          identifiedBottleCount,
        });
      })
      .map((result) => result.errorMessage)
      .filter((message): message is string => Boolean(message));

    const detectedLineupWines = lineupResults.flatMap((result) => {
      const sourcePhoto = analysisPhotos[result.photoIndex];
      if (!sourcePhoto) {
        return [];
      }
      const context = contextByPhotoId.get(sourcePhoto.id) ?? null;
      const identifiedBottleCount = result.wines.length;
      const detectedBottleCount = resolveDetectedBottleCount({
        photoIndex: result.photoIndex,
        lineupResult: result,
      });
      const includePhoto = shouldTreatPhotoAsBottleSource({
        context,
        detectedBottleCount,
        identifiedBottleCount,
      });
      if (!includePhoto) {
        return [];
      }

      const mappedWines = result.wines.map((wine, wineIndex) => ({
        ...wine,
        id: `${wine.id}-${result.photoIndex}-${wineIndex}`,
        photoIndex: result.photoIndex,
        included: true,
      }));

      const placeholdersNeeded = Math.max(
        0,
        Math.min(
          MAX_GUARDRAIL_BOTTLE_COUNT,
          detectedBottleCount - mappedWines.length
        )
      );
      const placeholders = Array.from({ length: placeholdersNeeded }, (_, index) => ({
        id: `placeholder-${sourcePhoto.id}-${result.photoIndex}-${index}`,
        photoIndex: result.photoIndex,
        included: true,
        wine_name: null,
        producer: null,
        vintage: null,
        country: null,
        region: null,
        appellation: null,
        classification: null,
        primary_grape_suggestions: [],
        confidence: null,
        bottle_bbox: null,
        label_bbox: null,
        label_anchor: null,
        focus_crop_data_url: null,
      }));

      return [...mappedWines, ...placeholders];
    });

    if (detectedLineupWines.length > 1) {
      setLineupWines(detectedLineupWines);
      setBulkCreateMessage(
        `Detected ${detectedLineupWines.length} bottles. Review and create entries below.`
      );
    } else {
      setLineupWines([]);
      setBulkCreateMessage(null);
    }

    const singleDetectedWine =
      detectedLineupWines.length === 1 ? detectedLineupWines[0] : null;
    const singleDetectedWineHasDetails = Boolean(
      singleDetectedWine && hasLineupWineDetails(singleDetectedWine)
    );
    const canFallbackToLineup =
      !shouldSkipSinglePhotoBottleExtraction &&
      !labelResult.payload &&
      singleDetectedWineHasDetails &&
      lineupErrors.length === 0;
    if (canFallbackToLineup && singleDetectedWine) {
      grapesFilled = (await applyLineupAutofill(singleDetectedWine)) || grapesFilled;
    }

    const analysisErrors = [
      !shouldSkipSinglePhotoBottleExtraction &&
      !canFallbackToLineup &&
      labelResult.errorMessage
        ? normalizeAnalysisErrorMessage(labelResult.errorMessage)
        : null,
      ...lineupErrors.map((message) => normalizeAnalysisErrorMessage(message)),
    ].filter((message): message is string => Boolean(message));

    if (analysisErrors.length > 0) {
      setUploadAnalysisStatus("error");
      setLastAnalysisConfidence?.(null);
      setUploadMessage(analysisErrors[0]);
      return;
    }

    setUploadAnalysisStatus("success");
    const warningCount = Array.isArray(labelResult.payload?.warnings)
      ? labelResult.payload?.warnings.length ?? 0
      : 0;
    const warningLabel =
      warningCount > 0
        ? `${warningCount} field${warningCount > 1 ? "s" : ""} uncertain`
        : null;
    const overallConfidence = computeOverallConfidence([
      labelResult.payload?.confidence ?? null,
      ...contextResults.map((result) => result.confidence),
    ]);
    setLastAnalysisConfidence?.(overallConfidence);
    const confidenceLabel =
      typeof overallConfidence === "number"
        ? `Confidence ${Math.round(overallConfidence * 100)}%`
        : null;
    const successSummary = [confidenceLabel, warningLabel]
      .filter(Boolean)
      .join(" • ");

    if (detectedLineupWines.length > 1) {
      setUploadMessage(
        `Detected ${detectedLineupWines.length} bottles. Review and create entries below.`
      );
      return;
    }

    if (shouldSkipSinglePhotoBottleExtraction && labelTargetContext) {
      setUploadMessage(
        `Detected ${labelTargetContext.tag} intent. Skipped bottle scan for this photo; switch photo type manually if this should be a bottle entry.`
      );
      return;
    }

    setUploadMessage(
      successSummary ||
        (grapesFilled
          ? "Autofill complete. Review the details."
          : "Autofill complete. Review and adjust as needed.")
    );
  } catch (error) {
    setUploadAnalysisStatus("error");
    setLastAnalysisConfidence?.(null);
    if (error instanceof Error && error.message) {
      setUploadMessage(error.message);
    } else {
      setUploadMessage("Unable to analyze photos. Check your connection and try again.");
    }
  } finally {
    setIsAutofillLoading(false);
  }
}
