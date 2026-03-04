import {
  hasLineupWineDetails,
  normalizeConfidence,
  normalizeContextPhotoTag,
  normalizeLineupText,
  type ContextPhotoTag,
} from "@cellarsnap/shared";

type UploadPhotoAnalysisTarget = {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
};

export type LabelAutofillResponse = {
  wine_name?: string | null;
  producer?: string | null;
  vintage?: string | null;
  country?: string | null;
  region?: string | null;
  appellation?: string | null;
  classification?: string | null;
  primary_grape_suggestions?: string[] | null;
  primary_grape_confidence?: number | null;
  confidence?: number | null;
  warnings?: string[] | null;
  error?: string;
};

type PhotoContextResponse = {
  tag?: string;
  confidence?: number | null;
};

type LineupApiWine = {
  wine_name?: string | null;
  producer?: string | null;
  vintage?: string | null;
  country?: string | null;
  region?: string | null;
  appellation?: string | null;
  classification?: string | null;
  primary_grape_suggestions?: string[] | null;
  confidence?: number | null;
};

type LineupAutofillResponse = {
  wines?: LineupApiWine[];
  total_bottles_detected?: number;
  error?: string;
};

export type AnalyzedLineupWine = {
  id: string;
  photoIndex: number;
  included: boolean;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  classification: string | null;
  primary_grape_suggestions: string[];
  confidence: number | null;
};

export function normalizeAnalysisErrorMessage(value: string | null | undefined) {
  const message = (value ?? "").trim();
  if (!message) {
    return "Could not analyze one of the selected photos. Please retry.";
  }

  const normalized = message.toLowerCase();
  if (
    normalized.includes("does not represent a valid image") ||
    normalized.includes("supported image formats") ||
    normalized.includes("invalid image")
  ) {
    return "One of the selected photos could not be read for AI scan. Re-add the photo and retry.";
  }

  return message;
}

export async function requestLabelAutofill({
  baseUrl,
  photo,
  accessToken,
}: {
  baseUrl: string | null;
  photo: UploadPhotoAnalysisTarget;
  accessToken: string;
}) {
  if (!baseUrl) {
    return {
      payload: null as LabelAutofillResponse | null,
      errorMessage:
        "Set EXPO_PUBLIC_WEB_API_BASE_URL to enable label autofill and auto-tagging.",
    };
  }

  const formData = new FormData();
  formData.append(
    "label",
    {
      uri: photo.uri,
      name: photo.name,
      type: photo.mimeType,
    } as unknown as Blob
  );

  const response = await fetch(`${baseUrl}/api/label-autofill`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });
  const payload = (await response.json().catch(() => ({}))) as LabelAutofillResponse;

  if (!response.ok) {
    if (response.status === 401) {
      return {
        payload: null as LabelAutofillResponse | null,
        errorMessage: "Session expired. Sign in again to use AI photo analysis.",
      };
    }
    return {
      payload: null as LabelAutofillResponse | null,
      errorMessage:
        normalizeAnalysisErrorMessage(payload.error) ||
        "Could not read this label. Try a clearer photo.",
    };
  }

  return { payload, errorMessage: null as string | null };
}

export async function requestPhotoContext({
  baseUrl,
  photo,
  accessToken,
}: {
  baseUrl: string | null;
  photo: UploadPhotoAnalysisTarget;
  accessToken: string;
}): Promise<{ tag: ContextPhotoTag; confidence: number | null }> {
  if (!baseUrl) {
    return {
      tag: "unknown",
      confidence: null,
    };
  }

  const formData = new FormData();
  formData.append(
    "photo",
    {
      uri: photo.uri,
      name: photo.name,
      type: photo.mimeType,
    } as unknown as Blob
  );

  const response = await fetch(`${baseUrl}/api/photo-context`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Session expired. Sign in again to use AI photo analysis.");
    }
    return {
      tag: "unknown",
      confidence: null,
    };
  }

  const payload = (await response.json().catch(() => ({}))) as PhotoContextResponse;
  return {
    tag: normalizeContextPhotoTag(payload.tag),
    confidence: normalizeConfidence(payload.confidence),
  };
}

export async function requestLineupAutofill({
  baseUrl,
  photo,
  accessToken,
}: {
  baseUrl: string | null;
  photo: UploadPhotoAnalysisTarget;
  accessToken: string;
}) {
  if (!baseUrl) {
    return {
      wines: [] as AnalyzedLineupWine[],
      detectedBottleCount: 0,
      errorMessage: null as string | null,
    };
  }

  const formData = new FormData();
  formData.append(
    "photo",
    {
      uri: photo.uri,
      name: photo.name,
      type: photo.mimeType,
    } as unknown as Blob
  );

  const response = await fetch(`${baseUrl}/api/lineup-autofill`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Session expired. Sign in again to use AI bulk scan.");
    }
    const payload = (await response.json().catch(() => ({}))) as LineupAutofillResponse;
    return {
      wines: [] as AnalyzedLineupWine[],
      detectedBottleCount: 0,
      errorMessage:
        normalizeAnalysisErrorMessage(payload.error) ||
        "Could not analyze one of the lineup photos.",
    };
  }

  const payload = (await response.json().catch(() => ({}))) as LineupAutofillResponse;
  const detectedBottleCount =
    typeof payload.total_bottles_detected === "number" &&
    Number.isFinite(payload.total_bottles_detected)
      ? Math.max(0, Math.round(payload.total_bottles_detected))
      : 0;
  const normalizedWines = (Array.isArray(payload.wines) ? payload.wines : [])
    .map((wine, index) => {
      const normalized = {
        wine_name: normalizeLineupText(wine.wine_name),
        producer: normalizeLineupText(wine.producer),
        vintage: normalizeLineupText(wine.vintage),
        country: normalizeLineupText(wine.country),
        region: normalizeLineupText(wine.region),
        appellation: normalizeLineupText(wine.appellation),
        classification: normalizeLineupText(wine.classification),
        primary_grape_suggestions: Array.isArray(wine.primary_grape_suggestions)
          ? wine.primary_grape_suggestions
              .map((value) => value.trim())
              .filter((value) => value.length > 0)
              .slice(0, 3)
          : [],
        confidence: normalizeConfidence(wine.confidence),
      };
      return {
        ...normalized,
        id: `${photo.id}-lineup-${index}`,
        photoIndex: 0,
        included: true,
      } satisfies AnalyzedLineupWine;
    })
    .filter((wine) => hasLineupWineDetails(wine));

  return {
    wines: normalizedWines,
    detectedBottleCount,
    errorMessage: null as string | null,
  };
}
