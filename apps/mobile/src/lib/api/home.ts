import type { HomeApiResponse } from "@cellarsnap/shared";
import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";

type HomeApiErrorResponse = {
  error?: string;
};

export async function fetchMobileHomeFromApi(): Promise<
  | { ok: true; payload: HomeApiResponse }
  | { ok: false; errorMessage: string; shouldFallback: boolean }
> {
  const baseUrl = getWebApiBaseUrl();
  if (!baseUrl) {
    return {
      ok: false,
      errorMessage: "Web API base URL is not configured.",
      shouldFallback: true,
    };
  }

  const accessToken = await getAccessTokenForApi();
  if (!accessToken) {
    return {
      ok: false,
      errorMessage: "Session expired. Sign in again and try.",
      shouldFallback: true,
    };
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/home`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    return {
      ok: false,
      errorMessage: "Unable to reach the home API right now.",
      shouldFallback: true,
    };
  }

  const payload = (await response.json().catch(() => null)) as
    | HomeApiResponse
    | HomeApiErrorResponse
    | null;

  if (!response.ok) {
    return {
      ok: false,
      errorMessage:
        payload && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Unable to load home right now.",
      shouldFallback: true,
    };
  }

  return {
    ok: true,
    payload: payload as HomeApiResponse,
  };
}
