import {
  MAX_COLLECTION_NAME_LENGTH,
  type CollectionOption,
  type EntryCollectionSummary,
  type UserCollectionItemSummary,
  type UserCollectionSummary,
} from "@shared";
import {
  canUserViewEntry,
  getAcceptedFriendIds,
  getBlockedEitherWayUserIds,
  getFriendsOfFriendsIds,
} from "@/lib/access/entryVisibility";
import { requireRequestAuth } from "@/server/auth/requestAuth";
import { signPhotoUrls } from "@/server/storage/signedUrls";

type RequestSupabaseClient = Awaited<ReturnType<typeof requireRequestAuth>>["supabase"];

const COLLECTION_COVER_EXTENSIONS = ["jpg", "png", "webp", "gif"] as const;
const COLLECTION_COVER_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
const COLLECTION_COVER_MAX_SIZE_BYTES = 5 * 1024 * 1024;

type CollectionRow = {
  id: string;
  user_id: string;
  name: string;
  cover_image_path: string | null;
  created_at: string;
  updated_at: string;
};

type CollectionItemRow = {
  id: string;
  collection_id: string;
  user_id: string;
  entry_id: string;
  snapshot_entry_group_id: string | null;
  snapshot_wine_name: string | null;
  snapshot_producer: string | null;
  snapshot_vintage: string | null;
  snapshot_consumed_at: string | null;
  snapshot_preview_image_path: string | null;
  snapshot_label_image_path: string | null;
  created_at: string;
};

type CollectionItemCoverRow = Pick<
  CollectionItemRow,
  | "collection_id"
  | "snapshot_preview_image_path"
  | "snapshot_label_image_path"
  | "created_at"
>;

type EntrySnapshotRow = {
  id: string;
  user_id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  consumed_at: string | null;
  entry_group_id?: string | null;
  entry_privacy: "public" | "friends_of_friends" | "friends" | "private";
  label_image_path: string | null;
};

type EntryPhotoRow = {
  entry_id: string;
  type: string;
  path: string;
  position: number;
  created_at: string;
};

function normalizeCollectionName(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, MAX_COLLECTION_NAME_LENGTH);
}

function compareCollectionNames(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function extensionForCollectionCoverType(mimeType: string) {
  if (mimeType === "image/png") {
    return "png";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  if (mimeType === "image/gif") {
    return "gif";
  }
  return "jpg";
}

function buildCollectionCoverPath(
  userId: string,
  collectionId: string,
  extension: (typeof COLLECTION_COVER_EXTENSIONS)[number]
) {
  return `${userId}/collections/${collectionId}/cover.${extension}`;
}

function listCollectionCoverVariantPaths(userId: string, collectionId: string) {
  return COLLECTION_COVER_EXTENSIONS.map((extension) =>
    buildCollectionCoverPath(userId, collectionId, extension)
  );
}

async function loadCollectionRowsForUser(
  supabase: RequestSupabaseClient,
  userId: string
) {
  const { data, error } = await supabase
    .from("user_collections")
    .select("id, user_id, name, cover_image_path, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message ?? "Unable to load collections.");
  }

  return (data ?? []) as CollectionRow[];
}

function toCollectionOptions(rows: CollectionRow[]): CollectionOption[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
  }));
}

async function loadOwnedCollectionRow({
  supabase,
  userId,
  collectionId,
}: {
  supabase: RequestSupabaseClient;
  userId: string;
  collectionId: string;
}) {
  const { data, error } = await supabase
    .from("user_collections")
    .select("id, user_id, name, cover_image_path, created_at, updated_at")
    .eq("user_id", userId)
    .eq("id", collectionId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Collection not found.");
  }

  return data as CollectionRow;
}

export async function createOrFindUserCollection({
  supabase,
  userId,
  name,
}: {
  supabase: RequestSupabaseClient;
  userId: string;
  name: string;
}) {
  const normalizedName = normalizeCollectionName(name);
  if (!normalizedName) {
    throw new Error("Collection name is required.");
  }

  const existingRows = await loadCollectionRowsForUser(supabase, userId);
  const existing = existingRows.find((row) =>
    compareCollectionNames(row.name, normalizedName)
  );

  if (existing) {
    return {
      created: false,
      collection: {
        id: existing.id,
        name: existing.name,
      } satisfies CollectionOption,
    };
  }

  const insertResult = await supabase
    .from("user_collections")
    .insert({
      user_id: userId,
      name: normalizedName,
    })
    .select("id, name")
    .single();

  if (insertResult.error) {
    throw new Error(insertResult.error.message ?? "Unable to create collection.");
  }

  return {
    created: true,
    collection: {
      id: insertResult.data.id,
      name: insertResult.data.name,
    } satisfies CollectionOption,
  };
}

