import { z } from "zod";

export const LIST_SCAN_SOURCE_TYPES = ["image", "pdf", "url"] as const;
export const LIST_SCAN_FILTERABLE_WINE_TYPES = [
  "sparkling",
  "white",
  "rose",
  "orange",
  "red",
  "dessert_fortified",
] as const;
export const LIST_SCAN_ALL_WINE_TYPES = [
  ...LIST_SCAN_FILTERABLE_WINE_TYPES,
  "unknown",
] as const;
export const LIST_SCAN_PRICE_MODES = ["any", "under", "between", "over"] as const;
export const LIST_SCAN_FILTER_ACCENT_TONES = [
  "neutral",
  "white",
  "rose",
  "orange",
  "red",
] as const;
export const LIST_SCAN_MAX_IMAGE_COUNT = 6;
export const LIST_SCAN_WHITE_ACCENT_HEX = "#7B1D3A";
export const LIST_SCAN_ROSE_ACCENT_HEX = "#C76886";
export const LIST_SCAN_ORANGE_ACCENT_HEX = "#D17A2A";
export const LIST_SCAN_RED_ACCENT_HEX = "#4A3060";
export const LIST_SCAN_SCORE_MODES = ["personalized", "stub"] as const;
export const LIST_SCAN_SORT_MODES = ["list_order", "match"] as const;

export type ListScanSourceType = (typeof LIST_SCAN_SOURCE_TYPES)[number];
export type ListScanWineType = (typeof LIST_SCAN_ALL_WINE_TYPES)[number];
export type ListScanFilterableWineType =
  (typeof LIST_SCAN_FILTERABLE_WINE_TYPES)[number];
export type ListScanPriceMode = (typeof LIST_SCAN_PRICE_MODES)[number];
export type ListScanFilterAccentTone =
  (typeof LIST_SCAN_FILTER_ACCENT_TONES)[number];
export type ListScanScoreMode = (typeof LIST_SCAN_SCORE_MODES)[number];
export type ListScanSortMode = (typeof LIST_SCAN_SORT_MODES)[number];

export const listScanWineTypeLabels: Record<ListScanWineType, string> = {
  sparkling: "Sparkling",
  white: "White",
  rose: "Rose",
  orange: "Skin Contact",
  red: "Red",
  dessert_fortified: "Dessert/Fortified",
  unknown: "Unknown",
};

const LIST_SCAN_COUNTRY_LABELS = new Map<string, string>([
  // Full names
  ["usa", "USA"],
  ["u s", "USA"],
  ["u s a", "USA"],
  ["us", "USA"],
  ["united states", "USA"],
  ["united states of america", "USA"],
  ["france", "France"],
  ["italy", "Italy"],
  ["spain", "Spain"],
  ["portugal", "Portugal"],
  ["germany", "Germany"],
  ["austria", "Austria"],
  ["australia", "Australia"],
  ["new zealand", "New Zealand"],
  ["argentina", "Argentina"],
  ["chile", "Chile"],
  ["south africa", "South Africa"],
  ["greece", "Greece"],
  ["hungary", "Hungary"],
  ["canada", "Canada"],
  ["mexico", "Mexico"],
  ["england", "England"],
  ["united kingdom", "United Kingdom"],
  ["uruguay", "Uruguay"],
  ["brazil", "Brazil"],
  ["israel", "Israel"],
  ["lebanon", "Lebanon"],
  ["switzerland", "Switzerland"],
  ["slovenia", "Slovenia"],
  ["croatia", "Croatia"],
  ["romania", "Romania"],
  ["georgia", "Georgia"],
  // Common wine-list abbreviations
  ["fr", "France"],
  ["it", "Italy"],
  ["sp", "Spain"],
  ["pt", "Portugal"],
  ["de", "Germany"],
  ["ger", "Germany"],
  ["at", "Austria"],
  ["aus", "Australia"],
  ["au", "Australia"],
  ["nz", "New Zealand"],
  ["ar", "Argentina"],
  ["cl", "Chile"],
  ["za", "South Africa"],
  ["sa", "South Africa"],
  ["gr", "Greece"],
  ["hu", "Hungary"],
  ["ca", "USA"],
  ["or", "USA"],
  ["wa", "USA"],
  ["ny", "USA"],
  // US state abbreviations commonly seen on wine lists
  ["california", "USA"],
  ["oregon", "USA"],
  ["washington", "USA"],
]);

