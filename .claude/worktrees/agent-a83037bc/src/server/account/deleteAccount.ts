import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

const PHOTO_BUCKET = "wine-photos";
const STORAGE_LIST_LIMIT = 1000;
const STORAGE_REMOVE_BATCH_SIZE = 100;

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

type StorageListObject = {
  key?: string;
};

export type DeleteUserAccountResult = {
  deleted: true;
  mediaCleanupPending: boolean;
  removedStorageObjectCount: number;
};

function chunkPaths(paths: string[]) {
  const batches: string[][] = [];

  for (let start = 0; start < paths.length; start += STORAGE_REMOVE_BATCH_SIZE) {
    batches.push(paths.slice(start, start + STORAGE_REMOVE_BATCH_SIZE));
  }

  return batches;
}

export async function listUserStoragePaths(
  supabaseAdmin: SupabaseAdminClient,
  userId: string
) {
  const bucket = supabaseAdmin.storage.from(PHOTO_BUCKET);
  const storagePaths: string[] = [];
  let cursor: string | undefined;

  while (true) {
    const { data, error } = await bucket.listV2({
      prefix: `${userId}/`,
      cursor,
      limit: STORAGE_LIST_LIMIT,
      with_delimiter: false,
    });

    if (error) {
      throw new Error(error.message);
    }

    for (const object of data?.objects ?? []) {
      if (typeof (object as StorageListObject).key === "string") {
        storagePaths.push((object as StorageListObject).key as string);
      }
    }

    if (!data?.hasNext || !data.nextCursor) {
      break;
    }

    cursor = data.nextCursor;
  }

  return storagePaths;
}

export async function deleteUserAccount(
  supabaseAdmin: SupabaseAdminClient,
  userId: string
): Promise<DeleteUserAccountResult> {
  let storagePaths: string[] = [];
  let mediaCleanupPending = false;
  let removedStorageObjectCount = 0;

  try {
    storagePaths = await listUserStoragePaths(supabaseAdmin, userId);
  } catch {
    mediaCleanupPending = true;
  }

  const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    throw new Error(deleteUserError.message);
  }

  for (const batch of chunkPaths(storagePaths)) {
    const { error: removeError } = await supabaseAdmin.storage
      .from(PHOTO_BUCKET)
      .remove(batch);

    if (removeError) {
      mediaCleanupPending = true;
      continue;
    }

    removedStorageObjectCount += batch.length;
  }

  return {
    deleted: true,
    mediaCleanupPending,
    removedStorageObjectCount,
  };
}
