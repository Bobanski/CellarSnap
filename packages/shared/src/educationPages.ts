// ─── Education Page System ───────────────────────────────────────────────────

// ─── Page Type Accent Colors ─────────────────────────────────────────────────

export const EDUCATION_PAGE_ACCENTS = {
  region: "#7B1D3A", // Grenache
  grape: "#4A3060", // Nebbiolo (varietal pages)
  producer: "#C4607A", // Rose
  concept: "#3D6B4F", // Verdot
} as const;

// ─── Explore Profile Type ────────────────────────────────────────────────────

export type ExploreProfileType = "grape" | "region" | "producer" | "concept";

// ─── Flavor Radar (5-Axis Pentagon) ──────────────────────────────────────────

export const FLAVOR_RADAR_AXES = [
  "Tannin",
  "Acidity",
  "Body",
  "Oak",
  "Fruit",
] as const;

export type FlavorRadarData = Record<
  (typeof FLAVOR_RADAR_AXES)[number],
  number
>; // 0-100 scale

// ─── Section Background Alternation ──────────────────────────────────────────

export const EDUCATION_BG_PRIMARY = "#140A0F";
export const EDUCATION_BG_ALT = "#0F0810";

// ─── Layer Definition ────────────────────────────────────────────────────────

export interface EducationLayer {
  id: string;
  title: string;
  description: string;
  conditional?: boolean;
}

// ─── Region Page Layers ──────────────────────────────────────────────────────

export const REGION_LAYERS: EducationLayer[] = [
  {
    id: "hero",
    title: "Hero",
    description: "Full-bleed region hero with name, country, and accent color",
  },
  {
    id: "personal_has_logs",
    title: "Your History",
    description:
      "Personalized stats and highlights from the user's logs in this region",
    conditional: true,
  },
  {
    id: "personal_no_logs",
    title: "Discover This Region",
    description:
      "Introductory prompt for users who haven't logged wines from this region yet",
    conditional: true,
  },
  {
    id: "flavor_profile",
    title: "Flavor Profile",
    description: "Radar chart showing the region's typical flavor signature",
  },
  {
    id: "story",
    title: "The Story",
    description:
      "History, terroir, and winemaking culture of the region in brief",
  },
  {
    id: "grapes_grown",
    title: "Grapes Grown Here",
    description: "Key varietals cultivated in this region with tasting notes",
  },
  {
    id: "notable_winemakers",
    title: "Notable Winemakers",
    description: "Celebrated producers and estates from the region",
  },
  {
    id: "appellations",
    title: "Appellations",
    description: "Sub-regions and appellations within this region",
  },
  {
    id: "community_pulse",
    title: "Community Pulse",
    description: "Aggregated ratings and trends from the CellarSnap community",
  },
  {
    id: "recommendations",
    title: "Recommendations",
    description: "Personalized bottle picks from this region",
  },
  {
    id: "food_pairings",
    title: "Food Pairings",
    description: "Classic and creative food pairing suggestions",
  },
  {
    id: "fun_facts",
    title: "Fun Facts",
    description: "Surprising trivia and lesser-known details about the region",
  },
];

// ─── Varietal (Grape) Page Layers ────────────────────────────────────────────

export const VARIETAL_LAYERS: EducationLayer[] = [
  {
    id: "hero",
    title: "Hero",
    description: "Full-bleed varietal hero with grape name and accent color",
  },
  {
    id: "personal_has_logs",
    title: "Your History",
    description:
      "Personalized stats and highlights from the user's logs with this grape",
    conditional: true,
  },
  {
    id: "personal_no_logs",
    title: "Discover This Grape",
    description:
      "Introductory prompt for users who haven't logged wines with this grape yet",
    conditional: true,
  },
  {
    id: "flavor_profile",
    title: "Flavor Profile",
    description: "Radar chart showing the grape's typical flavor signature",
  },
  {
    id: "story",
    title: "The Story",
    description: "Origin, history, and character of the grape variety",
  },
  {
    id: "where_it_grows",
    title: "Where It Grows",
    description: "Major growing regions and how terroir shapes the grape",
  },
  {
    id: "styles_expressions",
    title: "Styles & Expressions",
    description:
      "Different winemaking styles and expressions of this varietal",
  },
  {
    id: "notable_producers",
    title: "Notable Producers",
    description: "Top producers known for exceptional work with this grape",
  },
  {
    id: "community_pulse",
    title: "Community Pulse",
    description: "Aggregated ratings and trends from the CellarSnap community",
  },
  {
    id: "recommendations",
    title: "Recommendations",
    description: "Personalized bottle picks featuring this grape",
  },
  {
    id: "food_pairings",
    title: "Food Pairings",
    description: "Classic and creative food pairing suggestions",
  },
  {
    id: "fun_facts",
    title: "Fun Facts",
    description:
      "Surprising trivia and lesser-known details about the varietal",
  },
];