async function loadCollectionItemCoverRows(
  supabase: RequestSupabaseClient,
  userId: string,
  collectionIds: string[]
) {
  if (collectionIds.length === 0) {
    return [] as CollectionItemCoverRow[];
  }

  const { data, error } = await supabase
    .from("user_collection_items")
    .select(
      "collection_id, snapshot_preview_image_path, snapshot_label_image_path, created_at"
    )
    .eq("user_id", userId)
    .in("collection_id", collectionIds)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message ?? "Unable to load collection items.");
  }

  return (data ?? []) as CollectionItemCoverRow[];
}

async function signCollectionImagePaths(
  supabase: RequestSupabaseClient,
  paths: Iterable<string>
) {
  const uniquePaths = new Set<string>();
  for (const path of paths) {
    if (path) {
      uniquePaths.add(path);
    }
  }
  return signPhotoUrls(uniquePaths, supabase);
}

export async function listUserCollections({
  supabase,
  userId,
}: {
  supabase: RequestSupabaseClient;
  userId: string;
}): Promise<UserCollectionSummary[]> {
  const collections = await loadCollectionRowsForUser(supabase, userId);
  const itemRows = await loadCollectionItemCoverRows(
    supabase,
    userId,
    collections.map((row) => row.id)
  );

  const itemCounts = new Map<string, number>();
  const firstCoverPathByCollectionId = new Map<string, string>();

  itemRows.forEach((row) => {
    itemCounts.set(row.collection_id, (itemCounts.get(row.collection_id) ?? 0) + 1);
    if (!firstCoverPathByCollectionId.has(row.collection_id)) {
      const coverPath =
        row.snapshot_preview_image_path ?? row.snapshot_label_image_path ?? null;
      if (coverPath) {
        firstCoverPathByCollectionId.set(row.collection_id, coverPath);
      }
    }
  });

  const signedUrlByPath = await signCollectionImagePaths(
    supabase,
    collections.map(
      (row) =>
        row.cover_image_path ??
        firstCoverPathByCollectionId.get(row.id) ??
        ""
    )
  );

  return collections.map((row) => {
    const effectiveCoverPath =
      row.cover_image_path ?? firstCoverPathByCollectionId.get(row.id) ?? null;
    return {
      id: row.id,
      name: row.name,
      created_at: row.created_at,
      updated_at: row.updated_at,
      item_count: itemCounts.get(row.id) ?? 0,
      cover_image_url: effectiveCoverPath
        ? signedUrlByPath.get(effectiveCoverPath) ?? null
        : null,
    };
  });
}

