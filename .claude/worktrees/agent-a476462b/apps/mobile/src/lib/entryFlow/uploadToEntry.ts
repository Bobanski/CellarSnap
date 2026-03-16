import { extensionForMimeType, readPhotoBytes } from "./photoIO";
import {
  LEGACY_UPLOAD_COLUMN_BY_TYPE,
  MAX_PHOTOS_PER_TYPE,
  PHOTO_TYPE_LABELS,
  isEntryPhotosSchemaCompatibilityError,
  isLegacyUploadPhotoType,
  type UploadPhotoType,
} from "./newEntryUtils";

export type UploadPhotoInput = {
  id: string;
  uri: string;
  mimeType: string;
  type: UploadPhotoType;
};

export type UploadedEntryPhotoRecord = {
  photoId: string;
  type: UploadPhotoType;
  path: string;
  position: number;
};

type SupabaseAnyClient = typeof import("@/src/lib/supabase").supabase;

async function uploadPhotoToEntryRecord({
  supabase,
  entryId,
  ownerUserId,
  photo,
  position,
}: {
  supabase: SupabaseAnyClient;
  entryId: string;
  ownerUserId: string;
  photo: UploadPhotoInput;
  position: number;
}): Promise<UploadedEntryPhotoRecord> {
  let createdPhotoId: string | null = null;
  let uploadedPath: string | null = null;

  try {
    const createResult = await supabase
      .from("entry_photos")
      .insert({
        entry_id: entryId,
        type: photo.type,
        path: "pending",
        position,
      })
      .select("id")
      .single();

    if (createResult.error || !createResult.data?.id) {
      throw new Error(createResult.error?.message ?? "Unable to create photo record.");
    }

    createdPhotoId = createResult.data.id;
    const extension = extensionForMimeType(photo.mimeType);
    uploadedPath = `${ownerUserId}/${entryId}/${photo.type}/${createdPhotoId}.${extension}`;

    const updateResult = await supabase
      .from("entry_photos")
      .update({ path: uploadedPath })
      .eq("id", createdPhotoId)
      .eq("entry_id", entryId);

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    const fileBytes = await readPhotoBytes(photo.uri);

    const uploadResult = await supabase.storage
      .from("wine-photos")
      .upload(uploadedPath, fileBytes, {
        upsert: true,
        contentType: photo.mimeType,
      });

    if (uploadResult.error) {
      throw new Error(uploadResult.error.message);
    }

    return {
      photoId: photo.id,
      type: photo.type,
      path: uploadedPath,
      position,
    };
  } catch (error) {
    if (uploadedPath) {
      await supabase.storage.from("wine-photos").remove([uploadedPath]);
    }
    if (createdPhotoId) {
      await supabase
        .from("entry_photos")
        .delete()
        .eq("id", createdPhotoId)
        .eq("entry_id", entryId);
    }
    throw error;
  }
}

async function uploadLegacyPhotoToEntryRecord({
  supabase,
  entryId,
  ownerUserId,
  photo,
}: {
  supabase: SupabaseAnyClient;
  entryId: string;
  ownerUserId: string;
  photo: UploadPhotoInput;
}): Promise<UploadedEntryPhotoRecord> {
  if (!isLegacyUploadPhotoType(photo.type)) {
    throw new Error("Legacy upload fallback only supports label/place/pairing photos.");
  }

  const extension = extensionForMimeType(photo.mimeType);
  const fallbackId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const uploadedPath = `${ownerUserId}/${entryId}/${photo.type}/legacy-${fallbackId}.${extension}`;
  const legacyColumn = LEGACY_UPLOAD_COLUMN_BY_TYPE[photo.type];
  const fileBytes = await readPhotoBytes(photo.uri);

  const uploadResult = await supabase.storage
    .from("wine-photos")
    .upload(uploadedPath, fileBytes, {
      upsert: true,
      contentType: photo.mimeType,
    });

  if (uploadResult.error) {
    throw new Error(uploadResult.error.message);
  }

  const { error: updateError } = await supabase
    .from("wine_entries")
    .update({ [legacyColumn]: uploadedPath })
    .eq("id", entryId)
    .eq("user_id", ownerUserId);

  if (updateError) {
    await supabase.storage.from("wine-photos").remove([uploadedPath]);
    throw new Error(updateError.message);
  }

  return {
    photoId: photo.id,
    type: photo.type,
    path: uploadedPath,
    position: 0,
  };
}

export async function uploadPhotosToEntryWithFallback({
  supabase,
  entryId,
  ownerUserId,
  photosToUpload,
}: {
  supabase: SupabaseAnyClient;
  entryId: string;
  ownerUserId: string;
  photosToUpload: UploadPhotoInput[];
}): Promise<UploadedEntryPhotoRecord[]> {
  if (photosToUpload.length === 0) {
    return [];
  }

  const typeCount = new Map<UploadPhotoType, number>();
  for (const photo of photosToUpload) {
    const count = (typeCount.get(photo.type) ?? 0) + 1;
    typeCount.set(photo.type, count);
    if (count > MAX_PHOTOS_PER_TYPE) {
      throw new Error(
        `Max ${MAX_PHOTOS_PER_TYPE} photos allowed for ${PHOTO_TYPE_LABELS[photo.type]}.`
      );
    }
  }

  const positionByType = new Map<UploadPhotoType, number>();
  const uploadedRecords: UploadedEntryPhotoRecord[] = [];
  for (const photo of photosToUpload) {
    const position = positionByType.get(photo.type) ?? 0;
    try {
      const uploadedRecord = await uploadPhotoToEntryRecord({
        supabase,
        entryId,
        ownerUserId,
        photo,
        position,
      });
      uploadedRecords.push(uploadedRecord);
    } catch (error) {
      if (
        isEntryPhotosSchemaCompatibilityError(error) &&
        isLegacyUploadPhotoType(photo.type)
      ) {
        const uploadedRecord = await uploadLegacyPhotoToEntryRecord({
          supabase,
          entryId,
          ownerUserId,
          photo,
        });
        uploadedRecords.push(uploadedRecord);
      } else {
        throw error;
      }
    }
    positionByType.set(photo.type, position + 1);
  }

  return uploadedRecords;
}