function normalizeCountryLookupValue(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeListScanCountryLabel(value: string | null | undefined) {
  const key = normalizeCountryLookupValue(value);
  if (!key) {
    return null;
  }
  return LIST_SCAN_COUNTRY_LABELS.get(key) ?? null;
}

function normalizeListScanRegionValue(value: string) {
  return normalizeListScanCountryLabel(value) ?? normalizeFacetValue(value);
}

const LIST_SCAN_WINE_TYPE_BY_VARIETAL: Partial<Record<string, ListScanWineType>> = {
  "Albarino": "white",
  "Arneis": "white",
  "Cabernet Franc": "red",
  "Cabernet Sauvignon": "red",
  "Carricante": "white",
  "Carignan": "red",
  "Chardonnay": "white",
  "Chenin Blanc": "white",
  "Fiano": "white",
  "Furmint": "white",
  "Gamay": "red",
  "Garganega": "white",
  "Gewurztraminer": "white",
  "Glera": "sparkling",
  "Greco": "white",
  "Grenache": "red",
  "Gruner Veltliner": "white",
  "Malbec": "red",
  "Melon De Bourgogne": "white",
  "Merlot": "red",
  "Monastrell": "red",
  "Mourvedre": "red",
  "Moscato": "white",
  "Nebbiolo": "red",
  "Nerello Mascalese": "red",
  "Picpoul": "white",
  "Pinot Blanc": "white",
  "Pinot Grigio": "white",
  "Pinot Gris": "white",
  "Pinot Meunier": "red",
  "Pinot Noir": "red",
  "Red Blend": "red",
  "Riesling": "white",
  "Sangiovese": "red",
  "Sauvignon Blanc": "white",
  "Semillon": "white",
  "Shiraz": "red",
  "Syrah": "red",
  "Tempranillo": "red",
  "Verdejo": "white",
  "Verdicchio": "white",
  "Vermentino": "white",
  "Vernaccia": "white",
  "Viognier": "white",
  "White Blend": "white",
  "Zinfandel": "red",
};
const LIST_SCAN_SPARKLING_CONTEXT_PATTERN =
  /\b(?:sparkling|champagne|prosecco|cava|cr(?:e|é)mant|pet[\s-]?nat|franciacorta|corpinnat|sekt|m(?:e|é)thode champenoise|metodo classico|blanc de blancs|blanc de noirs|moscato d[' ]asti|lambrusco)\b/i;
const LIST_SCAN_DESSERT_CONTEXT_PATTERN =
  /\b(?:dessert|fortified|port|sherry|madeira|marsala|vin santo|sauternes|tokaji|ice wine|eiswein|banyuls|rutherglen)\b/i;
const LIST_SCAN_ROSE_CONTEXT_PATTERN =
  /\b(?:rose|rosé|rosado|rosato|vin gris|provence rose|provence rosé|tavel|bandol rose|bandol rosé|cerasuolo)\b/i;
const LIST_SCAN_ORANGE_CONTEXT_PATTERN =
  /\b(?:orange|skin contact|amber wine|ramato|vino bianco macerato)\b/i;
const LIST_SCAN_RED_CONTEXT_PATTERN =
  /\b(?:red|rosso|rouge|tinto|bordeaux(?: style)? blend|left bank|right bank|claret|rhone(?: style)? blend|c(?:ô|o)?tes? du rh(?:ô|o)ne|ch(?:â|a)teauneuf[- ]du[- ]pape|gigondas|vacqueyras|c(?:ô|o)te r(?:ô|o)tie|cornas|crozes[- ]hermitage|hermitage|saint[- ]joseph|rioja|barolo|barbaresco|chianti(?: classico)?|brunello|rosso di montalcino|vino nobile di montepulciano|morellino di scansano|etna rosso|priorat|bandol|m(?:é|e)doc|pauillac|margaux|saint[- ]julien|saint[- ]est(?:è|e)phe|saint[- ](?:é|e)milion|pomerol|fronsac|super tuscan)\b/i;
const LIST_SCAN_WHITE_CONTEXT_PATTERN =
  /\b(?:white|bianco|blanc|blanco|bordeaux blanc|white bordeaux|white rhone|rhone blanc|sancerre|pouilly[\s-]?fum(?:é|e)|chablis|meursault|puligny[\s-]montrachet|chassagne[\s-]montrachet|pouilly[\s-]fuiss(?:é|e)|saint[\s-]v(?:é|e)ran|m[aâ]con|savenni(?:è|e)res|vouvray|montlouis|muscadet|greco di tufo|etna bianco|roero arneis|soave|verdicchio|vermentino|vernaccia)\b/i;
const LIST_SCAN_BLEND_CONTEXT_PATTERN =
  /\b(?:blend|assemblage|field blend|cuv(?:e|é)e)\b/i;

export const listScanParsedWineSchema = z.object({
  id: z.string(),
  source_order: z.number().int().min(0),
  menu_label: z.string().min(1),
  producer: z.string().nullable(),
  wine_name: z.string().nullable(),
  vintage: z.string().nullable(),
  wine_type: z.enum(LIST_SCAN_ALL_WINE_TYPES),
  section_type: z.enum(LIST_SCAN_ALL_WINE_TYPES).nullable().optional(),
  price_display: z.string().nullable(),
  price_value: z.number().nullable(),
  varietals: z.array(z.string()),
  regions: z.array(z.string()),
  canonical_country: z.string().nullable().optional(),
  match_percent: z.number().int().min(0).max(100),
  parse_confidence: z.number().int().min(0).max(100),
  rationale: z.string(),
});

export const listScanFacetsSchema = z.object({
  wine_types: z.array(z.enum(LIST_SCAN_FILTERABLE_WINE_TYPES)),
  varietals: z.array(z.string()),
  regions: z.array(z.string()),
  min_price: z.number().nullable(),
  max_price: z.number().nullable(),
});

export const listScanResultSchema = z.object({
  scan_id: z.string(),
  source_type: z.enum(LIST_SCAN_SOURCE_TYPES),
  source_label: z.string().nullable(),
  venue_name: z.string().nullable(),
  list_title: z.string().nullable(),
  overall_confidence: z.number().int().min(0).max(100).nullable(),
  warnings: z.array(z.string()),
  score_summary: z.object({
    mode: z.enum(LIST_SCAN_SCORE_MODES),
    based_on_entry_count: z.number().int().min(0),
    warning: z.string().nullable(),
  }),
  facets: listScanFacetsSchema,
  wines: z.array(listScanParsedWineSchema),
  scanned_at: z.string(),
});

export const listScanFiltersSchema = z.object({
  price_mode: z.enum(LIST_SCAN_PRICE_MODES),
  price_min: z.number().nullable(),
  price_max: z.number().nullable(),
  included_wine_types: z.array(z.enum(LIST_SCAN_FILTERABLE_WINE_TYPES)),
  selected_varietals: z.array(z.string()),
  selected_regions: z.array(z.string()),
  min_match_percent: z.number().int().min(0).max(100),
  show_match_column: z.boolean(),
});

export type ListScanParsedWine = z.infer<typeof listScanParsedWineSchema>;
export type ListScanFacets = z.infer<typeof listScanFacetsSchema>;
export type ListScanResult = z.infer<typeof listScanResultSchema>;
export type ListScanFilters = z.infer<typeof listScanFiltersSchema>;

export function normalizeFacetValue(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeListScanDisplayRegionValue(value: string) {
  return normalizeFacetValue(value)
    .replace(/^[\s'’"({[\-–—]+/, "")
    .replace(/[\s'’"()}\],;:.-]+$/, "")
    .trim();
}

function isLikelyListScanDisplayRegionNoise(value: string) {
  return (
    /[\d$]/.test(value) ||
    /[()]/.test(value) ||
    /\b(?:selection|selections?|sommelier|coravin|corkage)\b/i.test(value)
  );
}

function scoreListScanDisplayRegionCandidate(value: string) {
  const wordCount = value.split(/\s+/).length;
  const hyphenCount = (value.match(/-/g) ?? []).length;
  let score = 0;

  score += 4;
  if (!/[(),]/.test(value)) {
    score += 2;
  }
  if (!/\d/.test(value)) {
    score += 1;
  }
  if (hyphenCount === 0) {
    score += 1;
  }
  if (wordCount <= 2) {
    score += 1;
  }
  if (value.length <= 24) {
    score += 1;
  }
  score -= hyphenCount * 0.75;
  score -= Math.max(0, wordCount - 2) * 0.25;

  return score;
}

export function getListScanDisplayRegion(regions: string[]) {
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const region of regions) {
    const normalized = normalizeListScanDisplayRegionValue(region);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    if (normalizeListScanCountryLabel(normalized)) {
      continue;
    }
    candidates.push(normalized);
  }

  if (candidates.length === 0) {
    return null;
  }

  const friuli = candidates.find((region) => /^friuli$/i.test(region));
  const veneziaGiulia = candidates.find(
    (region) => /^venezia giulia$/i.test(region)
  );
  if (friuli && veneziaGiulia) {
    return "Friuli-Venezia Giulia";
  }

  const scoredCandidates = candidates
    .filter((region) => !isLikelyListScanDisplayRegionNoise(region))
    .map((region, index) => ({
      region,
      score: scoreListScanDisplayRegionCandidate(region) - index * 0.01,
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.region.localeCompare(right.region, undefined, {
        sensitivity: "base",
      });
    });

  return scoredCandidates[0]?.region ?? null;
}

export function createListScanId(prefix = "scan") {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function getListScanFilterAccentTone(
  wineType: ListScanWineType
): ListScanFilterAccentTone {
  if (wineType === "red") {
    return "red";
  }
  if (wineType === "rose") {
    return "rose";
  }
  if (wineType === "orange") {
    return "orange";
  }
  if (wineType === "white" || wineType === "sparkling") {
    return "white";
  }
  return "neutral";
}

function inferListScanWineTypeFromVarietals(varietals: string[]) {
  const inferredTypes = Array.from(
    new Set(
      varietals
        .map((varietal) => LIST_SCAN_WINE_TYPE_BY_VARIETAL[normalizeFacetValue(varietal)])
        .filter((value): value is ListScanWineType => Boolean(value))
    )
  );

  return inferredTypes.length === 1 ? inferredTypes[0] : "unknown";
}

function buildListScanWineTypeContext(wine: Pick<
  ListScanParsedWine,
  "menu_label" | "wine_name" | "producer" | "regions" | "varietals"
>) {
  return [
    wine.menu_label,
    wine.wine_name,
    wine.producer,
    ...wine.regions,
    ...wine.varietals,
  ]
    .filter(Boolean)
    .join(" | ");
}

export function resolveListScanWineType(
  wine: Pick<
    ListScanParsedWine,
    "wine_type" | "menu_label" | "wine_name" | "producer" | "regions" | "varietals"
  >
): ListScanWineType {
  if (wine.wine_type !== "unknown") {
    return wine.wine_type;
  }

  const varietalType = inferListScanWineTypeFromVarietals(wine.varietals);
  if (varietalType !== "unknown") {
    return varietalType;
  }

  const context = buildListScanWineTypeContext(wine);
  if (LIST_SCAN_SPARKLING_CONTEXT_PATTERN.test(context)) {
    return "sparkling";
  }
  if (LIST_SCAN_DESSERT_CONTEXT_PATTERN.test(context)) {
    return "dessert_fortified";
  }
  if (LIST_SCAN_ROSE_CONTEXT_PATTERN.test(context)) {
    return "rose";
  }
  if (LIST_SCAN_ORANGE_CONTEXT_PATTERN.test(context)) {
    return "orange";
  }

  const hasRedSignal = LIST_SCAN_RED_CONTEXT_PATTERN.test(context);
  const hasWhiteSignal = LIST_SCAN_WHITE_CONTEXT_PATTERN.test(context);

  if (hasRedSignal && !hasWhiteSignal) {
    return "red";
  }
  if (hasWhiteSignal && !hasRedSignal) {
    return "white";
  }

  if (LIST_SCAN_BLEND_CONTEXT_PATTERN.test(context)) {
    if (/\b(?:bordeaux|left bank|right bank|claret|rhone|super tuscan|rioja)\b/i.test(context)) {
      return "red";
    }
    if (/\b(?:bordeaux blanc|white bordeaux|white rhone|rhone blanc)\b/i.test(context)) {
      return "white";
    }
  }

  return wine.wine_type;
}

function facetSort(left: string, right: string) {
  return left.localeCompare(right, undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

function uniqueFacetValues(values: string[]) {
  const map = new Map<string, string>();
  values.forEach((value) => {
    const normalized = normalizeFacetValue(value);
    if (!normalized) {
      return;
    }
    const dedupeKey = normalized.toLowerCase();
    if (!map.has(dedupeKey)) {
      map.set(dedupeKey, normalized);
    }
  });
  return Array.from(map.values()).sort(facetSort);
}

function createNormalizedFacetKey(value?: string | null) {
  if (!value) {
    return "";
  }
  return normalizeFacetValue(value).toLowerCase();
}

const LIST_SCAN_REGION_REJECT_PATTERN =
  /\b(?:albarino|arneis|blanc de blancs|blanc de noirs|blend|brut|cab(?:ernet)?|cellars?|chardonnay|chenin|clos|cuv(?:e|é)e|domaine|estate|fiano|furmint|gamay|glera|grenache|malbec|merlot|method(?:e)?|metodo|monastrell|mourv(?:e|è)dre|nebbiolo|nerello|old vine|orange|pet[\s-]?nat|picpoul|pinot|podere|producer|reserva|reserve|riesling|ros(?:e|é)|sangiovese|sauvignon|selection|semillon|shiraz|skin contact|sur lie|syrah|tempranillo|tenuta|verdejo|verdicchio|vermentino|vernaccia|viognier|vieilles vignes|vineyards?|weingut|winery|zinfandel)\b/i;
const LIST_SCAN_REGION_GEOGRAPHIC_HINT_PATTERN =
  /\b(?:appellation|ava|basin|bay|bench|burgundy|coast|county|delta|district|gorge|hills?|islands?|lake|mesa|mountains?|plateau|ridge|river|shore|slope|slopes|sound|terraces?|valley)\b/i;
const LIST_SCAN_REGION_CONNECTOR_PATTERN =
  /\b(?:d['’]|da|de|dei|del|della|di|du|des|do|la|le|los|las|von|van)\b/i;

function deriveListScanRegionFacets(wines: ListScanParsedWine[]) {
  const varietalKeys = new Set(
    wines.flatMap((wine) => wine.varietals.map((varietal) => createNormalizedFacetKey(varietal)))
  );
  const producerKeys = new Set(
    wines
      .map((wine) => createNormalizedFacetKey(wine.producer))
      .filter(Boolean)
  );

  const regionCandidates = wines.flatMap((wine) =>
    wine.regions.filter((region) => {
      const normalized = normalizeFacetValue(region);
      const key = normalized.toLowerCase();
      if (!key) {
        return false;
      }
      if (varietalKeys.has(key) || producerKeys.has(key)) {
        return false;
      }
      if (normalized.length > 52 || /[$\d]/.test(normalized)) {
        return false;
      }
      if (LIST_SCAN_REGION_REJECT_PATTERN.test(normalized)) {
        return false;
      }

      const wordCount = normalized.split(/\s+/).length;
      if (wordCount > 5) {
        return false;
      }
      if (
        wordCount >= 4 &&
        !LIST_SCAN_REGION_GEOGRAPHIC_HINT_PATTERN.test(normalized) &&
        !LIST_SCAN_REGION_CONNECTOR_PATTERN.test(normalized)
      ) {
        return false;
      }

      return true;
    })
  );

  return uniqueFacetValues(regionCandidates);
}

export function createDefaultListScanFilters(
  facets?: Partial<ListScanFacets>
): ListScanFilters {
  const availableTypes =
    facets?.wine_types?.filter((type) =>
      LIST_SCAN_FILTERABLE_WINE_TYPES.includes(type)
    ) ?? [];

  return {
    price_mode: "any",
    price_min: null,
    price_max: null,
    included_wine_types:
      availableTypes.length > 0
        ? availableTypes
        : [...LIST_SCAN_FILTERABLE_WINE_TYPES],
    selected_varietals: [],
    selected_regions: [],
    min_match_percent: 0,
    show_match_column: true,
  };
}

export function deriveListScanFacets(wines: ListScanParsedWine[]): ListScanFacets {
  const visibleTypes = new Set<ListScanFilterableWineType>();
  const varietals: string[] = [];
  const regions: string[] = [];
  const priceValues: number[] = [];

  wines.forEach((wine) => {
    const effectiveWineType = resolveListScanWineType(wine);
    if (
      LIST_SCAN_FILTERABLE_WINE_TYPES.includes(
        effectiveWineType as ListScanFilterableWineType
      )
    ) {
      visibleTypes.add(effectiveWineType as ListScanFilterableWineType);
    }

    varietals.push(...wine.varietals);
    regions.push(...wine.regions);

    if (typeof wine.price_value === "number" && Number.isFinite(wine.price_value)) {
      priceValues.push(wine.price_value);
    }
  });

  const minPrice =
    priceValues.length > 0 ? Math.min(...priceValues) : null;
  const maxPrice =
    priceValues.length > 0 ? Math.max(...priceValues) : null;

  return {
    wine_types: [...visibleTypes].sort((left, right) =>
      LIST_SCAN_FILTERABLE_WINE_TYPES.indexOf(left) -
      LIST_SCAN_FILTERABLE_WINE_TYPES.indexOf(right)
    ),
    varietals: uniqueFacetValues(varietals),
    regions: deriveListScanRegionFacets(wines),
    min_price: minPrice,
    max_price: maxPrice,
  };
}

export function buildListScanVarietalAccentMap(
  wines: Pick<ListScanParsedWine, "varietals" | "wine_type">[]
) {
  const accentMap: Record<string, ListScanFilterAccentTone> = {};

  wines.forEach((wine) => {
    const tone = getListScanFilterAccentTone(
      resolveListScanWineType({
        wine_type: wine.wine_type,
        menu_label: "",
        wine_name: null,
        producer: null,
        regions: [],
        varietals: wine.varietals,
      })
    );
    if (tone === "neutral") {
      return;
    }

    wine.varietals.forEach((varietal) => {
      const key = normalizeFacetValue(varietal).toLowerCase();
      if (!key) {
        return;
      }

      const currentTone = accentMap[key];
      if (!currentTone) {
        accentMap[key] = tone;
        return;
      }

      if (currentTone !== tone) {
        accentMap[key] = "neutral";
      }
    });
  });

  return accentMap;
}

export function getListScanVarietalAccentTone(
  varietal: string,
  accentMap: Record<string, ListScanFilterAccentTone>
) {
  const key = normalizeFacetValue(varietal).toLowerCase();
  return accentMap[key] ?? "neutral";
}

function matchesSelectedOptions(
  values: string[],
  selected: string[],
  normalizeValue: (value: string) => string = normalizeFacetValue
) {
  if (selected.length === 0) {
    return true;
  }

  const normalizedRowValues = new Set(
    values.map((value) => normalizeValue(value).toLowerCase()).filter(Boolean)
  );

  return selected.some((value) =>
    normalizedRowValues.has(normalizeValue(value).toLowerCase())
  );
}

function matchesSelectedRegions(values: string[], selected: string[]) {
  if (selected.length === 0) {
    return true;
  }

  const effectiveSelection = selected.length > 1 ? selected.slice(1) : selected;
  if (effectiveSelection.length === 0) {
    return true;
  }

  const normalizedRowValues = new Set(
    values.map((value) => normalizeListScanRegionValue(value).toLowerCase()).filter(Boolean)
  );

  return effectiveSelection.some((value) =>
    normalizedRowValues.has(normalizeListScanRegionValue(value).toLowerCase())
  );
}

function matchesPriceFilter(wine: ListScanParsedWine, filters: ListScanFilters) {
  const price = wine.price_value;
  if (filters.price_mode === "any") {
    return true;
  }
  if (typeof price !== "number" || !Number.isFinite(price)) {
    return false;
  }

  if (filters.price_mode === "under") {
    return typeof filters.price_max === "number" && price <= filters.price_max;
  }
  if (filters.price_mode === "over") {
    return typeof filters.price_min === "number" && price >= filters.price_min;
  }

  const min = typeof filters.price_min === "number" ? filters.price_min : -Infinity;
  const max = typeof filters.price_max === "number" ? filters.price_max : Infinity;
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  return price >= lower && price <= upper;
}

function matchesWineTypeFilter(wine: ListScanParsedWine, filters: ListScanFilters) {
  const filterIsDefault =
    filters.included_wine_types.length === LIST_SCAN_FILTERABLE_WINE_TYPES.length &&
    LIST_SCAN_FILTERABLE_WINE_TYPES.every((type) =>
      filters.included_wine_types.includes(type)
    );

  if (filterIsDefault) {
    return true;
  }

  return filters.included_wine_types.includes(
    resolveListScanWineType(wine) as ListScanFilterableWineType
  );
}

export function filterListScanWines(
  wines: ListScanParsedWine[],
  filters: ListScanFilters
) {
  return wines.filter((wine) => {
    if (!matchesWineTypeFilter(wine, filters)) {
      return false;
    }
    if (!matchesPriceFilter(wine, filters)) {
      return false;
    }
    if (!matchesSelectedOptions(wine.varietals, filters.selected_varietals)) {
      return false;
    }
    if (!matchesSelectedRegions(wine.regions, filters.selected_regions)) {
      return false;
    }
    return wine.match_percent >= filters.min_match_percent;
  });
}

export function rankListScanWines(wines: ListScanParsedWine[]) {
  return [...wines].sort((left, right) => {
    if (right.match_percent !== left.match_percent) {
      return right.match_percent - left.match_percent;
    }
    if (right.parse_confidence !== left.parse_confidence) {
      return right.parse_confidence - left.parse_confidence;
    }
    return left.source_order - right.source_order;
  });
}

export function sortListScanWines(
  wines: ListScanParsedWine[],
  mode: ListScanSortMode
) {
  if (mode === "match") {
    return rankListScanWines(wines);
  }
  return [...wines].sort((left, right) => left.source_order - right.source_order);
}

export function getTopListScanRecommendations(
  wines: ListScanParsedWine[],
  count = 3
) {
  return rankListScanWines(wines).slice(0, count);
}

export function groupListScanWinesByType(wines: ListScanParsedWine[]) {
  const grouped = new Map<ListScanWineType, ListScanParsedWine[]>();

  wines.forEach((wine) => {
    const effectiveWineType = resolveListScanWineType(wine);
    const bucket = grouped.get(effectiveWineType);
    if (bucket) {
      bucket.push(wine);
      return;
    }
    grouped.set(effectiveWineType, [wine]);
  });

  return LIST_SCAN_ALL_WINE_TYPES.flatMap((wineType) => {
    const bucket = grouped.get(wineType);
    return bucket && bucket.length > 0 ? [{ wine_type: wineType, wines: bucket }] : [];
  });
}

export function buildListScanRationale(wine: {
  wine_type: ListScanWineType;
  varietals: string[];
  regions: string[];
  price_display: string | null;
}) {
  const parts: string[] = [];
  if (wine.varietals[0]) {
    parts.push(`Highlights ${wine.varietals[0]}.`);
  }
  const displayRegion = getListScanDisplayRegion(wine.regions);
  if (displayRegion) {
    parts.push(`Comes from ${displayRegion}.`);
  }
  const formattedPrice = formatPriceDisplayForCopy(wine.price_display);
  if (formattedPrice) {
    parts.push(`Listed at ${formattedPrice}.`);
  }

  if (parts.length === 0) {
    const typeLabel =
      resolveListScanWineType({
        wine_type: wine.wine_type,
        menu_label: "",
        wine_name: null,
        producer: null,
        regions: wine.regions,
        varietals: wine.varietals,
      }) === "dessert_fortified"
        ? "dessert or fortified wine"
        : listScanWineTypeLabels[
            resolveListScanWineType({
              wine_type: wine.wine_type,
              menu_label: "",
              wine_name: null,
              producer: null,
              regions: wine.regions,
              varietals: wine.varietals,
            })
          ];
    return `A strong placeholder match within the ${typeLabel.toLowerCase()} set.`;
  }

  return parts.join(" ");
}

export function createStableMatchPercent(seed: string, minimum = 54, maximum = 98) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  const range = Math.max(1, maximum - minimum + 1);
  return minimum + (hash % range);
}

function formatPriceDisplayForCopy(value: string | null) {
  const tokens = (value?.match(/\$?\s*\d+(?:\.\d{1,2})?/g) ?? [])
    .map((token) => token.replace(/\s+/g, "").replace(/^\$/, ""))
    .filter(Boolean)
    .map((token) => `$${token}`);

  if (tokens.length > 0) {
    return tokens.join("/");
  }

  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  return normalized.startsWith("$") ? normalized : `$${normalized}`;
}

function resolveTrailingDualPriceDisplay(
  priceDisplay: string | null,
  label?: string
) {
  const baseDisplay = formatPriceDisplayForCopy(priceDisplay);
  if (!label) {
    return baseDisplay;
  }

  const embeddedDualPriceMatch = label.match(
    /\$\s*\d+(?:\.\d{1,2})?(?:\s*(?:\/|[-–])\s*\$?\d+(?:\.\d{1,2})?)+\s*$/i
  );
  if (embeddedDualPriceMatch?.[0]) {
    return formatPriceDisplayForCopy(embeddedDualPriceMatch[0]) ?? baseDisplay;
  }

  const trailingBottlePriceMatch = label.match(
    /(?:\/|[-–])\s*(\$?\s*\d+(?:\.\d{1,2})?)\s*$/i
  );
  if (!trailingBottlePriceMatch?.[1] || !baseDisplay) {
    return baseDisplay;
  }

  const mergedTokens = [
    ...(baseDisplay.match(/\$?\s*\d+(?:\.\d{1,2})?/g) ?? []),
    ...(formatPriceDisplayForCopy(trailingBottlePriceMatch[1])?.match(
      /\$?\s*\d+(?:\.\d{1,2})?/g
    ) ?? []),
  ];
  const dedupedTokens = Array.from(
    new Set(
      mergedTokens
        .map((token) => token.replace(/\s+/g, "").replace(/^\$/, ""))
        .filter(Boolean)
        .map((token) => `$${token}`)
    )
  );

  return dedupedTokens.length > 0 ? dedupedTokens.join("/") : baseDisplay;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function formatListScanPriceDisplay(value: string | null, label?: string) {
  return resolveTrailingDualPriceDisplay(value, label);
}

export function stripLeadingListScanIdentifier(value: string) {
  return value.replace(/^\s*\d{5,}(?:[\s)\].,:;\-–—]+)?\s*/, "").trim();
}

function normalizeListScanDisplaySpacing(value: string) {
  return value
    .replace(/^\s*N\.?\s*V\.?(?=\s*[A-ZÀ-ÿ])/i, "NV ")
    .replace(/\bN\.?\s*V\.?(?=\s*[A-ZÀ-ÿ])/gi, "NV ")
    .replace(/^\s*NV(?=[A-ZÀ-ÿ][a-zà-ÿ])/i, "NV ")
    .replace(/\bNV\s{2,}/g, "NV ");
}

export function sanitizeListScanWineName(value: string | null | undefined) {
  const normalized = normalizeFacetValue(value ?? "");
  if (!normalized) {
    return null;
  }

  const stripped = stripLeadingListScanIdentifier(normalized);
  const spaced = normalizeListScanDisplaySpacing(stripped);
  return spaced.length > 0 ? spaced : null;
}

function stripProducerPrefixFromLabel(label: string, producer: string) {
  const normalizedLabel = normalizeFacetValue(label);
  const normalizedProducer = normalizeFacetValue(producer);
  if (!normalizedLabel || !normalizedProducer) {
    return normalizedLabel || null;
  }

  const patterns = [
    new RegExp(`^${escapeRegExp(normalizedProducer)}(?:\\s*[|,:;()\\-\\u2013\\u2014]+\\s*)?`, "i"),
    new RegExp(`^${escapeRegExp(normalizedProducer)}\\s+`, "i"),
  ];

  let trimmed = normalizedLabel;
  for (const pattern of patterns) {
    if (pattern.test(trimmed)) {
      trimmed = trimmed.replace(pattern, "").trim();
      break;
    }
  }

  return trimmed || null;
}

function hasEmbeddedProducerPrefix(label: string, producer: string) {
  const normalizedLabel = normalizeFacetValue(label);
  const normalizedProducer = normalizeFacetValue(producer);
  if (!normalizedLabel || !normalizedProducer) {
    return false;
  }

  const patterns = [
    new RegExp(`^${escapeRegExp(normalizedProducer)}(?:\\s*[|,:;()\\-\\u2013\\u2014]+\\s*)?`, "i"),
    new RegExp(`^${escapeRegExp(normalizedProducer)}\\s+`, "i"),
  ];

  return (
    normalizedLabel.localeCompare(normalizedProducer, undefined, {
      sensitivity: "base",
    }) === 0 || patterns.some((pattern) => pattern.test(normalizedLabel))
  );
}

function inferProducerFromLabel(
  label: string,
  wineName: string | null
) {
  const normalizedLabel = normalizeFacetValue(label);
  if (!normalizedLabel) {
    return null;
  }

  if (wineName) {
    const escapedWineName = escapeRegExp(wineName);
    const wineNamePattern = new RegExp(`^(.*?)(?:\\s*[|,:;()\\-\\u2013\\u2014]+\\s*)?${escapedWineName}$`, "i");
    const match = normalizedLabel.match(wineNamePattern);
    const candidate = normalizeFacetValue(match?.[1] ?? "");
    if (candidate && candidate.length <= 60) {
      return candidate;
    }
  }

  const firstSegment = normalizeFacetValue(normalizedLabel.split("|")[0] ?? "");
  if (
    firstSegment &&
    firstSegment.length <= 60 &&
    /[A-Za-z]/.test(firstSegment) &&
    !/\b(?:blanc|blend|brut|chardonnay|chenin|gamay|gruner|malvasia|mascalese|nerello|pinot|riesling|sangiovese|sauvignon|syrah|viognier)\b/i.test(
      firstSegment
    )
  ) {
    return firstSegment;
  }

  const uppercaseLeadMatch = normalizedLabel.match(
    /^([A-Z][A-Z'&.\- ]{2,60})(?:\s+[A-Z][A-Z'&.\- ]{1,60})?/
  );
  if (uppercaseLeadMatch?.[0]) {
    return normalizeFacetValue(uppercaseLeadMatch[0]);
  }

  return null;
}

function normalizeListScanSentenceText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function splitListScanSentences(value: string | null | undefined) {
  const normalized = normalizeListScanSentenceText(value);
  if (!normalized) {
    return [];
  }

  const matches = normalized.match(/[^.!?]+[.!?]?/g) ?? [];
  return matches
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function isGenericListScanLeadSentence(sentence: string) {
  return (
    /^\s*its style lines up with\b/i.test(sentence) ||
    /^\s*this wine(?:'s)? style lines up with\b/i.test(sentence) ||
    /^\s*a strong placeholder match\b/i.test(sentence) ||
    /^\s*highlights?\b/i.test(sentence)
  );
}

export function extractListScanFollowupCopy(
  value: string | null | undefined,
  options?: { preferFollowup?: boolean }
) {
  const sentences = splitListScanSentences(value);
  if (sentences.length === 0) {
    return null;
  }

  if (sentences.length === 1) {
    return isGenericListScanLeadSentence(sentences[0]) ? null : sentences[0];
  }

  const [firstSentence, ...remainingSentences] = sentences;
  if (
    options?.preferFollowup === true ||
    isGenericListScanLeadSentence(firstSentence)
  ) {
    const followup = remainingSentences.join(" ").trim();
    return followup || null;
  }

  return sentences.join(" ");
}

export function getListScanDisplayLines(
  wine: Pick<
    ListScanParsedWine,
    "menu_label" | "producer" | "wine_name" | "price_display" | "price_value"
  >
) {
  const sanitizedLabel = sanitizeListScanMenuLabel(
    wine.menu_label,
    wine.price_display,
    wine.price_value
  );
  const wineName = sanitizeListScanWineName(wine.wine_name);
  const producer =
    (wine.producer ? normalizeFacetValue(wine.producer) : null) ??
    inferProducerFromLabel(sanitizedLabel, wineName);

  const producerPrefix =
    producer && sanitizedLabel
      ? stripProducerPrefixFromLabel(sanitizedLabel, producer)
      : null;
  const producerPrefixIsMeaningful =
    producerPrefix !== null &&
    producerPrefix.localeCompare(sanitizedLabel, undefined, {
      sensitivity: "base",
    }) !== 0;
  const producerEmbedded =
    producer && sanitizedLabel ? hasEmbeddedProducerPrefix(sanitizedLabel, producer) : false;
  const producerIsSeparate =
    Boolean(producer && sanitizedLabel) &&
    (producerPrefixIsMeaningful || !producerEmbedded);
  const title =
    producerIsSeparate && producer
      ? producer
      : sanitizedLabel || producer || wineName || "Untitled wine";
  const subtitleCandidate = producerPrefixIsMeaningful
    ? producerPrefix
    : producerIsSeparate
      ? sanitizedLabel
      : null;
  const subtitle =
    subtitleCandidate &&
    subtitleCandidate.localeCompare(title, undefined, { sensitivity: "base" }) !== 0 &&
    (producerIsSeparate ||
      subtitleCandidate.localeCompare(wineName ?? "", undefined, { sensitivity: "base" }) !== 0)
      ? subtitleCandidate
      : null;

  return {
    title,
    subtitle,
    producer,
    wineName,
  };
}

export function getListScanStructuredMeta(
  wine: Pick<
    ListScanParsedWine,
    | "wine_type"
    | "menu_label"
    | "wine_name"
    | "producer"
    | "regions"
    | "varietals"
    | "canonical_country"
    | "parse_confidence"
  >
) {
  const resolvedType = resolveListScanWineType(wine);
  const typeLabel =
    resolvedType !== "unknown" ? listScanWineTypeLabels[resolvedType] : null;
  const primaryVarietal = wine.varietals[0] ?? null;
  const displayRegion = getListScanDisplayRegion(wine.regions);
  const displayCountry = getListScanCountryLabel(wine);
  return {
    typeLabel,
    primaryVarietal,
    displayRegion,
    displayCountry,
  };
}

export function sanitizeListScanMenuLabel(
  label: string,
  priceDisplay: string | null,
  priceValue: number | null
) {
  let normalized = stripLeadingListScanIdentifier(normalizeFacetValue(label));
  if (!normalized) {
    return label;
  }

  normalized = normalizeListScanDisplaySpacing(normalized);

  const candidates = new Set<string>();
  const formattedPrice = formatListScanPriceDisplay(priceDisplay, label);
  if (formattedPrice) {
    candidates.add(formattedPrice);
    candidates.add(formattedPrice.replace(/^\$\s*/, ""));
    (formattedPrice.match(/\$?\s*\d+(?:\.\d{1,2})?/g) ?? []).forEach((token) => {
      const compactToken = token.replace(/\s+/g, "");
      candidates.add(compactToken);
      candidates.add(compactToken.replace(/^\$/, ""));
    });
  }
  if (typeof priceValue === "number" && Number.isFinite(priceValue)) {
    const compact =
      priceValue % 1 === 0 ? String(priceValue) : priceValue.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    candidates.add(compact);
    candidates.add(`$${compact}`);
  }

  let previous = "";
  while (previous !== normalized) {
    previous = normalized;
    normalized = normalized
      .replace(
        /\s*\$?\d+(?:\.\d{1,2})?(?:\s*(?:\/|[-–])\s*\$?\d+(?:\.\d{1,2})?)+\s*$/i,
        ""
      )
      .trim();

    Array.from(candidates)
      .sort((left, right) => right.length - left.length)
      .forEach((candidate) => {
        if (!candidate) {
          return;
        }
        const pattern = new RegExp(
          String.raw`(?:[\s|/.,;:()\-\u2013\u2014]+)?${escapeRegExp(candidate)}$`,
          "i"
        );
        if (pattern.test(normalized)) {
          normalized = normalized.replace(pattern, "").trim();
        }
      });

    normalized = normalized.replace(/[\s|/.,;:()\-\u2013\u2014$]+$/g, "").trim();
  }

  normalized = normalized
    .replace(/\s*\$\s*\d+(?:\.\d{1,2})?(?:\s*(?:glass|bottle|btl|gl))?/gi, "")
    .replace(/[\s|/.,;:()\-\u2013\u2014$]+$/g, "")
    .trim();

  return normalized || label;
}

export function getListScanSectionTitle(wineType: ListScanWineType) {
  if (wineType === "unknown") {
    return "Other";
  }
  return listScanWineTypeLabels[wineType];
}

export type ListScanRegionGroup = {
  country: string;
  subRegions: string[];
};

function getListScanCountryLabel(wine: Pick<
  ListScanParsedWine,
  "canonical_country" | "regions"
>) {
  return (
    normalizeListScanCountryLabel(wine.canonical_country) ??
    wine.regions
      .map((region) => normalizeListScanCountryLabel(region))
      .find((value): value is string => Boolean(value)) ??
    (wine.regions[0] ? normalizeFacetValue(wine.regions[0]) : null)
  );
}

export function deriveListScanRegionGroups(
  wines: ListScanParsedWine[]
): ListScanRegionGroup[] {
  // Only sub-regions need to pass the region validation filter.
  const validSubRegions = new Set(
    deriveListScanRegionFacets(wines).map((r) =>
      normalizeListScanRegionValue(r).toLowerCase()
    )
  );

  const countryMap = new Map<string, Set<string>>();
  const countryDisplay = new Map<string, string>();

  wines.forEach((wine) => {
    if (wine.regions.length === 0) {
      return;
    }

    const country = getListScanCountryLabel(wine);
    if (!country) {
      return;
    }

    const countryKey = country.toLowerCase();
    if (!countryMap.has(countryKey)) {
      countryMap.set(countryKey, new Set());
      countryDisplay.set(countryKey, country);
    }

    for (const region of wine.regions) {
      const sub = normalizeListScanRegionValue(region);
      if (!sub) {
        continue;
      }
      const subKey = sub.toLowerCase();
      // Skip sub-regions that are the same as the country itself
      if (subKey === countryKey) {
        continue;
      }
      if (validSubRegions.has(subKey)) {
        countryMap.get(countryKey)!.add(sub);
      }
    }
  });

  const result: ListScanRegionGroup[] = [];
  for (const [countryKey, subSet] of countryMap) {
    result.push({
      country: countryDisplay.get(countryKey) ?? countryKey,
      subRegions: Array.from(subSet).sort(facetSort),
    });
  }

  result.sort((a, b) => facetSort(a.country, b.country));
  return result;
}

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function filterSelectionToAvailable<T extends string>(
  selected: readonly T[],
  available: readonly T[],
  fallback: readonly T[]
) {
  if (available.length === 0) {
    return [...fallback];
  }

  const availableMap = new Map<string, T>();
  available.forEach((value) => {
    const normalized = normalizeFacetValue(value).toLowerCase();
    if (!normalized || availableMap.has(normalized)) {
      return;
    }
    availableMap.set(normalized, value);
  });

  const seen = new Set<string>();
  const next: T[] = [];

  selected.forEach((value) => {
    const normalized = normalizeFacetValue(value).toLowerCase();
    const canonicalValue = availableMap.get(normalized);
    if (!canonicalValue || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    next.push(canonicalValue);
  });

  return next;
}

export type ListScanRegionSelectionState = {
  country: string | null;
  subRegions: string[];
  countryGroup: ListScanRegionGroup | null;
};

export function getListScanRegionSelectionState(
  selected: string[],
  regionGroups: ListScanRegionGroup[]
): ListScanRegionSelectionState {
  if (selected.length === 0 || regionGroups.length === 0) {
    return {
      country: null,
      subRegions: [],
      countryGroup: null,
    };
  }

  const selectedSet = new Set(
    selected.map((value) => normalizeFacetValue(value).toLowerCase())
  );
  const countryGroup =
    regionGroups.find((group) =>
      selectedSet.has(normalizeFacetValue(group.country).toLowerCase())
    ) ?? null;

  if (!countryGroup) {
    return {
      country: null,
      subRegions: [],
      countryGroup: null,
    };
  }

  return {
    country: countryGroup.country,
    subRegions: countryGroup.subRegions.filter((region) =>
      selectedSet.has(normalizeFacetValue(region).toLowerCase())
    ),
    countryGroup,
  };
}

export function sanitizeListScanRegionSelection(
  selected: string[],
  regionGroups: ListScanRegionGroup[]
) {
  const selectionState = getListScanRegionSelectionState(selected, regionGroups);
  if (!selectionState.country) {
    return [];
  }

  return [selectionState.country, ...selectionState.subRegions];
}

export function sanitizeListScanFilters(
  filters: ListScanFilters,
  facets?: Partial<ListScanFacets>,
  regionGroups: ListScanRegionGroup[] = []
): ListScanFilters {
  const nextIncludedWineTypes = filterSelectionToAvailable(
    filters.included_wine_types,
    facets?.wine_types ?? [],
    [...LIST_SCAN_FILTERABLE_WINE_TYPES]
  );
  const nextSelectedVarietals = filterSelectionToAvailable(
    filters.selected_varietals,
    facets?.varietals ?? [],
    []
  );
  const nextSelectedRegions = sanitizeListScanRegionSelection(
    filters.selected_regions,
    regionGroups
  );

  if (
    arraysEqual(filters.included_wine_types, nextIncludedWineTypes) &&
    arraysEqual(filters.selected_varietals, nextSelectedVarietals) &&
    arraysEqual(filters.selected_regions, nextSelectedRegions)
  ) {
    return filters;
  }

  return {
    ...filters,
    included_wine_types: nextIncludedWineTypes,
    selected_varietals: nextSelectedVarietals,
    selected_regions: nextSelectedRegions,
  };
}
