import type { ListScanResult } from "@cellarsnap/shared";
import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";

export type MobileListScanUpload =
  | {
      kind: "url";
      url: string;
    }
  | {
      kind: "files";
      files: Array<{
        uri: string;
        name: string;
        mimeType: string;
      }>;
    };

export type MobileListScanHistoryItem = {
  scan_id: string;
  source_type: "image" | "pdf" | "url";
  source_label: string | null;
  venue_name: string | null;
  list_title: string | null;
  overall_confidence: number | null;
  scanned_at: string;
  wine_count: number;
};

type ListScanHistoryApiError = {
  error?: string;
};

export async function requestListScan(upload: MobileListScanUpload) {
  const baseUrl = getWebApiBaseUrl();
  if (!baseUrl) {
    return {
      ok: false as const,
      errorMessage: "Set EXPO_PUBLIC_WEB_API_BASE_URL to enable list scanning.",
      payload: null as ListScanResult | null,
    };
  }

  const accessToken = await getAccessTokenForApi();
  if (!accessToken) {
    return {
      ok: false as const,
      errorMessage: "Session expired. Sign in again to scan a list.",
      payload: null as ListScanResult | null,
    };
  }

  const formData = new FormData();
  if (upload.kind === "url") {
    formData.append("url", upload.url);
  } else {
    upload.files.forEach((file) => {
      formData.append(
        "files",
        {
          uri: file.uri,
          name: file.name,
          type: file.mimeType,
        } as unknown as Blob
      );
    });
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/list-scan/parse`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });
  } catch {
    return {
      ok: false as const,
      errorMessage: "Unable to reach the server right now. Try again in a moment.",
      payload: null as ListScanResult | null,
    };
  }

  const payload = (await response.json().catch(() => ({}))) as
    | ListScanResult
    | { error?: string };
  if (!response.ok) {
    return {
      ok: false as const,
      errorMessage:
        typeof payload === "object" && payload && "error" in payload
          ? payload.error || "Unable to scan this wine list."
          : "Unable to scan this wine list.",
      payload: null as ListScanResult | null,
    };
  }

  return {
    ok: true as const,
    errorMessage: null as string | null,
    payload: payload as ListScanResult,
  };
}

export async function fetchListScanHistory() {
  const baseUrl = getWebApiBaseUrl();
  if (!baseUrl) {
    return {
      ok: false as const,
      errorMessage: "Set EXPO_PUBLIC_WEB_API_BASE_URL to view saved scans.",
      status: undefined as number | undefined,
    };
  }

  const accessToken = await getAccessTokenForApi();
  if (!accessToken) {
    return {
      ok: false as const,
      errorMessage: "Session expired. Sign in again to view saved scans.",
      status: 401,
    };
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/list-scan/scans`, {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    return {
      ok: false as const,
      errorMessage: "Unable to reach the server right now. Try again in a moment.",
      status: undefined as number | undefined,
    };
  }

  const payload = (await response.json().catch(() => null)) as
    | { scans?: MobileListScanHistoryItem[] }
    | ListScanHistoryApiError
    | null;

  if (!response.ok) {
    return {
      ok: false as const,
      errorMessage:
        payload && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Unable to load saved scans right now.",
      status: response.status,
    };
  }

  return {
    ok: true as const,
    payload: (payload && "scans" in payload && Array.isArray(payload.scans)
      ? payload.scans
      : []) as MobileListScanHistoryItem[],
  };
}
