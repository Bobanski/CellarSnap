import type { TasteSurveyPayload, TasteSurveyRow } from "@cellarsnap/shared";
import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";

type ApiError = { ok: false; errorMessage: string };

export async function fetchTasteSurvey(): Promise<
  | { ok: true; survey: TasteSurveyRow | null }
  | ApiError
> {
  const baseUrl = getWebApiBaseUrl();
  if (!baseUrl) {
    return { ok: false, errorMessage: "Web API base URL is not configured." };
  }

  const accessToken = await getAccessTokenForApi();
  if (!accessToken) {
    return { ok: false, errorMessage: "Session expired. Sign in again." };
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/taste-survey`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return { ok: false, errorMessage: "Unable to reach the server right now." };
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      errorMessage:
        payload?.error ?? "Unable to load taste survey.",
    };
  }

  return { ok: true, survey: payload?.survey ?? null };
}

export async function submitTasteSurvey(
  body: TasteSurveyPayload
): Promise<
  | { ok: true; survey: TasteSurveyRow }
  | ApiError
> {
  const baseUrl = getWebApiBaseUrl();
  if (!baseUrl) {
    return { ok: false, errorMessage: "Web API base URL is not configured." };
  }

  const accessToken = await getAccessTokenForApi();
  if (!accessToken) {
    return { ok: false, errorMessage: "Session expired. Sign in again." };
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/taste-survey`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, errorMessage: "Unable to reach the server right now." };
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      errorMessage: payload?.error ?? "Unable to save taste survey.",
    };
  }

  return { ok: true, survey: payload?.survey };
}
