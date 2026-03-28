import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";

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
    const payload = (await response.json().catch(() => ({}))) as
      T & ApiErrorPayload;

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

export type MobileFriendProfile = {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

export type MobileFriend = MobileFriendProfile & {
  request_id: string | null;
  tasting_count: number;
};

export type MobileIncomingFriendRequest = {
  id: string;
  requester: MobileFriendProfile;
  created_at: string;
  seen_at: string | null;
};

export type MobileOutgoingFriendRequest = {
  id: string;
  recipient: MobileFriendProfile;
  created_at: string;
};

export type MobileFriendSuggestion = MobileFriendProfile & {
  mutual_count: number;
};

export type MobileFriendSearchUser = {
  id: string;
  display_name: string | null;
  username?: string | null;
  friend_status?: "none" | "request_sent" | "request_received" | "friends";
  outgoing_request_id?: string | null;
  incoming_request_id?: string | null;
  friend_request_id?: string | null;
};

export type MobileFriendsBundle = {
  friends: MobileFriend[];
  incoming: MobileIncomingFriendRequest[];
  outgoing: MobileOutgoingFriendRequest[];
  suggestions: MobileFriendSuggestion[];
};

export async function fetchMobileFriendsBundle() {
  const [friendsResult, requestsResult, suggestionsResult] = await Promise.all([
    fetchApiJson<{ friends?: MobileFriend[] }>("/api/friends"),
    fetchApiJson<{
      incoming?: MobileIncomingFriendRequest[];
      outgoing?: MobileOutgoingFriendRequest[];
    }>("/api/friends/requests"),
    fetchApiJson<{ suggestions?: MobileFriendSuggestion[] }>("/api/friends/suggestions"),
  ]);

  if (!friendsResult.ok) {
    return {
      ok: false as const,
      status: friendsResult.status,
      errorMessage: friendsResult.errorMessage,
      shouldFallback: friendsResult.shouldFallback,
    };
  }

  if (!requestsResult.ok) {
    return {
      ok: false as const,
      status: requestsResult.status,
      errorMessage: requestsResult.errorMessage,
      shouldFallback: requestsResult.shouldFallback,
    };
  }

  if (!suggestionsResult.ok) {
    return {
      ok: false as const,
      status: suggestionsResult.status,
      errorMessage: suggestionsResult.errorMessage,
      shouldFallback: suggestionsResult.shouldFallback,
    };
  }

  return {
    ok: true as const,
    payload: {
      friends: friendsResult.payload.friends ?? [],
      incoming: requestsResult.payload.incoming ?? [],
      outgoing: requestsResult.payload.outgoing ?? [],
      suggestions: suggestionsResult.payload.suggestions ?? [],
    },
  };
}

export async function searchMobileFriends(query: string) {
  return fetchApiJson<{ users?: MobileFriendSearchUser[] }>(
    `/api/users?search=${encodeURIComponent(query)}`
  );
}

export async function sendMobileFriendRequest(userId: string) {
  return fetchApiJson<{
    friend_status?: string;
    incoming_request_id?: string | null;
    outgoing_request_id?: string | null;
    friend_request_id?: string | null;
  }>(`/api/friends/requests`, {
    method: "POST",
    body: JSON.stringify({ recipient_id: userId }),
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

export async function declineMobileFriendRequest(requestId: string) {
  return fetchApiJson<{
    success?: boolean;
    status?: string;
    request_id?: string;
  }>(`/api/friends/requests/${requestId}/decline`, {
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