// ─── Producer Page Layers ────────────────────────────────────────────────────

export const PRODUCER_LAYERS: EducationLayer[] = [
  {
    id: "hero",
    title: "Hero",
    description: "Producer hero with name, region, and accent color",
  },
  {
    id: "personal",
    title: "Your History",
    description:
      "Personalized stats from the user's logs with this producer",
  },
  {
    id: "story",
    title: "The Story",
    description: "Origin story, founding, and evolution of the producer",
  },
  {
    id: "philosophy",
    title: "Philosophy",
    description: "Winemaking philosophy, practices, and approach",
  },
  {
    id: "key_wines",
    title: "Key Wines",
    description: "Flagship and notable wines from this producer",
  },
  {
    id: "community_reception",
    title: "Community Reception",
    description:
      "How the CellarSnap community rates and discusses this producer",
  },
  {
    id: "region_grapes",
    title: "Region & Grapes",
    description: "Where they operate and what grapes they work with",
  },
  {
    id: "similar_producers",
    title: "Similar Producers",
    description: "Other producers with a comparable style or profile",
  },
  {
    id: "availability_qpr",
    title: "Availability & QPR",
    description: "Where to find their wines and quality-to-price ratio",
  },
  {
    id: "fun_facts",
    title: "Fun Facts",
    description:
      "Surprising trivia and lesser-known details about the producer",
  },
  {
    id: "recommendations",
    title: "Recommendations",
    description: "Personalized picks from this producer's portfolio",
  },
];

// ─── Concept Page Layers ─────────────────────────────────────────────────────

export const CONCEPT_LAYERS: EducationLayer[] = [
  {
    id: "hero",
    title: "Hero",
    description: "Concept hero with title and accent color",
  },
  {
    id: "personal_has_logs",
    title: "Your Experience",
    description:
      "How this concept appears in the user's own wine history",
    conditional: true,
  },
  {
    id: "personal_no_logs",
    title: "Explore This Concept",
    description:
      "Introductory prompt for users without relevant logs for this concept",
    conditional: true,
  },
  {
    id: "explainer",
    title: "What Is It?",
    description: "Clear, jargon-free explanation of the concept",
  },
  {
    id: "how_to_taste",
    title: "How to Taste It",
    description: "Practical guidance for identifying this concept in a glass",
  },
  {
    id: "where_to_find",
    title: "Where to Find It",
    description: "Regions, styles, and bottles where this concept shines",
  },
  {
    id: "grapes_that_love_this",
    title: "Grapes That Love This",
    description: "Varietals that strongly express or relate to this concept",
  },
  {
    id: "community_pulse",
    title: "Community Pulse",
    description: "How the community engages with and rates this concept",
  },
  {
    id: "related_concepts",
    title: "Related Concepts",
    description: "Other wine concepts connected to this one",
  },
  {
    id: "fun_facts",
    title: "Fun Facts",
    description: "Surprising trivia and lesser-known details about the concept",
  },
  {
    id: "recommendations",
    title: "Recommendations",
    description: "Personalized bottle picks that showcase this concept",
  },
];

// ─── Personalization Tier ────────────────────────────────────────────────────

export type PersonalizationTier =
  | "full"
  | "survey_plus_logs"
  | "survey_only"
  | "community";

export function getPersonalizationTier(
  wineCount: number,
  hasSurvey: boolean
): PersonalizationTier {
  if (wineCount >= 8) return "full";
  if (wineCount >= 4 && hasSurvey) return "survey_plus_logs";
  if (wineCount < 4 && hasSurvey) return "survey_only";
  return "community";
}