async function validateCollectionOwnership({
  supabase,
  userId,
  collectionIds,
}: {
  supabase: RequestSupabaseClient;
  userId: string;
  collectionIds: string[];
}) {
  const uniqueIds = Array.from(new Set(collectionIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return [] as CollectionRow[];
  }

  const { data, error } = await supabase
    .from("user_collections")
    .select("id, user_id, name, cover_image_path, created_at, updated_at")
    .eq("user_id", userId)
    .in("id", uniqueIds);

  if (error) {
    throw new Error(error.message ?? "Unable to validate collections.");
  }

  const rows = (data ?? []) as CollectionRow[];
  if (rows.length !== uniqueIds.length) {
    throw new Error("One or more selected collections are unavailable.");
  }

  return rows;
}

async function loadVisibleEntryForCollections({
  supabase,
  viewerUserId,
  entryId,
}: {
  supabase: RequestSupabaseClient;
  viewerUserId: string;
  entryId: string;
}) {
  const { data, error } = await supabase
    .from("wine_entries")
    .select(
      "id, user_id, wine_name, producer, vintage, consumed_at, entry_group_id, entry_privacy, label_image_path"
    )
    .eq("id", entryId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Entry unavailable.");
  }

  const entry = data as EntrySnapshotRow;

  if (viewerUserId !== entry.user_id) {
    const blockedUserIds = await getBlockedEitherWayUserIds(supabase, viewerUserId);
    const acceptedFriendIds = await getAcceptedFriendIds(supabase, viewerUserId);
    const friendsOfFriendsIds = await getFriendsOfFriendsIds(
      supabase,
      viewerUserId,
      acceptedFriendIds
    );

    const canView = await canUserViewEntry({
      supabase,
      viewerUserId,
      ownerUserId: entry.user_id,
      entryPrivacy: entry.entry_privacy,
      acceptedFriendIds,
      friendsOfFriendsIds,
      blockedUserIds,
    });

    if (!canView) {
      throw new Error("You can only save posts that are visible to you.");
    }
  }

  const { data: photos, error: photoError } = await supabase
    .from("entry_photos")
    .select("entry_id, type, path, position, created_at")
    .eq("entry_id", entryId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (photoError) {
    throw new Error(photoError.message ?? "Unable to load entry photos.");
  }

  const photoRows = (photos ?? []) as EntryPhotoRow[];
  const firstPhotoPath = photoRows[0]?.path ?? entry.label_image_path ?? null;
  const firstLabelPhotoPath =
    photoRows.find((row) => row.type === "label")?.path ?? entry.label_image_path ?? null;

  return {
    entry,
    snapshot: {
      entry_id: entry.id,
      snapshot_entry_group_id:
        typeof entry.entry_group_id === "string" ? entry.entry_group_id : null,
      snapshot_wine_name: entry.wine_name ?? null,
      snapshot_producer: entry.producer ?? null,
      snapshot_vintage: entry.vintage ?? null,
      snapshot_consumed_at: entry.consumed_at ?? null,
      snapshot_preview_image_path: firstPhotoPath,
      snapshot_label_image_path: firstLabelPhotoPath,
    },
  };
}

export async function addEntryToCollections({
  supabase,
  userId,
  entryId,
  collectionIds,
}: {
  supabase: RequestSupabaseClient;
  userId: string;
  entryId: string;
  collectionIds: string[];
}) {
  const ownedCollections = await validateCollectionOwnership({
    supabase,
    userId,
    collectionIds,
  });

  if (ownedCollections.length === 0) {
    return {
      addedCollectionIds: [] as string[],
      alreadySavedCollectionIds: [] as string[],
      memberships: [] as EntryCollectionSummary[],
    };
  }

  const { snapshot } = await loadVisibleEntryForCollections({
    supabase,
    viewerUserId: userId,
    entryId,
  });

  const targetCollectionIds = ownedCollections.map((row) => row.id);
  const { data: existingRows, error: existingError } = await supabase
    .from("user_collection_items")
    .select("collection_id")
    .eq("user_id", userId)
    .eq("entry_id", entryId)
    .in("collection_id", targetCollectionIds);

  if (existingError) {
    throw new Error(existingError.message ?? "Unable to update collection items.");
  }

  const alreadySavedCollectionIds = new Set(
    ((existingRows ?? []) as { collection_id: string }[]).map((row) => row.collection_id)
  );
  const missingCollectionIds = targetCollectionIds.filter(
    (collectionId) => !alreadySavedCollectionIds.has(collectionId)
  );

  if (missingCollectionIds.length > 0) {
    const insertRows = missingCollectionIds.map((collectionId) => ({
      collection_id: collectionId,
      user_id: userId,
      ...snapshot,
    }));

    const insertResult = await supabase
      .from("user_collection_items")
      .insert(insertRows);

    if (insertResult.error) {
      throw new Error(insertResult.error.message ?? "Unable to add to collections.");
    }
  }

  const touchedCollectionIds = Array.from(
    new Set([...targetCollectionIds, ...missingCollectionIds])
  );
  if (touchedCollectionIds.length > 0) {
    await supabase
      .from("user_collections")
      .update({ updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .in("id", touchedCollectionIds);
  }

  const membershipsByEntryId = await listEntryCollectionsByEntryIds({
    supabase,
    userId,
    entryIds: [entryId],
  });

  return {
    addedCollectionIds: missingCollectionIds,
    alreadySavedCollectionIds: Array.from(alreadySavedCollectionIds),
    memberships: membershipsByEntryId[entryId] ?? [],
  };
}

export async function listEntryCollectionsByEntryIds({
  supabase,
  userId,
  entryIds,
}: {
  supabase: RequestSupabaseClient;
  userId: string;
  entryIds: string[];
}): Promise<Record<string, EntryCollectionSummary[]>> {
  const uniqueEntryIds = Array.from(new Set(entryIds.filter(Boolean)));
  if (uniqueEntryIds.length === 0) {
    return {};
  }

  const { data: itemRows, error: itemError } = await supabase
    .from("user_collection_items")
    .select("entry_id, collection_id, created_at")
    .eq("user_id", userId)
    .in("entry_id", uniqueEntryIds)
    .order("created_at", { ascending: true });

  if (itemError) {
    throw new Error(itemError.message ?? "Unable to load entry collections.");
  }

  const rows = (itemRows ?? []) as Array<{
    entry_id: string;
    collection_id: string;
    created_at: string;
  }>;
  const collectionIds = Array.from(new Set(rows.map((row) => row.collection_id)));

  if (collectionIds.length === 0) {
    return {};
  }

  const { data: collectionRows, error: collectionError } = await supabase
    .from("user_collections")
    .select("id, name")
    .eq("user_id", userId)
    .in("id", collectionIds);

  if (collectionError) {
    throw new Error(collectionError.message ?? "Unable to load collections.");
  }

  const collectionNameById = new Map(
    ((collectionRows ?? []) as Array<{ id: string; name: string }>).map((row) => [
      row.id,
      row.name,
    ])
  );

  return rows.reduce<Record<string, EntryCollectionSummary[]>>((acc, row) => {
    const name = collectionNameById.get(row.collection_id);
    if (!name) {
      return acc;
    }
    const current = acc[row.entry_id] ?? [];
    current.push({
      id: row.collection_id,
      name,
      added_at: row.created_at,
    });
    acc[row.entry_id] = current;
    return acc;
  }, {});
}

export async function getCollectionDetail({
  supabase,
  userId,
  collectionId,
}: {
  supabase: RequestSupabaseClient;
  userId: string;
  collectionId: string;
}) {
  const { data: collectionData, error: collectionError } = await supabase
    .from("user_collections")
    .select("id, user_id, name, cover_image_path, created_at, updated_at")
    .eq("user_id", userId)
    .eq("id", collectionId)
    .maybeSingle();

  if (collectionError || !collectionData) {
    throw new Error("Collection not found.");
  }

  const collection = collectionData as CollectionRow;

  const { data: itemData, error: itemError } = await supabase
    .from("user_collection_items")
    .select(
      "id, collection_id, user_id, entry_id, snapshot_entry_group_id, snapshot_wine_name, snapshot_producer, snapshot_vintage, snapshot_consumed_at, snapshot_preview_image_path, snapshot_label_image_path, created_at"
    )
    .eq("user_id", userId)
    .eq("collection_id", collectionId)
    .order("created_at", { ascending: false });

  if (itemError) {
    throw new Error(itemError.message ?? "Unable to load collection items.");
  }

  const items = (itemData ?? []) as CollectionItemRow[];
  const coverPath =
    collection.cover_image_path ??
    items[items.length - 1]?.snapshot_preview_image_path ??
    items[items.length - 1]?.snapshot_label_image_path ??
    null;
  const signedUrlByPath = await signCollectionImagePaths(
    supabase,
    [
      coverPath ?? "",
      ...items.flatMap((item) => [
        item.snapshot_preview_image_path ?? "",
        item.snapshot_label_image_path ?? "",
      ]),
    ]
  );

  return {
    collection: {
      id: collection.id,
      name: collection.name,
      created_at: collection.created_at,
      updated_at: collection.updated_at,
      item_count: items.length,
      cover_image_url: coverPath ? signedUrlByPath.get(coverPath) ?? null : null,
    } satisfies UserCollectionSummary,
    items: items.map((item) => ({
      id: item.id,
      entry_id: item.entry_id,
      wine_name: item.snapshot_wine_name ?? null,
      producer: item.snapshot_producer ?? null,
      vintage: item.snapshot_vintage ?? null,
      consumed_at: item.snapshot_consumed_at ?? null,
      preview_image_url: item.snapshot_preview_image_path
        ? signedUrlByPath.get(item.snapshot_preview_image_path) ?? null
        : null,
      label_image_url: item.snapshot_label_image_path
        ? signedUrlByPath.get(item.snapshot_label_image_path) ?? null
        : null,
      added_at: item.created_at,
    })) satisfies UserCollectionItemSummary[],
  };
}

export async function updateUserCollectionName({
  supabase,
  userId,
  collectionId,
  name,
}: {
  supabase: RequestSupabaseClient;
  userId: string;
  collectionId: string;
  name: string;
}) {
  const normalizedName = normalizeCollectionName(name);
  if (!normalizedName) {
    throw new Error("Collection name is required.");
  }

  const currentCollection = await loadOwnedCollectionRow({
    supabase,
    userId,
    collectionId,
  });

  if (!compareCollectionNames(currentCollection.name, normalizedName)) {
    const existingRows = await loadCollectionRowsForUser(supabase, userId);
    const conflictingCollection = existingRows.find(
      (row) =>
        row.id !== collectionId && compareCollectionNames(row.name, normalizedName)
    );

    if (conflictingCollection) {
      throw new Error("You already have a collection with that name.");
    }
  }

  const { error } = await supabase
    .from("user_collections")
    .update({
      name: normalizedName,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", collectionId);

  if (error) {
    throw new Error(error.message ?? "Unable to update collection.");
  }

  const detail = await getCollectionDetail({
    supabase,
    userId,
    collectionId,
  });
  return detail.collection;
}

export async function updateUserCollectionCover({
  supabase,
  userId,
  collectionId,
  file,
}: {
  supabase: RequestSupabaseClient;
  userId: string;
  collectionId: string;
  file: File;
}) {
  const currentCollection = await loadOwnedCollectionRow({
    supabase,
    userId,
    collectionId,
  });

  if (file.size > COLLECTION_COVER_MAX_SIZE_BYTES) {
    throw new Error("Image must be 5 MB or smaller.");
  }

  if (!COLLECTION_COVER_ALLOWED_TYPES.includes(file.type as (typeof COLLECTION_COVER_ALLOWED_TYPES)[number])) {
    throw new Error("Image must be JPEG, PNG, WebP, or GIF.");
  }

  const extension = extensionForCollectionCoverType(file.type);
  const nextPath = buildCollectionCoverPath(userId, collectionId, extension);

  const { error: uploadError } = await supabase.storage
    .from("wine-photos")
    .upload(nextPath, file, {
      upsert: true,
      contentType: file.type,
    });

  if (uploadError) {
    throw new Error(uploadError.message ?? "Unable to upload collection cover.");
  }

  const { error: updateError } = await supabase
    .from("user_collections")
    .update({
      cover_image_path: nextPath,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", collectionId);

  if (updateError) {
    if (currentCollection.cover_image_path !== nextPath) {
      await supabase.storage.from("wine-photos").remove([nextPath]);
    }
    throw new Error(updateError.message ?? "Unable to save collection cover.");
  }

  const stalePaths = listCollectionCoverVariantPaths(userId, collectionId).filter(
    (path) => path !== nextPath
  );
  if (stalePaths.length > 0) {
    await supabase.storage.from("wine-photos").remove(stalePaths);
  }

  const detail = await getCollectionDetail({
    supabase,
    userId,
    collectionId,
  });
  return detail.collection;
}

export async function deleteUserCollection({
  supabase,
  userId,
  collectionId,
}: {
  supabase: RequestSupabaseClient;
  userId: string;
  collectionId: string;
}) {
  await loadOwnedCollectionRow({
    supabase,
    userId,
    collectionId,
  });

  const { error } = await supabase
    .from("user_collections")
    .delete()
    .eq("user_id", userId)
    .eq("id", collectionId);

  if (error) {
    throw new Error(error.message ?? "Unable to delete collection.");
  }

  const customCoverPaths = listCollectionCoverVariantPaths(userId, collectionId);
  if (customCoverPaths.length > 0) {
    await supabase.storage.from("wine-photos").remove(customCoverPaths);
  }

  return { deleted: true as const };
}

export async function getCollectionOptionsForUser({
  supabase,
  userId,
}: {
  supabase: RequestSupabaseClient;
  userId: string;
}) {
  const rows = await loadCollectionRowsForUser(supabase, userId);
  return toCollectionOptions(rows);
}
