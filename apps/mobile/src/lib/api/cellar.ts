import type { CellarEntry } from "@cellarsnap/shared";
import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";

type CellarApiErrorResponse = {
  error?: string;
};

export async function fetchCellarEntries(): Promise<
  | { ok: true; entries: CellarEntry[] }
  | { ok: false; errorMessage: string }
> {
  const baseUrl = getWebApiBaseUrl();
  if (!baseUrl) {
    return { ok: false, errorMessage: "Web API base URL is not configured." };
  }

  const accessToken = await getAccessTokenForApi();
  if (!accessToken) {
    return { ok: false, errorMessage: "Session expired. Sign in again and try." };
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/cellar`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return { ok: false, errorMessage: "Unable to reach the cellar API right now." };
  }

  const payload = (await response.json().catch(() => null)) as
    | CellarEntry[]
    | CellarApiErrorResponse
    | null;

  if (!response.ok) {
    return {
      ok: false,
      errorMessage:
        payload && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Unable to load cellar right now.",
    };
  }

  return { ok: true, entries: ((payload as { entries?: CellarEntry[] })?.entries ?? []) };
}

type DrinkResponse = { consumed_entry_id: string };

export async function drinkFromCellar(
  cellarEntryId: string
): Promise<
  | { ok: true; consumedEntryId: string }
  | { ok: false; errorMessage: string }
> {
  const baseUrl = getWebApiBaseUrl();
  if (!baseUrl) {
    return { ok: false, errorMessage: "Web API base URL is not configured." };
  }

  const accessToken = await getAccessTokenForApi();
  if (!accessToken) {
    return { ok: false, errorMessage: "Session expired. Sign in again and try." };
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/cellar/drink`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cellar_entry_id: cellarEntryId }),
    });
  } catch {
    return { ok: false, errorMessage: "Unable to reach the cellar API right now." };
  }

  const payload = (await response.json().catch(() => null)) as
    | DrinkResponse
    | CellarApiErrorResponse
    | null;

  if (!response.ok) {
    return {
      ok: false,
      errorMessage:
        payload && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Something went wrong. Try again.",
    };
  }

  return {
    ok: true,
    consumedEntryId: (payload as DrinkResponse).consumed_entry_id,
  };
}
