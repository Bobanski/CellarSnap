import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";

type SharePostResponse = {
  url?: string;
  error?: string;
};

export async function createPostShareLink(postId: string) {
  const baseUrl = getWebApiBaseUrl();
  if (!baseUrl) {
    return {
      ok: false as const,
      errorMessage: "Set EXPO_PUBLIC_WEB_API_BASE_URL to enable sharing.",
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
    response = await fetch(`${baseUrl}/api/share`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ postId }),
    });
  } catch {
    return {
      ok: false as const,
      errorMessage: "Unable to reach the server right now. Try again in a moment.",
    };
  }

  const payload = (await response.json().catch(() => null)) as
    | SharePostResponse
    | null;

  if (!response.ok || typeof payload?.url !== "string") {
    return {
      ok: false as const,
      errorMessage: payload?.error ?? "Unable to create share link.",
    };
  }

  return {
    ok: true as const,
    url: payload.url,
  };
}
