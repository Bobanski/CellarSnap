import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";

// ─── Types ──────────────────────────────────────────────────

export type ExploreProfileType = "grape" | "region" | "producer" | "concept";

export type HeroImageAttribution = {
  photographer: string;
  url: string;
};

export type SensoryData = Record<string, number>;

export type ProfileContent = {
  tagline?: string;
  origin?: string;
  characteristics?: string;
  body?: string;
  acidity?: string;
  tannin?: string;
  climate?: string;
  style?: string;
  classification?: string;
  country?: string;
  key_regions?: string[];
  key_grapes?: Array<string | { name: string; context: string }>;
  key_wines?: string[];
  appellations?: Array<string | { name: string; character: string }>;
  food_pairings?: string[];
  fun_fact?: string;
  fun_facts?: string[];
  related_grapes?: string[];
  related_regions?: string[];
  related_producers?: string[];
  founded?: string;
  grapes?: string[];
  aging_potential?: string;
  // Region enriched fields
  story?: string;
  notable_winemakers?: Array<{ name: string; why: string }>;
  flavor_profile?: { Tannin: number; Acidity: number; Body: number; Oak: number; Fruit: number };
};

export type ExploreProfile = {
  type: ExploreProfileType;
  slug: string;
  display_name: string;
  content: ProfileContent;
  hero_image_url?: string;
  hero_image_attribution?: HeroImageAttribution;
  sensory_data?: SensoryData;
};

export type PersonalStats = {
  entry_count: number;
  avg_rating: number;
  label_photos: string[];
};

export type ExploreProfileResponse = {
  profile: ExploreProfile;
  personal_stats: PersonalStats;
};

// ─── API ────────────────────────────────────────────────────

export async function fetchExploreProfile(
  type: string,
  slug: string,
): Promise<
  | { ok: true; data: ExploreProfileResponse }
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
    response = await fetch(
      `${baseUrl}/api/explore/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  } catch {
    return { ok: false, errorMessage: "Unable to reach the server right now." };
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      errorMessage: payload?.error ?? "Unable to load profile.",
    };
  }

  return { ok: true, data: payload as ExploreProfileResponse };
}
