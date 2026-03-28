/* ─── Onboarding Taste Survey — shared types & constants ─── */

// ─── Step 1: Wine types ─────────────────────────────────────
export const WINE_TYPE_OPTIONS = [
  "Red",
  "White",
  "Sparkling",
  "Rosé",
  "Orange / Skin Contact",
  "Dessert / Fortified",
] as const;

export type WineTypeOption = (typeof WINE_TYPE_OPTIONS)[number];

// ─── Step 2: Starter grapes ���────────────────────────────────
export const STARTER_GRAPES = [
  "Pinot Noir",
  "Cabernet Sauvignon",
  "Chardonnay",
  "Sauvignon Blanc",
  "Syrah / Shiraz",
  "Nebbiolo",
  "Riesling",
  "Grenache",
] as const;

// ─── Step 3: Starter regions ────────────────────────────────
export const STARTER_REGIONS = [
  "France",
  "Italy",
  "California",
  "Spain",
  "Oregon",
  "Australia",
  "Argentina",
  "Germany",
] as const;

// ���── Step 4: Sensory loves ──��───────────────────────────────
export const SENSORY_LOVE_OPTIONS = [
  "Big and full-bodied",
  "Light and delicate",
  "High acidity, crisp",
  "Smooth and round",
  "Rich and oaky",
  "Fruit-forward",
  "Earthy and funky",
  "Mineral-driven",
  "Complex and layered",
  "Long, lingering finish",
  "Aromatic and perfumed",
  "Savory, umami notes",
] as const;

export type SensoryLoveOption = (typeof SENSORY_LOVE_OPTIONS)[number];

// ─── Step 5: Sensory avoids ─────────────────────────────────
export const SENSORY_AVOID_OPTIONS = [
  "Overly oaky",
  "Very tannic / grippy",
  "Too acidic / sour",
  "Jammy / overripe fruit",
  "Hot / high alcohol",
  "Very sweet",
  "Too bitter / astringent",
  "Thin and watery",
] as const;

export type SensoryAvoidOption = (typeof SENSORY_AVOID_OPTIONS)[number];

// ─── Step 6: Budget tiers ────────���──────────────────────────
export const BUDGET_RESTAURANT_OPTIONS = [
  "Under $50",
  "$50 – $80",
  "$80 – $120",
  "$120 – $200",
  "$200+",
] as const;

export const BUDGET_RETAIL_OPTIONS = [
  "Under $15",
  "$15 – $25",
  "$25 – $40",
  "$40 – $75",
  "$75+",
] as const;

export type BudgetRestaurantOption = (typeof BUDGET_RESTAURANT_OPTIONS)[number];
export type BudgetRetailOption = (typeof BUDGET_RETAIL_OPTIONS)[number];

// ─── Adventurousness ─────────��──────────────────────────────
export const ADVENTUROUSNESS_MIN = 1;
export const ADVENTUROUSNESS_MAX = 10;
export const ADVENTUROUSNESS_DEFAULT = 5;

// ─── Payload sent to / received from the API ────────────────
export type TasteSurveyPayload = {
  wine_types: string[];
  varietals: string[];
  regions: string[];
  countries: string[];
  sensory_loves: string[];
  sensory_avoids: string[];
  budget_restaurant: string | null;
  budget_retail: string | null;
  adventurousness: number;
  free_text: string | null;
};

export type TasteSurveyRow = TasteSurveyPayload & {
  id: string;
  user_id: string;
  completed_at: string | null;
  updated_at: string;
  created_at: string;
};

// ─── Draft state used in the UI across all 7 steps ─────────
export type TasteSurveyDraft = {
  wineTypes: string[];
  varietals: string[];
  regions: string[];
  sensoryLoves: string[];
  sensoryAvoids: string[];
  budgetRestaurant: string | null;
  budgetRetail: string | null;
  adventurousness: number;
  freeText: string;
};

export function emptyTasteSurveyDraft(): TasteSurveyDraft {
  return {
    wineTypes: [],
    varietals: [],
    regions: [],
    sensoryLoves: [],
    sensoryAvoids: [],
    budgetRestaurant: null,
    budgetRetail: null,
    adventurousness: ADVENTUROUSNESS_DEFAULT,
    freeText: "",
  };
}

/** Convert UI draft → API payload. Regions/countries split is left to the server. */
export function draftToPayload(draft: TasteSurveyDraft): TasteSurveyPayload {
  return {
    wine_types: draft.wineTypes,
    varietals: draft.varietals,
    regions: draft.regions,
    countries: [],
    sensory_loves: draft.sensoryLoves,
    sensory_avoids: draft.sensoryAvoids,
    budget_restaurant: draft.budgetRestaurant,
    budget_retail: draft.budgetRetail,
    adventurousness: draft.adventurousness,
    free_text: draft.freeText.trim() || null,
  };
}

/** Convert API row → UI draft (for editing). */
export function rowToDraft(row: TasteSurveyPayload): TasteSurveyDraft {
  return {
    wineTypes: row.wine_types,
    varietals: row.varietals,
    regions: [...row.regions, ...row.countries],
    sensoryLoves: row.sensory_loves,
    sensoryAvoids: row.sensory_avoids,
    budgetRestaurant: row.budget_restaurant,
    budgetRetail: row.budget_retail,
    adventurousness: row.adventurousness,
    freeText: row.free_text ?? "",
  };
}

export const TASTE_SURVEY_STEP_COUNT = 7;
