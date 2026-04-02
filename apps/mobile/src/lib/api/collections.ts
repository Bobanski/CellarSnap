import type {
  CollectionOption,
  EntryCollectionSummary,
  UserCollectionItemSummary,
  UserCollectionSummary,
} from "@cellarsnap/shared";
import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";

type ApiErrorResponse = {
  error?: string;
};

type CreateCollectionResponse = {
  created?: boolean;
  collection?: CollectionOption;
  error?: string;
};

type AddCollectionItemsResponse = {
  added_collection_ids?: string[];
  already_saved_collection_ids?: string[];
  memberships?: EntryCollectionSummary[];
  error?: string;
};

type CollectionDetailResponse = {
  collection?: UserCollectionSummary;
  items?: UserCollectionItemSummary[];
  error?: string;
};

type UpdateCollectionResponse = {
  collection?: UserCollectionSummary;
  error?: string;
};

type DeleteCollectionResponse = {
  deleted?: boolean;
  error?: string;
};

type EntryCollectionsResponse = {
  memberships?: Record<string, EntryCollectionSummary[]>;
  error?: string;
};

async function authorizedFetch(
  input: string,
  init?: RequestInit
): Promise<
  | { ok: true; response: Response }
  | { ok: false; errorMessage: string }
> {
  const baseUrl = getWebApiBaseUrl();
  if (!baseUrl) {
    return {
      ok: false,
      errorMessage: "Set EXPO_PUBLIC_WEB_API_BASE_URL to use collections.",
    };
  }

  const accessToken = await getAccessTokenForApi();
  if (!accessToken) {
    return {
      ok: false,
      errorMessage: "Session expired. Sign in again and try.",
    };
  }

  try {
    const response = await fetch(`${baseUrl}${input}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init?.headers ?? {}),
      },
    });
    return { ok: true, response };
  } catch {
    return {
      ok: false,
      errorMessage: "Unable to reach the server right now. Try again in a moment.",
    };
  }
}

export async function fetchUserCollections(): Promise<
  | { ok: true; collections: UserCollectionSummary[] }
  | { ok: false; errorMessage: string }
> {
  const result = await authorizedFetch("/api/collections");
  if (!result.ok) {
    return result;
  }

  const payload = (await result.response.json().catch(() => null)) as
    | { collections?: UserCollectionSummary[] }
    | ApiErrorResponse
    | null;

  if (!result.response.ok) {
    return {
      ok: false,
      errorMessage:
        payload && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Unable to load collections.",
    };
  }

  return {
    ok: true,
    collections: (payload as { collections?: UserCollectionSummary[] })?.collections ?? [],
  };
}

export async function createUserCollection(name: string): Promise<
  | { ok: true; created: boolean; collection: CollectionOption }
  | { ok: false; errorMessage: string }
> {
  const result = await authorizedFetch("/api/collections", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });

  if (!result.ok) {
    return result;
  }

  const payload = (await result.response.json().catch(() => null)) as
    | CreateCollectionResponse
    | null;

  if (!result.response.ok || !payload?.collection) {
    return {
      ok: false,
      errorMessage: payload?.error ?? "Unable to create collection.",
    };
  }

  return {
    ok: true,
    created: payload.created === true,
    collection: payload.collection,
  };
}

export async function addEntryToUserCollections({
  entryId,
  collectionIds,
}: {
  entryId: string;
  collectionIds: string[];
}): Promise<
  | {
      ok: true;
      memberships: EntryCollectionSummary[];
      addedCollectionIds: string[];
      alreadySavedCollectionIds: string[];
    }
  | { ok: false; errorMessage: string }
> {
  const result = await authorizedFetch("/api/collections/items", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ entryId, collectionIds }),
  });

  if (!result.ok) {
    return result;
  }

  const payload = (await result.response.json().catch(() => null)) as
    | AddCollectionItemsResponse
    | null;

  if (!result.response.ok) {
    return {
      ok: false,
      errorMessage: payload?.error ?? "Unable to save to collections.",
    };
  }

  return {
    ok: true,
    memberships: payload?.memberships ?? [],
    addedCollectionIds: payload?.added_collection_ids ?? [],
    alreadySavedCollectionIds: payload?.already_saved_collection_ids ?? [],
  };
}

export async function fetchEntryCollections(
  entryIds: string[]
): Promise<
  | { ok: true; memberships: Record<string, EntryCollectionSummary[]> }
  | { ok: false; errorMessage: string }
> {
  if (entryIds.length === 0) {
    return { ok: true, memberships: {} };
  }

  const result = await authorizedFetch("/api/collections/by-entry", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ entryIds }),
  });

  if (!result.ok) {
    return result;
  }

  const payload = (await result.response.json().catch(() => null)) as
    | EntryCollectionsResponse
    | null;

  if (!result.response.ok) {
    return {
      ok: false,
      errorMessage: payload?.error ?? "Unable to load entry collections.",
    };
  }

  return {
    ok: true,
    memberships: payload?.memberships ?? {},
  };
}

export async function fetchCollectionDetail(
  collectionId: string
): Promise<
  | {
      ok: true;
      collection: UserCollectionSummary;
      items: UserCollectionItemSummary[];
    }
  | { ok: false; errorMessage: string }
> {
  const result = await authorizedFetch(`/api/collections/${collectionId}`);
  if (!result.ok) {
    return result;
  }

  const payload = (await result.response.json().catch(() => null)) as
    | CollectionDetailResponse
    | null;

  if (!result.response.ok || !payload?.collection) {
    return {
      ok: false,
      errorMessage: payload?.error ?? "Unable to load collection.",
    };
  }

  return {
    ok: true,
    collection: payload.collection,
    items: payload.items ?? [],
  };
}

export async function updateUserCollectionDetails({
  collectionId,
  name,
}: {
  collectionId: string;
  name: string;
}): Promise<
  | {
      ok: true;
      collection: UserCollectionSummary;
    }
  | { ok: false; errorMessage: string }
> {
  const result = await authorizedFetch(`/api/collections/${collectionId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });

  if (!result.ok) {
    return result;
  }

  const payload = (await result.response.json().catch(() => null)) as
    | UpdateCollectionResponse
    | null;

  if (!result.response.ok || !payload?.collection) {
    return {
      ok: false,
      errorMessage: payload?.error ?? "Unable to update collection.",
    };
  }

  return {
    ok: true,
    collection: payload.collection,
  };
}

export async function uploadUserCollectionCover({
  collectionId,
  uri,
  fileName,
  mimeType,
}: {
  collectionId: string;
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}): Promise<
  | {
      ok: true;
      collection: UserCollectionSummary;
    }
  | { ok: false; errorMessage: string }
> {
  const normalizedMimeType = mimeType ?? "image/jpeg";
  const normalizedFileName =
    fileName && fileName.trim().length > 0
      ? fileName
      : `collection-cover.${normalizedMimeType === "image/png" ? "png" : normalizedMimeType === "image/webp" ? "webp" : normalizedMimeType === "image/gif" ? "gif" : "jpg"}`;
  const formData = new FormData();
  formData.append("file", {
    uri,
    name: normalizedFileName,
    type: normalizedMimeType,
  } as unknown as Blob);

  const result = await authorizedFetch(`/api/collections/${collectionId}/cover`, {
    method: "POST",
    body: formData,
  });

  if (!result.ok) {
    return result;
  }

  const payload = (await result.response.json().catch(() => null)) as
    | UpdateCollectionResponse
    | null;

  if (!result.response.ok || !payload?.collection) {
    return {
      ok: false,
      errorMessage: payload?.error ?? "Unable to update collection cover.",
    };
  }

  return {
    ok: true,
    collection: payload.collection,
  };
}

export async function deleteUserCollection(
  collectionId: string
): Promise<
  | { ok: true }
  | { ok: false; errorMessage: string }
> {
  const result = await authorizedFetch(`/api/collections/${collectionId}`, {
    method: "DELETE",
  });

  if (!result.ok) {
    return result;
  }

  const payload = (await result.response.json().catch(() => null)) as
    | DeleteCollectionResponse
    | null;

  if (!result.response.ok || payload?.deleted !== true) {
    return {
      ok: false,
      errorMessage: payload?.error ?? "Unable to delete collection.",
    };
  }

  return {
    ok: true,
  };
}
