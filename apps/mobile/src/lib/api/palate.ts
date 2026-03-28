import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";

export type RadarPoint = {
  key: string;
  label: string;
  neutral: number;
  user: number;
};

export type SensorySignal = {
  axis: string;
  label: string;
  value: number;
};

export type TypeBreakdown = {
  wineType: string;
  eventCount: number;
  topAxes: SensorySignal[];
};

export type PalateData = {
  totalRated: number;
  gated: boolean;
  entriesNeeded: number;
  regionCount: number;
  hasSurvey: boolean;
  topStyle: string | null;
  styleFamilies: string[];
  preferenceStrength: { label: string; detail: string; progress: number };
  topGrapes: { name: string; count: number }[];
  regionStats: { region: string; count: number; avgRating: number; delta: number }[];
  wineTypeStats: { type: string; count: number; pct: number }[];
  radarPoints: RadarPoint[];
  leansInto: SensorySignal[];
  avoids: SensorySignal[];
  typeBreakdown: TypeBreakdown[];
  insights: string[];
  surveyFallback: { varietals: string[]; regions: string[] } | null;
};

export async function fetchPalateData(): Promise<
  | { ok: true; data: PalateData }
  | { ok: false; errorMessage: string }
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
    response = await fetch(`${baseUrl}/api/palate`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return { ok: false, errorMessage: "Unable to reach the server right now." };
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      errorMessage: payload?.error ?? "Unable to load palate data.",
    };
  }

  return { ok: true, data: payload as PalateData };
}
