import {
  normalizeProducerText,
  normalizeGrapeLookupValue,
  OTHER_BOTTLES_CONFIDENCE_THRESHOLD,
  resolveLineupWineDisplayName,
  runWithConcurrency,
  type PrivacyLevel,
} from "@cellarsnap/shared";
import {
  BULK_CREATE_CONCURRENCY,
  isNetworkFailureError,
  normalizePhotoUploadErrorMessage,
  type UploadPhotoType,
} from "./newEntryUtils";

export type PrimaryGrapeSelection = {
  id: string;
  name: string;
};

export type UploadPhotoItem = {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  type: UploadPhotoType;
  contextConfidence: number | null;
};

export type LineupWine = {
  id: string;
  photoIndex: number;
  included: boolean;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  classification: string | null;
  primary_grape_suggestions: string[];
  confidence: number | null;
  focus_crop_data_url?: string | null;
};

export type BulkEntryFormSnapshot = {
  rating: string;
  notes: string;
  location_text: string;
  location_place_id: string;
  consumed_at: string;
  entry_privacy: PrivacyLevel;
  reaction_privacy: PrivacyLevel;
  comments_privacy: PrivacyLevel;
};

export type BulkCreationResult = {
  included: LineupWine[];
  createdEntryIds: string[];
  failedCount: number;
  firstFailureMessage: string | null;
  lowConfidenceCount: number;
};

type InsertEntryFallbackResult = {
  error: { message: string } | null;
  entryId: string | null;
};

type BulkTaskResult = {
  entryId: string | null;
  errorMessage: string | null;
};

