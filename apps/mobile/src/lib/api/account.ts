import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";

type DeleteAccountResponse = {
  deleted?: boolean;
  mediaCleanupPending?: boolean;
  error?: string;
};

export async function deleteCurrentAccount() {
  const baseUrl = getWebApiBaseUrl();
  if (!baseUrl) {
    return {
      ok: false as const,
      errorMessage:
        "Set EXPO_PUBLIC_WEB_API_BASE_URL to enable in-app account deletion.",
    };
  }

  const accessToken = await getAccessTokenForApi();
  if (!accessToken) {
    return {
      ok: false as const,
      errorMessage: "Session expired. Sign in again and try.",
    };
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/account`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    return {
      ok: false as const,
      errorMessage: "Unable to reach the server right now. Try again in a moment.",
    };
  }

  const payload = (await response.json().catch(() => ({}))) as DeleteAccountResponse;
  if (!response.ok || !payload.deleted) {
    return {
      ok: false as const,
      errorMessage: payload.error ?? "Unable to delete your account right now.",
    };
  }

  return {
    ok: true as const,
    mediaCleanupPending: Boolean(payload.mediaCleanupPending),
  };
}
