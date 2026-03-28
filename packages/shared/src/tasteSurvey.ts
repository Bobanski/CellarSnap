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

/** Common grape varietals for offline/fallback search. */
export const COMMON_GRAPES = [
  "Pinot Noir", "Cabernet Sauvignon", "Chardonnay", "Sauvignon Blanc",
  "Syrah / Shiraz", "Nebbiolo", "Riesling", "Grenache", "Merlot",
  "Malbec", "Tempranillo", "Sangiovese", "Barbera", "Mourvèdre",
  "Gamay", "Pinot Grigio", "Viognier", "Chenin Blanc", "Gewürztraminer",
  "Grüner Veltliner", "Albariño", "Vermentino", "Garnacha", "Cabernet Franc",
  "Petit Verdot", "Carménère", "Pinotage", "Touriga Nacional", "Nero d'Avola",
  "Primitivo", "Zinfandel", "Dolcetto", "Aglianico", "Corvina",
  "Trebbiano", "Fiano", "Greco", "Arneis", "Cortese",
  "Muscat", "Sémillon", "Marsanne", "Roussanne", "Petite Sirah",
  "Carignan", "Cinsault", "Tannat", "Blaufränkisch", "Zweigelt",
  "Furmint", "Assyrtiko", "Xinomavro", "Agiorgitiko",
  "Torrontés", "Bonarda", "Melon de Bourgogne", "Pinot Blanc",
  "Pinot Meunier", "Trousseau", "Poulsard", "Savagnin",
] as const;

// ─── Step 3: Starter regions ────────────────────────────────
export const STARTER_REGIONS = [
  "France",
  "Italy",
  "California",
  "Spain",
  "Bordeaux",
  "Napa Valley",
  "Burgundy",
] as const;

/** Comprehensive list of wine countries and sub-regions for local search. */
export const WINE_REGIONS = [
  // Countries
  "France", "Italy", "Spain", "Portugal", "Germany", "Austria",
  "Australia", "New Zealand", "Argentina", "Chile", "South Africa",
  "Greece", "Hungary", "Canada", "Mexico", "England", "Uruguay",
  "Brazil", "Israel", "Lebanon", "Switzerland", "Slovenia", "Croatia",
  "Romania", "Georgia", "USA",
  // France
  "Bordeaux", "Burgundy", "Champagne", "Rhône Valley", "Loire Valley",
  "Alsace", "Languedoc", "Provence", "Beaujolais", "Jura", "Savoie",
  "Southwest France", "Corsica",
  // Italy
  "Tuscany", "Piedmont", "Veneto", "Sicily", "Sardinia", "Lombardy",
  "Trentino-Alto Adige", "Friuli-Venezia Giulia", "Campania", "Puglia",
  "Abruzzo", "Umbria", "Emilia-Romagna", "Marche", "Basilicata", "Calabria",
  // Spain
  "Rioja", "Ribera del Duero", "Priorat", "Rías Baixas", "Rueda",
  "Jerez", "Penedès", "Navarra", "La Mancha", "Toro", "Galicia",
  // Portugal
  "Douro Valley", "Alentejo", "Dão", "Vinho Verde", "Madeira", "Bairrada",
  // Germany
  "Mosel", "Rheingau", "Pfalz", "Rheinhessen", "Baden", "Nahe", "Franken",
  // Austria
  "Wachau", "Kamptal", "Kremstal", "Burgenland", "Styria",
  // USA
  "California", "Oregon", "Washington State", "New York", "Virginia", "Texas",
  "Napa Valley", "Sonoma", "Paso Robles", "Santa Barbara", "Mendocino",
  "Willamette Valley", "Walla Walla", "Columbia Valley",
  "Finger Lakes", "Long Island",
  // Australia
  "Barossa Valley", "McLaren Vale", "Hunter Valley", "Margaret River",
  "Yarra Valley", "Clare Valley", "Eden Valley", "Coonawarra", "Tasmania",
  // New Zealand
  "Marlborough", "Central Otago", "Hawke's Bay", "Martinborough", "Waipara",
  // Argentina
  "Mendoza", "Salta", "Patagonia", "Uco Valley",
  // Chile
  "Maipo Valley", "Colchagua Valley", "Casablanca Valley", "Rapel Valley",
  // South Africa
  "Stellenbosch", "Swartland", "Franschhoek", "Constantia", "Paarl", "Elgin",
  // Other
  "Santorini", "Naoussa", "Tokaj", "Okanagan Valley", "Niagara Peninsula",
  "Bekaa Valley", "Kakheti",
] as const;

// ���── Step 4: Sensory loves ──��───────────────────────────────
export const SENSORY_LOVE_OPTIONS = [
  "Rich and oaky whites",
  "Crisp, high acidity whites",
  "Light and delicate reds",
  "Fruit-forward wines",
  "Complex and layered wines",
  "Aromatic and perfumed wines",
  "Savory, umami wines",
  "Mineral-driven wines",
  "Powerful and fruity reds",
] as const;

export type SensoryLoveOption = (typeof SENSORY_LOVE_OPTIONS)[number];

// ─── Step 5: Sensory avoids ─────────────────────────────────
export const SENSORY_AVOID_OPTIONS = [
  "Overly oaky whites",
  "Too acidic",
  "Very tannic / grippy reds",
  "Jammy / overripe fruit",
  "Too sweet / overripe",
  "High alcohol",
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
  "Under $20",
  "$20 – $40",
  "$40 – $75",
  "$75 – $125",
  "$125+",
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

export function describeAdventurousness(value: number): string {
  if (value <= 3) return "I know what I like";
  if (value <= 6) return "Somewhat adventurous";
  return "Always exploring";
}

export const TASTE_SURVEY_STEP_COUNT = 7;
