import type {
  CollectionOption,
  EntryCollectionSummary,
  UserCollectionItemSummary,
  UserCollectionSummary,
} from "@shared";

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

type EntryCollectionsResponse = {
  memberships?: Record<string, EntryCollectionSummary[]>;
  error?: string;
};

type CollectionDetailResponse = {
  collection?: UserCollectionSummary;
  items?: UserCollectionItemSummary[];
  error?: string;
};

export async function fetchUserCollectionsClient() {
  const response = await fetch("/api/collections", { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as
    | { collections?: UserCollectionSummary[] }
    | ApiErrorResponse
    | null;

  if (!response.ok) {
    return {
      ok: false as const,
      errorMessage:
        payload && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Unable to load collections.",
    };
  }

  return {
    ok: true as const,
    collections: (payload as { collections?: UserCollectionSummary[] })?.collections ?? [],
  };
}

export async function createUserCollectionClient(name: string) {
  const response = await fetch("/api/collections", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });

  const payload = (await response.json().catch(() => null)) as
    | CreateCollectionResponse
    | null;

  if (!response.ok || !payload?.collection) {
    return {
      ok: false as const,
      errorMessage: payload?.error ?? "Unable to create collection.",
    };
  }

  return {
    ok: true as const,
    created: payload.created === true,
    collection: payload.collection,
  };
}

export async function addEntryToCollectionsClient({
  entryId,
  collectionIds,
}: {
  entryId: string;
  collectionIds: string[];
}) {
  const response = await fetch("/api/collections/items", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ entryId, collectionIds }),
  });

  const payload = (await response.json().catch(() => null)) as
    | AddCollectionItemsResponse
    | null;

  if (!response.ok) {
    return {
      ok: false as const,
      errorMessage: payload?.error ?? "Unable to save to collections.",
    };
  }

  return {
    ok: true as const,
    memberships: payload?.memberships ?? [],
    addedCollectionIds: payload?.added_collection_ids ?? [],
    alreadySavedCollectionIds: payload?.already_saved_collection_ids ?? [],
  };
}

export async function fetchEntryCollectionsClient(entryIds: string[]) {
  if (entryIds.length === 0) {
    return {
      ok: true as const,
      memberships: {} as Record<string, EntryCollectionSummary[]>,
    };
  }

  const response = await fetch("/api/collections/by-entry", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ entryIds }),
  });

  const payload = (await response.json().catch(() => null)) as
    | EntryCollectionsResponse
    | null;

  if (!response.ok) {
    return {
      ok: false as const,
      errorMessage: payload?.error ?? "Unable to load entry collections.",
    };
  }

  return {
    ok: true as const,
    memberships: payload?.memberships ?? {},
  };
}

export async function fetchCollectionDetailClient(collectionId: string) {
  const response = await fetch(`/api/collections/${collectionId}`, {
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | CollectionDetailResponse
    | null;

  if (!response.ok || !payload?.collection) {
    return {
      ok: false as const,
      errorMessage: payload?.error ?? "Unable to load collection.",
    };
  }

  return {
    ok: true as const,
    collection: payload.collection,
    items: payload.items ?? [],
  };
}
