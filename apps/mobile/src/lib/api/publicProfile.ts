import { type ProfileFriendStatus } from "@cellarsnap/shared";
import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";

export type MobilePublicProfileProfile = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  friend_status: ProfileFriendStatus;
  incoming_request_id: string | null;
  outgoing_request_id: string | null;
  friend_request_id: string | null;
};

export type MobilePublicProfileEntry = {
  id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  rating: number | null;
  qpr_level: string | null;
  consumed_at: string;
  label_image_url: string | null;
  author_name?: string | null;
};

export type MobilePublicProfilePayload = {
  profile: MobilePublicProfileProfile;
  entries: MobilePublicProfileEntry[];
  taggedEntries: MobilePublicProfileEntry[];
  blocked: boolean;
  blocksUnavailable: boolean;
};

type ApiErrorPayload = {
  error?: string;
  code?: string;
};

type ApiResponse<T> =
  | { ok: true; status: number; payload: T }
  | {
      ok: false;
      status: number;
      errorMessage: string;
      code?: string;
      shouldFallback: boolean;
    };

async function fetchApiJson<T>(
  path: string,
  init?: RequestInit
): Promise<ApiResponse<T>> {
  const baseUrl = getWebApiBaseUrl();
  const token = await getAccessTokenForApi();

  if (!baseUrl || !token) {
    return {
      ok: false,
      status: 0,
      errorMessage: "Web API unavailable.",
      shouldFallback: true,
    };
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    const payload = (await response.json().catch(() => ({}))) as T & ApiErrorPayload;

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        errorMessage:
          (payload as ApiErrorPayload).error ?? "Request could not be completed.",
        code: (payload as ApiErrorPayload).code,
        shouldFallback: response.status >= 500 || response.status === 0,
      };
    }

    return {
      ok: true,
      status: response.status,
      payload: payload as T,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      errorMessage: "Request could not be completed.",
      shouldFallback: true,
    };
  }
}

export async function fetchMobilePublicProfileBundle(
  userId: string
): Promise<
  | { ok: true; payload: MobilePublicProfilePayload }
  | { ok: false; errorMessage: string; shouldFallback: boolean }
> {
  const [profileResult, entriesResult, taggedResult, blockResult] = await Promise.all([
    fetchApiJson<{ profile?: MobilePublicProfileProfile }>(`/api/users/${userId}`),
    fetchApiJson<{ entries?: MobilePublicProfileEntry[] }>(`/api/users/${userId}/entries`),
    fetchApiJson<{ entries?: MobilePublicProfileEntry[] }>(`/api/users/${userId}/tagged`),
    fetchApiJson<{ blocked?: boolean }>(`/api/users/${userId}/block`),
  ]);

  if (!profileResult.ok) {
    return {
      ok: false,
      errorMessage: profileResult.errorMessage,
      shouldFallback: profileResult.shouldFallback,
    };
  }

  if (!entriesResult.ok) {
    return {
      ok: false,
      errorMessage: entriesResult.errorMessage,
      shouldFallback: entriesResult.shouldFallback,
    };
  }

  if (!taggedResult.ok) {
    return {
      ok: false,
      errorMessage: taggedResult.errorMessage,
      shouldFallback: taggedResult.shouldFallback,
    };
  }

  let blocked = false;
  let blocksUnavailable = false;
  if (blockResult.ok) {
    blocked = Boolean(blockResult.payload.blocked);
  } else if (blockResult.code === "BLOCKS_UNAVAILABLE" || blockResult.status === 503) {
    blocksUnavailable = true;
  } else {
    return {
      ok: false,
      errorMessage: blockResult.errorMessage,
      shouldFallback: blockResult.shouldFallback,
    };
  }

  if (!profileResult.payload.profile) {
    return {
      ok: false,
      errorMessage: "Profile not found.",
      shouldFallback: false,
    };
  }

  return {
    ok: true,
    payload: {
      profile: profileResult.payload.profile,
      entries: profileResult.payload.profile.friend_status === "none" && blocked
        ? []
        : profileResult.payload.profile.id
        ? entriesResult.payload.entries ?? []
        : [],
      taggedEntries: taggedResult.payload.entries ?? [],
      blocked,
      blocksUnavailable,
    },
  };
}

export async function sendMobileFriendRequest(userId: string) {
  return fetchApiJson<{
    friend_status?: ProfileFriendStatus;
    incoming_request_id?: string | null;
    outgoing_request_id?: string | null;
    friend_request_id?: string | null;
  }>(`/api/users/${userId}/follow`, {
    method: "POST",
  });
}

export async function removeMobileFriend(userId: string) {
  return fetchApiJson<{
    friend_status?: ProfileFriendStatus;
    incoming_request_id?: string | null;
    outgoing_request_id?: string | null;
    friend_request_id?: string | null;
  }>(`/api/users/${userId}/follow`, {
    method: "DELETE",
  });
}

export async function acceptMobileFriendRequest(requestId: string) {
  return fetchApiJson<{
    success?: boolean;
    status?: string;
    request_id?: string;
  }>(`/api/friends/requests/${requestId}/accept`, {
    method: "POST",
  });
}

export async function deleteMobileFriendRequest(requestId: string) {
  return fetchApiJson<{
    success?: boolean;
    request_id?: string;
    status?: string;
  }>(`/api/friends/requests/${requestId}`, {
    method: "DELETE",
  });
}

export async function updateMobileBlockedState(userId: string, blocked: boolean) {
  return fetchApiJson<{ blocked?: boolean; code?: string }>(`/api/users/${userId}/block`, {
    method: blocked ? "POST" : "DELETE",
  });
}