export async function runBulkCreateWorkflow({
  lineupWines,
  uploadPhotos,
  userId,
  selectedUserIds,
  form,
  defaultConsumedDate,
  accessToken,
  normalizedBaseUrl,
  setBulkCreateMessage,
  resolveSuggestedGrapes,
  insertEntryWithFallback,
  persistPrimaryGrapesByIds,
  uploadSpecificPhotosToEntry,
  rollbackEntry,
}: {
  lineupWines: LineupWine[];
  uploadPhotos: UploadPhotoItem[];
  userId: string;
  selectedUserIds: string[];
  form: BulkEntryFormSnapshot;
  defaultConsumedDate: string;
  accessToken: string | null;
  normalizedBaseUrl: string | null;
  setBulkCreateMessage: (value: string) => void;
  resolveSuggestedGrapes: (suggestions: string[]) => Promise<PrimaryGrapeSelection[]>;
  insertEntryWithFallback: (
    payload: Record<string, unknown>
  ) => Promise<InsertEntryFallbackResult>;
  persistPrimaryGrapesByIds: (entryId: string, ids: string[]) => Promise<void>;
  uploadSpecificPhotosToEntry: (
    entryId: string,
    ownerUserId: string,
    photosToUpload: UploadPhotoItem[]
  ) => Promise<void>;
  rollbackEntry: (entryId: string, ownerUserId: string) => Promise<void>;
}): Promise<BulkCreationResult> {
  const selected = lineupWines.filter((wine) => wine.included);
  const included = selected;

  const grapeLookupCache = new Map<string, PrimaryGrapeSelection[]>();
  const resolveSuggestedGrapesCached = async (suggestions: string[]) => {
    const normalizedKey = suggestions
      .map(normalizeGrapeLookupValue)
      .filter((value) => value.length > 0)
      .slice(0, 2)
      .join("|");
    if (!normalizedKey) {
      return [] as PrimaryGrapeSelection[];
    }
    const cached = grapeLookupCache.get(normalizedKey);
    if (cached) {
      return cached;
    }
    const resolved = await resolveSuggestedGrapes(suggestions.slice(0, 2));
    grapeLookupCache.set(normalizedKey, resolved);
    return resolved;
  };

  const grapeIdsByIndex = new Map<number, string[]>();
  await Promise.all(
    included.map(async (wine, index) => {
      const suggestions = wine.primary_grape_suggestions ?? [];
      if (suggestions.length > 0) {
        const resolved = await resolveSuggestedGrapesCached(suggestions);
        if (resolved.length > 0) {
          grapeIdsByIndex.set(index, resolved.map((grape) => grape.id));
        }
      }
    })
  );

  setBulkCreateMessage(`Creating entries... (0/${included.length} started)`);

  const ratingValue =
    form.rating.trim().length > 0 ? Number(form.rating.trim()) : null;
  const numericRating =
    typeof ratingValue === "number" && Number.isFinite(ratingValue)
      ? Math.max(1, Math.min(100, Math.round(ratingValue)))
      : null;

  let started = 0;
  let fatalCreationError: string | null = null;

  const creationTasks = included.map(
    (wine, index) =>
      async (): Promise<BulkTaskResult> => {
        if (fatalCreationError) {
          return { entryId: null, errorMessage: fatalCreationError };
        }

        try {
          const primaryGrapeIds = grapeIdsByIndex.get(index) ?? [];
          const defaultWineName = resolveLineupWineDisplayName(wine);
          const normalizedProducer = normalizeProducerText(wine.producer);

          let entryId: string | null = null;

          const createEntryViaSupabase = async () => {
            const fallbackPayload: Record<string, unknown> = {
              user_id: userId,
              wine_name: defaultWineName,
              producer: normalizedProducer,
              vintage: wine.vintage,
              country: wine.country,
              region: wine.region,
              appellation: wine.appellation,
              classification: wine.classification,
              notes: form.notes.trim().length > 0 ? form.notes.trim() : null,
              location_text:
                form.location_text.trim().length > 0
                  ? form.location_text.trim()
                  : null,
              location_place_id:
                form.location_place_id.trim().length > 0
                  ? form.location_place_id.trim()
                  : null,
              consumed_at: form.consumed_at || defaultConsumedDate,
              tasted_with_user_ids: selectedUserIds,
              entry_privacy: form.entry_privacy,
              reaction_privacy: form.reaction_privacy,
              comments_privacy: form.comments_privacy,
            };
            if (numericRating !== null) {
              fallbackPayload.rating = numericRating;
            }

            const createResult = await insertEntryWithFallback(fallbackPayload);
            if (createResult.error || !createResult.entryId) {
              throw new Error(
                createResult.error?.message ?? "Unable to create a bulk entry."
              );
            }
            const createdEntryId = createResult.entryId;
            await persistPrimaryGrapesByIds(createdEntryId, primaryGrapeIds);
            return createdEntryId;
          };

          if (normalizedBaseUrl && accessToken) {
            try {
              const response = await fetch(`${normalizedBaseUrl}/api/entries`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                  wine_name: defaultWineName,
                  producer: normalizedProducer,
                  vintage: wine.vintage,
                  country: wine.country,
                  region: wine.region,
                  appellation: wine.appellation,
                  classification: wine.classification,
                  primary_grape_ids: primaryGrapeIds,
                  rating: numericRating,
                  notes: form.notes.trim().length > 0 ? form.notes.trim() : null,
                  location_text:
                    form.location_text.trim().length > 0
                      ? form.location_text.trim()
                      : null,
                  location_place_id:
                    form.location_place_id.trim().length > 0
                      ? form.location_place_id.trim()
                      : null,
                  consumed_at: form.consumed_at || defaultConsumedDate,
                  tasted_with_user_ids: selectedUserIds,
                  entry_privacy: form.entry_privacy,
                  reaction_privacy: form.reaction_privacy,
                  comments_privacy: form.comments_privacy,
                  is_feed_visible: false,
                  skip_comparison_candidate: true,
                }),
              });

              const payload = (await response.json().catch(() => ({}))) as {
                entry?: { id?: string };
                error?: string;
              };
              if (!response.ok) {
                if (response.status === 401) {
                  throw new Error("Session expired. Sign in again to use bulk entry.");
                }
                if (response.status >= 500) {
                  entryId = await createEntryViaSupabase();
                } else {
                  throw new Error(payload.error || "Unable to create a bulk entry.");
                }
              } else {
                entryId = payload.entry?.id ?? null;
                if (!entryId) {
                  throw new Error(
                    "Bulk entry creation succeeded but no entry ID returned."
                  );
                }
              }
            } catch (error) {
              if (isNetworkFailureError(error)) {
                entryId = await createEntryViaSupabase();
              } else {
                throw error;
              }
            }
          } else {
            entryId = await createEntryViaSupabase();
          }

          if (!entryId) {
            throw new Error("Unable to create a bulk entry.");
          }

          started += 1;
          setBulkCreateMessage(
            started < included.length
              ? `Creating entries... (${started}/${included.length} started)`
              : "All entries started. Finishing photo uploads..."
          );

          const lineupSourcePhoto =
            uploadPhotos[wine.photoIndex] ??
            uploadPhotos.find((photo) => photo.type === "lineup") ??
            uploadPhotos.find((photo) => photo.type === "label") ??
            uploadPhotos[0];
          const croppedLabelPhoto =
            typeof wine.focus_crop_data_url === "string" &&
            wine.focus_crop_data_url.trim().length > 0
              ? ({
                  id: `${wine.id}-focus-crop`,
                  uri: wine.focus_crop_data_url,
                  name: `${wine.id}-focus.jpg`,
                  mimeType: "image/jpeg",
                  type: "label",
                  contextConfidence: wine.confidence,
                } as UploadPhotoItem)
              : null;
          const labelSourcePhoto = croppedLabelPhoto ?? lineupSourcePhoto;
          if (!labelSourcePhoto) {
            throw new Error("No source photo available for this bottle.");
          }

          const contextSourcePhotos = uploadPhotos.filter(
            (photo) => photo.id !== lineupSourcePhoto?.id
          );
          const photosForEntry: UploadPhotoItem[] = [{ ...labelSourcePhoto, type: "label" }];

          if (lineupSourcePhoto) {
            photosForEntry.push({ ...lineupSourcePhoto, type: "lineup" });
          }

          photosForEntry.push(
            ...contextSourcePhotos.map((photo) => ({
              ...photo,
              type: (photo.type === "label" ? "lineup" : photo.type) as UploadPhotoType,
            }))
          );

          try {
            await uploadSpecificPhotosToEntry(entryId, userId, photosForEntry);
          } catch (uploadError) {
            await rollbackEntry(entryId, userId);
            const uploadMessage = normalizePhotoUploadErrorMessage(uploadError);
            return { entryId: null, errorMessage: uploadMessage };
          }

          return { entryId, errorMessage: null };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Bulk entry creation failed.";
          fatalCreationError =
            fatalCreationError ?? (message.includes("Session expired") ? message : null);
          return { entryId: null, errorMessage: message };
        }
      }
  );

  const creationResults = await runWithConcurrency(
    creationTasks,
    BULK_CREATE_CONCURRENCY
  );

  const createdEntryIds = creationResults
    .map((result) => result.entryId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const failedCount = creationResults.length - createdEntryIds.length;
  const firstFailureMessage =
    creationResults.find(
      (result) => result.entryId === null && Boolean(result.errorMessage)
    )?.errorMessage ?? null;
  const lowConfidenceCount = included.filter(
    (wine) =>
      typeof wine.confidence === "number" &&
      Number.isFinite(wine.confidence) &&
      wine.confidence < OTHER_BOTTLES_CONFIDENCE_THRESHOLD
  ).length;

  return {
    included,
    createdEntryIds,
    failedCount,
    firstFailureMessage,
    lowConfidenceCount,
  };
}
