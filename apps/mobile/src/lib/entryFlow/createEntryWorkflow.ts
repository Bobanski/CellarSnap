type InsertEntryFallbackResult = {
  error: { message: string } | null;
  entryId: string | null;
};

export async function runCreateEntryWorkflow<TComparisonCandidate>({
  userId,
  payload,
  insertEntryWithFallback,
  persistPrimaryGrapes,
  uploadPhotosToEntry,
  fetchComparisonCandidateForEntry,
  normalizePhotoUploadErrorMessage,
}: {
  userId: string;
  payload: Record<string, unknown>;
  insertEntryWithFallback: (
    payload: Record<string, unknown>
  ) => Promise<InsertEntryFallbackResult>;
  persistPrimaryGrapes: (entryId: string) => Promise<void>;
  uploadPhotosToEntry: (entryId: string, ownerUserId: string) => Promise<void>;
  fetchComparisonCandidateForEntry: (
    entryId: string,
    ownerUserId: string
  ) => Promise<TComparisonCandidate | null>;
  normalizePhotoUploadErrorMessage: (value: unknown) => string;
}): Promise<
  | {
      ok: true;
      entryId: string;
      uploadWarningMessage: string | null;
      comparisonCandidate: TComparisonCandidate | null;
    }
  | {
      ok: false;
      errorMessage: string;
    }
> {
  const { error, entryId } = await insertEntryWithFallback(payload);

  if (error) {
    return {
      ok: false,
      errorMessage: error.message,
    };
  }

  if (!entryId) {
    return {
      ok: false,
      errorMessage: "Entry created, but response was missing the entry ID.",
    };
  }

  await persistPrimaryGrapes(entryId);

  let uploadWarningMessage: string | null = null;
  try {
    await uploadPhotosToEntry(entryId, userId);
  } catch (uploadError) {
    const message = normalizePhotoUploadErrorMessage(uploadError);
    uploadWarningMessage = `Entry saved, but at least one photo failed to upload (${message}). You can edit the entry and re-upload.`;
  }

  let comparisonCandidate: TComparisonCandidate | null = null;
  try {
    comparisonCandidate = await fetchComparisonCandidateForEntry(entryId, userId);
  } catch {
    comparisonCandidate = null;
  }

  return {
    ok: true,
    entryId,
    uploadWarningMessage,
    comparisonCandidate,
  };
}
