import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  LIST_SCAN_SCORE_MODES,
  createListScanId,
  createStableMatchPercent,
  deriveListScanFacets,
  buildListScanRationale,
  resolveListScanWineType,
  sanitizeListScanMenuLabel,
  type ListScanParsedWine,
  type ListScanResult,
  type ListScanSourceType,
  type ListScanWineType,
} from "@shared";
import { normalizeAdvancedNotes } from "@/lib/advancedNotes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ProfileAssemblyDataSource } from "@/server/algorithm/profileAssembly";
import {
  assembleWineProfileWithDataSource,
  createSupabaseProfileAssemblyDataSource,
  batchPrefetchProfileData,
  createPreFetchedProfileDataSource,
} from "@/server/algorithm/profileAssembly";
import { computeMatchScore } from "@/server/algorithm/scoringEngine";
import {
  buildUserPreferenceVector,
  type PreferenceSourceEntry,
} from "@/server/algorithm/userPreferences";
import { fetchPrimaryGrapesByEntryId } from "@/lib/primaryGrapes";
import { executeSelectWithFallback } from "@/server/db/compat";
import {
  normalizeProducerText,
  normalizeWineNameText,
  toTitleCaseWineText,
} from "@/lib/wineText";
import {
  OpenAiImagePreparationError,
  prepareOpenAiImageDataUrl,
} from "@/server/images/openAiImage";
import { loadInferenceMap } from "@/server/listScan/inference";
import { WINE_TYPE_VALUES, type WineType } from "@/types/wine";

const MAX_IMAGE_INPUT_BYTES = 24 * 1024 * 1024;
const MAX_IMAGE_PROCESSED_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_COUNT = 6;
const MAX_FILE_INPUT_BYTES = 32 * 1024 * 1024;
const MAX_FETCHED_TEXT_CHARS = 24_000;
const MAX_URL_MODEL_INPUT_CHARS = 10_000;
const REQUEST_TIMEOUT_MS = 90_000;
const ABSOLUTE_NON_WINE_ENTRY_PATTERN =
  /\b(?:coffee|espresso|americano|macchiato|latte|flat white|cappuccino|cold brew|tea|herbal|water|sparkling water|soda|limeade|lemonade|juice|grape juice|shrub|arnold palmer|kombucha|beer|ale|ipa|pilsner|porter|stout|cider|spritz|michelada|mimosa|non-alcoholic|zero-proof|soft beverage)\b/i;
const NON_WINE_SECTION_HEADING_PATTERN =
  /^##\s*(?:beer|beers|soft beverage|soft beverages|coffee|tea|cocktail|cocktails|spirits?|zero proof|zero-proof|non-alcoholic|non alcoholic|juice|juices|water|desserts?|mixed|email signup|newsletter|contact|hours|location|reservations?|private events?|gift cards?|careers?|about)\b/i;
const WINE_SECTION_HEADING_PATTERN =
  /^##\s*(?:wines?|sparkling|white|red|rose|rosÃ©|orange|skin contact|dessert wine|fortified|sweet wines?|by the glass|half bottles?|large format|magnums?)\b/i;
const WINE_SIGNAL_PATTERN =
  /\b(?:wine|champagne|cr[Ã©e]mant|prosecco|cava|pet[\s-]?nat|lambrusco|sancerre|chablis|chianti|barolo|barbaresco|riesling|chardonnay|sauvignon|pinot|gamay|syrah|shiraz|cab(?:ernet)?(?: sauvignon| franc)?|merlot|nebbiolo|sangiovese|grenache|chenin|malbec|tempranillo|moscato|madeira|sherry|port|ros[Ã©e]|brut|trocken|blanc|noir|bordeaux|burgundy|rhone|rioja|mosel|alsace|piedmont|tuscany|beaujolais|etna|santorini|n\.?v\.?|'(?:\d{2})|\b19\d{2}\b|\b20\d{2}\b)\b/i;
const NON_CONTENT_LINE_PATTERN =
  /^(?:reservations|join our newsletter|powered by bentobox|leave this field blank|email signup|submit|thank you for signing up)/i;

const EXPLICIT_VARIETAL_PATTERNS = [
  { pattern: /\bsauvignon blanc\b/i, varietal: "Sauvignon Blanc" },
  { pattern: /\bsangiovese\b/i, varietal: "Sangiovese" },
  { pattern: /\bchardonnay\b/i, varietal: "Chardonnay" },
  { pattern: /\bpinot noir\b/i, varietal: "Pinot Noir" },
  { pattern: /\bpinot grigio\b/i, varietal: "Pinot Grigio" },
  { pattern: /\bpinot gris\b/i, varietal: "Pinot Gris" },
  { pattern: /\briesling\b/i, varietal: "Riesling" },
  { pattern: /\bsyrah\b/i, varietal: "Syrah" },
  { pattern: /\bshiraz\b/i, varietal: "Shiraz" },
  { pattern: /\bcabernet sauvignon\b/i, varietal: "Cabernet Sauvignon" },
  { pattern: /\bmerlot\b/i, varietal: "Merlot" },
  { pattern: /\bcabernet franc\b/i, varietal: "Cabernet Franc" },
  { pattern: /\bnebbiolo\b/i, varietal: "Nebbiolo" },
  { pattern: /\btempranillo\b/i, varietal: "Tempranillo" },
  { pattern: /\bchenin blanc\b/i, varietal: "Chenin Blanc" },
  { pattern: /\bmelon de bourgogne\b/i, varietal: "Melon De Bourgogne" },
  { pattern: /\bgrenache\b/i, varietal: "Grenache" },
  { pattern: /\bgamay\b/i, varietal: "Gamay" },
];

const APPELLATION_VARIETAL_INFERENCES = [
  { pattern: /\bsancerre\b/i, varietal: "Sauvignon Blanc" },
  { pattern: /\bpouilly[\s-]?fum[éee]\b/i, varietal: "Sauvignon Blanc" },
  { pattern: /\bchianti(?: classico)?\b/i, varietal: "Sangiovese" },
  { pattern: /\bbrunello di montalcino\b/i, varietal: "Sangiovese" },
  { pattern: /\brosso di montalcino\b/i, varietal: "Sangiovese" },
  { pattern: /\bvino nobile di montepulciano\b/i, varietal: "Sangiovese" },
  { pattern: /\bmorellino di scansano\b/i, varietal: "Sangiovese" },
  { pattern: /\bmuscadet\b/i, varietal: "Melon De Bourgogne" },
  { pattern: /\bchablis\b/i, varietal: "Chardonnay" },
  { pattern: /\bmeursault\b/i, varietal: "Chardonnay" },
  { pattern: /\bpuligny[\s-]montrachet\b/i, varietal: "Chardonnay" },
  { pattern: /\bchassagne[\s-]montrachet\b/i, varietal: "Chardonnay" },
  { pattern: /\bpouilly[\s-]fuiss[éee]\b/i, varietal: "Chardonnay" },
  { pattern: /\bsaint[\s-]v[ée]ran\b/i, varietal: "Chardonnay" },
  { pattern: /\bm[aâ]con\b/i, varietal: "Chardonnay" },
  { pattern: /\bgevrey[\s-]chambertin\b/i, varietal: "Pinot Noir" },
  { pattern: /\bvosne[\s-]roman[éee]\b/i, varietal: "Pinot Noir" },
  { pattern: /\bchambolle[\s-]musigny\b/i, varietal: "Pinot Noir" },
  { pattern: /\bnuits[\s-]saint[\s-]georges\b/i, varietal: "Pinot Noir" },
  { pattern: /\bpommard\b/i, varietal: "Pinot Noir" },
  { pattern: /\bvolnay\b/i, varietal: "Pinot Noir" },
  { pattern: /\bsavenni[èe]res\b/i, varietal: "Chenin Blanc" },
  { pattern: /\bvouvray\b/i, varietal: "Chenin Blanc" },
  { pattern: /\bmontlouis\b/i, varietal: "Chenin Blanc" },
  { pattern: /\bbarolo\b/i, varietal: "Nebbiolo" },
  { pattern: /\bbarbaresco\b/i, varietal: "Nebbiolo" },
  { pattern: /\bgattinara\b/i, varietal: "Nebbiolo" },
  { pattern: /\bghemme\b/i, varietal: "Nebbiolo" },
  { pattern: /\brioja\b/i, varietal: "Tempranillo" },
  { pattern: /\bribera del duero\b/i, varietal: "Tempranillo" },
  { pattern: /\btoro\b/i, varietal: "Tempranillo" },
  { pattern: /\bbeaujolais\b/i, varietal: "Gamay" },
  { pattern: /\bmorgon\b/i, varietal: "Gamay" },
  { pattern: /\bfleurie\b/i, varietal: "Gamay" },
  { pattern: /\bmoulin[\s-]?[àa][\s-]?vent\b/i, varietal: "Gamay" },
  { pattern: /\bsoave\b/i, varietal: "Garganega" },
  { pattern: /\bgreco di tufo\b/i, varietal: "Greco" },
  { pattern: /\bverdicchio dei castelli di jesi\b/i, varietal: "Verdicchio" },
  { pattern: /\bcrozes[\s-]hermitage\b/i, varietal: "Syrah" },
  { pattern: /\bhermitage\b/i, varietal: "Syrah" },
  { pattern: /\bcornas\b/i, varietal: "Syrah" },
  { pattern: /\bc[ôo]te[\s-]r[ôo]tie\b/i, varietal: "Syrah" },
  { pattern: /\bsaint[\s-]joseph\b/i, varietal: "Syrah" },
];

const WINE_TYPE_BY_VARIETAL: Record<string, ListScanWineType> = {
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

const EXPLICIT_VARIETAL_INFERENCES: DeterministicWineInference[] = [
  ...EXPLICIT_VARIETAL_PATTERNS.map((entry) => ({
    ...entry,
    wineType: WINE_TYPE_BY_VARIETAL[entry.varietal],
  })),
  { pattern: /\balbari(?:n|ñ)o\b/i, varietal: "Albarino", wineType: "white" },
  { pattern: /\barneis\b/i, varietal: "Arneis", wineType: "white" },
  { pattern: /\bcarricante\b/i, varietal: "Carricante", wineType: "white" },
  { pattern: /\bcarignan\b/i, varietal: "Carignan", wineType: "red" },
  { pattern: /\bfiano\b/i, varietal: "Fiano", wineType: "white" },
  { pattern: /\bfurmint\b/i, varietal: "Furmint", wineType: "white" },
  { pattern: /\bgarganega\b/i, varietal: "Garganega", wineType: "white" },
  { pattern: /\bgew(?:u|u?rz)traminer\b/i, varietal: "Gewurztraminer", wineType: "white" },
  { pattern: /\bglera\b/i, varietal: "Glera", wineType: "sparkling" },
  { pattern: /\bgr(?:u|ü)ner veltliner\b/i, varietal: "Gruner Veltliner", wineType: "white" },
  { pattern: /\bgreco\b/i, varietal: "Greco", wineType: "white" },
  { pattern: /\bmalbec\b/i, varietal: "Malbec", wineType: "red" },
  { pattern: /\bmonastrell\b/i, varietal: "Monastrell", wineType: "red" },
  { pattern: /\bmourv(?:e|è)dre\b/i, varietal: "Mourvedre", wineType: "red" },
  { pattern: /\bnerello mascalese\b/i, varietal: "Nerello Mascalese", wineType: "red" },
  { pattern: /\bpinot blanc\b/i, varietal: "Pinot Blanc", wineType: "white" },
  { pattern: /\bpinot meunier\b/i, varietal: "Pinot Meunier", wineType: "red" },
  { pattern: /\bpicpoul\b/i, varietal: "Picpoul", wineType: "white" },
  { pattern: /\bsemillon\b/i, varietal: "Semillon", wineType: "white" },
  { pattern: /\bverdejo\b/i, varietal: "Verdejo", wineType: "white" },
  { pattern: /\bverdicchio\b/i, varietal: "Verdicchio", wineType: "white" },
  { pattern: /\bvermentino\b/i, varietal: "Vermentino", wineType: "white" },
  { pattern: /\bvernaccia\b/i, varietal: "Vernaccia", wineType: "white" },
  { pattern: /\bviognier\b/i, varietal: "Viognier", wineType: "white" },
  { pattern: /\bzinfandel\b/i, varietal: "Zinfandel", wineType: "red" },
];

const APPELLATION_INFERENCES: DeterministicWineInference[] = [
  ...APPELLATION_VARIETAL_INFERENCES.map((entry) => ({
    ...entry,
    wineType: WINE_TYPE_BY_VARIETAL[entry.varietal],
  })),
  { pattern: /\bbarbaresco\b/i, varietal: "Nebbiolo", wineType: "red" },
  { pattern: /\bbarolo\b/i, varietal: "Nebbiolo", wineType: "red" },
  { pattern: /\bbanyuls\b/i, wineType: "dessert_fortified" },
  { pattern: /\bcava\b/i, wineType: "sparkling" },
  { pattern: /\bchampagne\b/i, wineType: "sparkling" },
  { pattern: /\bcorpinnat\b/i, wineType: "sparkling" },
  { pattern: /\bcr(?:e|\u00e9)mant\b/i, wineType: "sparkling" },
  { pattern: /\betna bianco\b/i, varietal: "Carricante", wineType: "white" },
  { pattern: /\betna rosso\b/i, varietal: "Nerello Mascalese", wineType: "red" },
  { pattern: /\bfranciacorta\b/i, wineType: "sparkling" },
  { pattern: /\bgreco di tufo\b/i, varietal: "Greco", wineType: "white" },
  { pattern: /\blambrusco\b/i, wineType: "sparkling" },
  { pattern: /\bmadeira\b/i, wineType: "dessert_fortified" },
  { pattern: /\bmarsala\b/i, wineType: "dessert_fortified" },
  { pattern: /\bmoscato d[' ]asti\b/i, varietal: "Moscato", wineType: "sparkling" },
  { pattern: /\bprosecco\b/i, varietal: "Glera", wineType: "sparkling" },
  { pattern: /\broero arneis\b/i, varietal: "Arneis", wineType: "white" },
  { pattern: /\brutherglen\b/i, wineType: "dessert_fortified" },
  { pattern: /\bsauternes\b/i, wineType: "dessert_fortified" },
  { pattern: /\bsekt\b/i, wineType: "sparkling" },
  { pattern: /\bsherry\b/i, wineType: "dessert_fortified" },
  { pattern: /\bsoave\b/i, varietal: "Garganega", wineType: "white" },
  { pattern: /\btokaji\b/i, wineType: "dessert_fortified" },
  { pattern: /\bvin santo\b/i, wineType: "dessert_fortified" },
];

const SPARKLING_WINE_PATTERN =
  /\b(?:sparkling|champagne|prosecco|cava|cr(?:e|\u00e9)mant|pet[\s-]?nat|franciacorta|corpinnat|sekt|m(?:e|\u00e9)thode champenoise|metodo classico|blanc de blancs|blanc de noirs|moscato d[' ]asti|lambrusco)\b/i;
const DESSERT_FORTIFIED_WINE_PATTERN =
  /\b(?:dessert|fortified|port|sherry|madeira|marsala|vin santo|sauternes|tokaji|ice wine|eiswein|banyuls|rutherglen)\b/i;
const ROSE_WINE_PATTERN =
  /\b(?:rose|ros\u00e9|rosado|rosato|vin gris|provence rose|provence ros\u00e9|tavel|bandol rose|bandol ros\u00e9|cerasuolo)\b/i;
const ORANGE_WINE_PATTERN =
  /\b(?:orange|skin contact|amber wine|ramato|vino bianco macerato)\b/i;
const RED_WINE_PATTERN = /\b(?:red|rosso|rouge|tinto)\b/i;
const WHITE_WINE_PATTERN =
  /\b(?:white|bianco|blanc|blanco)\b/i;

const responseSchema = z.object({
  venue_name: z.string().nullable().optional(),
  list_title: z.string().nullable().optional(),
  overall_confidence: z.number().min(0).max(1).nullable().optional(),
  warnings: z.array(z.string()).optional(),
  wines: z.array(
    z.object({
      menu_label: z.string().min(1),
      producer: z.string().nullable().optional(),
      wine_name: z.string().nullable().optional(),
      vintage: z.string().nullable().optional(),
      wine_type: z
        .enum([
          "sparkling",
          "white",
          "rose",
          "orange",
          "red",
          "dessert_fortified",
          "unknown",
        ])
        .nullable()
        .optional(),
      price_display: z.string().nullable().optional(),
      price_value: z.number().nullable().optional(),
      varietals: z.array(z.string()).optional(),
      regions: z.array(z.string()).optional(),
      confidence: z.number().min(0).max(1).nullable().optional(),
    })
  ),
});

type ParsedResponse = z.infer<typeof responseSchema>;
type StructuredResponseReasoningEffort = "minimal" | "low" | "medium";

type ParseSourceParams =
  | {
      sourceType: "image";
      files: File[];
      sourceLabel: string | null;
      requesterId: string;
      userId?: string | null;
      userSupabase?: SupabaseClient | null;
    }
  | {
      sourceType: "pdf";
      file: File;
      sourceLabel: string | null;
      requesterId: string;
      userId?: string | null;
      userSupabase?: SupabaseClient | null;
    }
  | {
      sourceType: "url";
      url: string;
      requesterId: string;
      userId?: string | null;
      userSupabase?: SupabaseClient | null;
    };

type DeterministicWineInference = {
  pattern: RegExp;
  varietal?: string;
  wineType?: ListScanWineType;
};

type PreferenceEntryRow = {
  id: string;
  rating: number | null;
  advanced_notes: unknown;
  wine_type?: string | null;
  canonical_region?: string | null;
  canonical_sub_region?: string | null;
  canonical_country?: string | null;
  region?: string | null;
  appellation?: string | null;
  country?: string | null;
};

type EnrichedListScanWines = {
  wines: ListScanParsedWine[];
  scoreSummary: ListScanResult["score_summary"];
  warnings: string[];
};

function getOpenAiClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  return new OpenAI({ apiKey });
}

function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Invalid JSON response");
  }

  const candidate = text.slice(start, end + 1);
  try {
    return {
      value: JSON.parse(candidate),
      recovered: false,
    } as const;
  } catch {
    // Response may have been truncated mid-array. Try to recover by closing
    // any open array/object brackets so we keep the wines that were fully
    // serialized before the cutoff.
    const truncated = candidate
      .replace(/,\s*[^}\]]*$/, "")   // drop the last partial element
      .replace(/,\s*$/, "");         // remove trailing comma
    const openBraces = (truncated.match(/{/g) ?? []).length;
    const closeBraces = (truncated.match(/}/g) ?? []).length;
    const openBrackets = (truncated.match(/\[/g) ?? []).length;
    const closeBrackets = (truncated.match(/]/g) ?? []).length;
    const suffix =
      "]".repeat(Math.max(0, openBrackets - closeBrackets)) +
      "}".repeat(Math.max(0, openBraces - closeBraces));
    return {
      value: JSON.parse(truncated + suffix),
      recovered: true,
    } as const;
  }
}

function normalizeText(value?: string | null) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeFacetValues(values?: string[] | null) {
  if (!Array.isArray(values)) {
    return [] as string[];
  }

  const map = new Map<string, string>();
  values.forEach((value) => {
    const normalized = normalizeText(value);
    if (!normalized) {
      return;
    }
    const label = toTitleCaseWineText(normalized);
    const dedupeKey = label.toLowerCase();
    if (!map.has(dedupeKey)) {
      map.set(dedupeKey, label);
    }
  });
  return Array.from(map.values());
}

function normalizeWineType(value?: string | null): ListScanWineType {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }
  if (
    normalized === "rosé" ||
    normalized === "rose" ||
    normalized === "rosado" ||
    normalized === "rosato"
  ) {
    return "rose";
  }
  if (
    normalized === "orange wine" ||
    normalized === "orange" ||
    normalized === "skin contact"
  ) {
    return "orange";
  }
  if (
    normalized === "dessert" ||
    normalized === "sweet" ||
    normalized === "fortified"
  ) {
    return "dessert_fortified";
  }
  if (
    normalized === "sparkling" ||
    normalized === "white" ||
    normalized === "rose" ||
    normalized === "orange" ||
    normalized === "red" ||
    normalized === "dessert_fortified"
  ) {
    return normalized as ListScanWineType;
  }
  return "unknown";
}

function normalizePriceDisplay(value?: string | null) {
  const normalized = normalizeText(value);
  return normalized ? normalized.replace(/\s+/g, " ") : null;
}

function extractNormalizedPriceTokens(value?: string | null) {
  return (value?.match(/\$?\s*\d+(?:\.\d{1,2})?/g) ?? [])
    .map((token) => token.replace(/\s+/g, "").replace(/^\$/, ""))
    .filter(Boolean)
    .map((token) => `$${token}`);
}

function normalizeCompositePriceDisplay(value?: string | null) {
  const tokens = extractNormalizedPriceTokens(value);
  return tokens.length > 0 ? tokens.join("/") : normalizePriceDisplay(value);
}

function resolveListScanPriceFields(
  rawMenuLabel: string,
  priceDisplay: string | null
) {
  const normalizedPriceDisplay = normalizeCompositePriceDisplay(priceDisplay);
  const multiPriceLabelMatch = rawMenuLabel.match(
    /^(.*?)(\$\s*\d+(?:\.\d{1,2})?(?:\s*(?:\/|[-–])\s*\$?\s*\d+(?:\.\d{1,2})?)+)\s*$/i
  );

  if (multiPriceLabelMatch?.[2]) {
    return {
      menuLabel: normalizeText(multiPriceLabelMatch[1]) ?? rawMenuLabel,
      priceDisplay: normalizeCompositePriceDisplay(multiPriceLabelMatch[2]) ?? normalizedPriceDisplay,
    };
  }

  const secondaryPriceLabelMatch = rawMenuLabel.match(
    /^(.*?)(?:\s*(?:\/|[-–])\s*)(\$?\s*\d+(?:\.\d{1,2})?)\s*$/i
  );
  if (secondaryPriceLabelMatch?.[2] && normalizedPriceDisplay) {
    const mergedTokens = [
      ...extractNormalizedPriceTokens(normalizedPriceDisplay),
      ...extractNormalizedPriceTokens(secondaryPriceLabelMatch[2]),
    ];
    const dedupedTokens = Array.from(new Set(mergedTokens));

    return {
      menuLabel: normalizeText(secondaryPriceLabelMatch[1]) ?? rawMenuLabel,
      priceDisplay: dedupedTokens.join("/"),
    };
  }

  return {
    menuLabel: rawMenuLabel,
    priceDisplay: normalizedPriceDisplay,
  };
}

function buildUploadRowBoundaryInstructions() {
  return (
    "Treat each wine entry block as exactly one wine object. " +
    "A single wine may span multiple stacked text rows before its price, so merge those rows only when they clearly belong to the same entry. " +
    "Use blank space or a blank row before the next item as a strong boundary between wines. " +
    "On many lists, one wine appears as a producer line with a details line directly underneath and one right-aligned price for that whole two-line block. " +
    "In that layout, attach the right-aligned price to the producer-plus-details block immediately beside it, not to the next block below. " +
    "For example, if one blank-separated block has a price of 198 and the next block has a price of 75, return two wines priced 198 and 75 rather than one merged wine priced 75. " +
    "Do not combine neighboring wines into one object, even when the producer, region, or section repeats. " +
    "Do not carry a price, vintage, producer, or wine name from the row above or below into a neighboring entry. " +
    "If part of a row is unclear, keep only the text that is visible and lower confidence instead of guessing from a neighbor. "
  );
}

function mergeParsedWarnings(...warningSets: Array<string[] | undefined>) {
  const merged: string[] = [];

  warningSets.forEach((warnings) => {
    warnings?.forEach((warning) => {
      const normalized = normalizeText(warning);
      if (
        normalized &&
        !merged.some((entry) => entry.toLowerCase() === normalized.toLowerCase())
      ) {
        merged.push(normalized);
      }
    });
  });

  return merged;
}

function buildInitialUploadPrompt(params: {
  sourceHint: string;
  sourceLabel: string;
  continuityInstruction: string;
}) {
  return (
    `${baseInstructions(params.sourceHint)}\n\n` +
    "Read the full visible wine list row by row and return every distinct wine entry you can read. " +
    buildUploadRowBoundaryInstructions() +
    "If a wine row is likely present but partly unclear, include the readable text with lower confidence rather than omitting the row or merging it with a neighbor. " +
    `${params.continuityInstruction.trim()} ` +
    "If the same wine appears in multiple formats or sizes, preserve the wording in menu_label and keep the price as displayed. " +
    `Source label: ${params.sourceLabel}`
  );
}

function isLikelyNonWineEntry(params: {
  menuLabel: string;
  wineName: string | null;
  producer: string | null;
  varietals: string[];
  regions: string[];
  wineType: ListScanWineType;
}) {
  if (
    WINE_SECTION_HEADING_PATTERN.test(params.menuLabel) &&
    !params.wineName &&
    !params.producer &&
    params.varietals.length === 0 &&
    params.regions.length === 0
  ) {
    return true;
  }

  const context = [params.menuLabel, params.wineName, params.producer, ...params.varietals]
    .filter(Boolean)
    .join(" | ");

  if (!ABSOLUTE_NON_WINE_ENTRY_PATTERN.test(context)) {
    return false;
  }

  return true;
}

function hasLikelyWineEvidence(params: {
  menuLabel: string;
  wineName: string | null;
  producer: string | null;
  vintage: string | null;
  varietals: string[];
  regions: string[];
  wineType: ListScanWineType;
}) {
  if (
    WINE_SECTION_HEADING_PATTERN.test(params.menuLabel) &&
    !params.wineName &&
    !params.producer &&
    !params.vintage &&
    params.varietals.length === 0 &&
    params.regions.length === 0
  ) {
    return false;
  }

  if (
    params.wineType === "sparkling" ||
    params.wineType === "white" ||
    params.wineType === "red" ||
    params.wineType === "dessert_fortified"
  ) {
    return true;
  }
  if (params.varietals.length > 0 || params.regions.length > 0) {
    return true;
  }
  if (params.vintage) {
    return true;
  }

  const context = [params.menuLabel, params.wineName, params.producer]
    .filter(Boolean)
    .join(" | ");
  return WINE_SIGNAL_PATTERN.test(context);
}

function inferBlendVarietalLabel(wineType: ListScanWineType) {
  if (wineType === "red") {
    return "Red Blend";
  }
  if (wineType === "white") {
    return "White Blend";
  }
  return null;
}

function buildInferenceContext(params: {
  menuLabel: string;
  wineName: string | null;
  producer: string | null;
  regions: string[];
  varietals?: string[];
}) {
  return [
    params.menuLabel,
    params.wineName,
    params.producer,
    ...(params.regions ?? []),
    ...(params.varietals ?? []),
  ]
    .filter(Boolean)
    .join(" | ");
}

function inferWineTypeFromVarietals(varietals: string[]) {
  const inferredTypes = Array.from(
    new Set(
      varietals
        .map((varietal) => WINE_TYPE_BY_VARIETAL[varietal])
        .filter((value): value is ListScanWineType => Boolean(value))
    )
  );

  if (inferredTypes.length === 1) {
    return inferredTypes[0];
  }

  return "unknown" as ListScanWineType;
}

function inferWineTypeFromContext(params: {
  menuLabel: string;
  wineName: string | null;
  producer: string | null;
  regions: string[];
  varietals: string[];
  wineType: ListScanWineType;
}) {
  const context = buildInferenceContext(params);

  if (SPARKLING_WINE_PATTERN.test(context)) {
    return "sparkling";
  }
  if (DESSERT_FORTIFIED_WINE_PATTERN.test(context)) {
    return "dessert_fortified";
  }
  if (ROSE_WINE_PATTERN.test(context)) {
    return "rose";
  }
  if (ORANGE_WINE_PATTERN.test(context)) {
    return "orange";
  }

  const appellationType = APPELLATION_INFERENCES.find(
    (entry) => entry.wineType && entry.pattern.test(context)
  )?.wineType;
  if (appellationType) {
    return appellationType;
  }

  if (
    params.wineType === "sparkling" ||
    params.wineType === "dessert_fortified" ||
    params.wineType === "rose" ||
    params.wineType === "orange" ||
    params.wineType === "red" ||
    params.wineType === "white"
  ) {
    return params.wineType;
  }

  const varietalType = inferWineTypeFromVarietals(params.varietals);
  if (varietalType !== "unknown") {
    return varietalType;
  }

  if (RED_WINE_PATTERN.test(context) && !WHITE_WINE_PATTERN.test(context)) {
    return "red";
  }
  if (ROSE_WINE_PATTERN.test(context)) {
    return "rose";
  }
  if (ORANGE_WINE_PATTERN.test(context)) {
    return "orange";
  }
  if (WHITE_WINE_PATTERN.test(context)) {
    return "white";
  }

  return params.wineType;
}

function inferVarietalsFromContext(params: {
  menuLabel: string;
  wineName: string | null;
  producer: string | null;
  regions: string[];
  wineType: ListScanWineType;
  varietals: string[];
}) {
  if (params.varietals.length > 0) {
    return params.varietals;
  }

  const context = buildInferenceContext(params);

  const explicitMatches = EXPLICIT_VARIETAL_INFERENCES.flatMap((entry) =>
    entry.varietal && entry.pattern.test(context) ? [entry.varietal] : []
  );
  if (explicitMatches.length > 0) {
    return normalizeFacetValues(explicitMatches);
  }

  const appellationMatches = APPELLATION_INFERENCES.flatMap((entry) =>
    entry.varietal && entry.pattern.test(context) ? [entry.varietal] : []
  );
  if (appellationMatches.length > 0) {
    return normalizeFacetValues(appellationMatches);
  }

  if (/\b(blend|assemblage|field blend|cuv(?:ee|ée))\b/i.test(context)) {
    const blendLabel = inferBlendVarietalLabel(params.wineType);
    if (blendLabel) {
      return [blendLabel];
    }
  }

  return [];
}

function parseFallbackPriceValue(value: string | null) {
  if (!value) {
    return null;
  }

  const matches = value.match(/\d+(?:\.\d{1,2})?/g);
  if (!matches || matches.length === 0) {
    return null;
  }

  const parsed = Number(matches[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPercent(value?: number | null, fallback = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function normalizeParsedWines(parsed: ParsedResponse): ListScanParsedWine[] {
  return parsed.wines
    .map((wine, index) => {
      const rawMenuLabel = normalizeText(wine.menu_label);
      if (!rawMenuLabel) {
        return null;
      }

      // Filter out garbage entries from OCR: bare numbers, price fragments,
      // dot-leader remnants, or labels too short to be a real wine name.
      const labelLettersOnly = rawMenuLabel.replace(/[^a-zA-Z]/g, "");
      if (
        labelLettersOnly.length < 3 ||
        /^\.?\d{1,4}$/.test(rawMenuLabel.trim()) ||
        /^[.\s\d]+$/.test(rawMenuLabel.trim())
      ) {
        return null;
      }

      const producer = normalizeProducerText(wine.producer) ?? normalizeText(wine.producer);
      const wineName =
        normalizeWineNameText(wine.wine_name) ?? normalizeText(wine.wine_name);
      const vintage = normalizeText(wine.vintage);
      const resolvedPriceFields = resolveListScanPriceFields(
        rawMenuLabel,
        normalizePriceDisplay(wine.price_display)
      );
      const priceDisplay = resolvedPriceFields.priceDisplay;
      const priceValue =
        typeof wine.price_value === "number" && Number.isFinite(wine.price_value)
          ? wine.price_value
          : parseFallbackPriceValue(priceDisplay);
      const menuLabel = sanitizeListScanMenuLabel(
        resolvedPriceFields.menuLabel,
        priceDisplay,
        priceValue
      );
      const regions = normalizeFacetValues(wine.regions);
      const suppliedWineType = normalizeWineType(wine.wine_type);
      const suppliedVarietals = normalizeFacetValues(wine.varietals);
      const preliminaryWineType = inferWineTypeFromContext({
        menuLabel,
        wineName,
        producer,
        regions,
        varietals: suppliedVarietals,
        wineType: suppliedWineType,
      });
      const varietals = inferVarietalsFromContext({
        menuLabel,
        wineName,
        producer,
        regions,
        wineType: preliminaryWineType,
        varietals: suppliedVarietals,
      });
      const wineType = inferWineTypeFromContext({
        menuLabel,
        wineName,
        producer,
        regions,
        varietals,
        wineType: preliminaryWineType,
      });
      const context = buildInferenceContext({
        menuLabel,
        wineName,
        producer,
        regions,
        varietals,
      });
      const resolvedWineType = resolveListScanWineType({
        wine_type: wineType,
        menu_label: menuLabel,
        wine_name: wineName,
        producer,
        regions,
        varietals,
      });
      const resolvedVarietals =
        varietals.length === 0 &&
        /\b(?:blend|assemblage|field blend|cuv(?:ee|ée)|bordeaux style|rhone(?: style)? blend)\b/i.test(
          context
        )
          ? (() => {
              const blendLabel = inferBlendVarietalLabel(resolvedWineType);
              return blendLabel ? [blendLabel] : varietals;
            })()
          : varietals;
      const parseConfidence = toPercent(wine.confidence, 74);
      const rationale = buildListScanRationale({
        wine_type: resolvedWineType,
        varietals: resolvedVarietals,
        regions,
        price_display: priceDisplay,
      });

      if (
        isLikelyNonWineEntry({
          menuLabel,
          wineName,
          producer,
          varietals: resolvedVarietals,
          regions,
          wineType: resolvedWineType,
        })
      ) {
        return null;
      }

      if (
        !hasLikelyWineEvidence({
          menuLabel,
          wineName,
          producer,
          vintage,
          varietals: resolvedVarietals,
          regions,
          wineType: resolvedWineType,
        })
      ) {
        return null;
      }

      return {
        id: createListScanId("wine"),
        source_order: index,
        menu_label: menuLabel,
        producer,
        wine_name: wineName,
        vintage,
        wine_type: resolvedWineType,
        price_display: priceDisplay,
        price_value: priceValue,
        varietals: resolvedVarietals,
        regions,
        match_percent: 0,
        parse_confidence: parseConfidence,
        rationale,
      } satisfies ListScanParsedWine;
    })
    .filter((wine): wine is ListScanParsedWine => wine !== null);
}

function isWineType(value: string | null | undefined): value is WineType {
  return WINE_TYPE_VALUES.includes(value as WineType);
}

function toAlgorithmWineType(wineType: ListScanWineType): WineType | null {
  if (wineType === "dessert_fortified") {
    return "sweet";
  }
  if (wineType === "unknown") {
    return null;
  }
  return isWineType(wineType) ? wineType : null;
}

function toListScanWineType(wineType: WineType | null): ListScanWineType | null {
  if (!wineType) {
    return null;
  }
  if (wineType === "sweet") {
    return "dessert_fortified";
  }
  if (
    wineType === "red" ||
    wineType === "white" ||
    wineType === "rose" ||
    wineType === "orange" ||
    wineType === "sparkling"
  ) {
    return wineType;
  }
  return null;
}

function normalizeInferenceLookupValue(value: string | null | undefined) {
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

function uniqueValues(values: string[]) {
  const seen = new Map<string, string>();
  values.forEach((value) => {
    const normalized = normalizeText(value);
    if (!normalized) {
      return;
    }
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, normalized);
    }
  });
  return Array.from(seen.values());
}

function lookupAppellation(
  value: string,
  inferenceMap: Awaited<ReturnType<typeof loadInferenceMap>>
) {
  const normalized = normalizeInferenceLookupValue(value);
  if (!normalized) {
    return null;
  }

  const direct = inferenceMap.appellationToGrapes.get(normalized);
  if (direct) {
    return direct;
  }

  const alias = inferenceMap.regionAliases.get(normalized);
  if (alias) {
    const fromAlias = inferenceMap.appellationToGrapes.get(
      normalizeInferenceLookupValue(alias)
    );
    if (fromAlias) {
      return fromAlias;
    }
  }

  return null;
}

function resolveInferenceForWine(
  wine: Pick<ListScanParsedWine, "regions" | "wine_name" | "menu_label">,
  inferenceMap: Awaited<ReturnType<typeof loadInferenceMap>>
) {
  // Check all regions (most specific first — reverse order since regions go broad→specific)
  for (let i = wine.regions.length - 1; i >= 0; i--) {
    const result = lookupAppellation(wine.regions[i], inferenceMap);
    if (result) {
      return result;
    }
  }

  // Scan wine_name and menu_label for known appellation names
  const textSources = [wine.wine_name, wine.menu_label].filter(Boolean) as string[];
  for (const text of textSources) {
    // Extract potential appellation tokens from the text
    // Check each word/phrase against the appellation map
    const words = text.split(/[\s|,;:()\-\u2013\u2014]+/).filter(Boolean);
    // Try multi-word phrases (up to 3 words) and single words
    for (let len = 3; len >= 1; len--) {
      for (let start = 0; start <= words.length - len; start++) {
        const phrase = words.slice(start, start + len).join(" ");
        const result = lookupAppellation(phrase, inferenceMap);
        if (result) {
          return result;
        }
      }
    }
  }

  return null;
}

function applyInferenceToWine(
  wine: ListScanParsedWine,
  inferenceMap: Awaited<ReturnType<typeof loadInferenceMap>>
) {
  const inferred = resolveInferenceForWine(wine, inferenceMap);
  const regions = uniqueValues([
    ...wine.regions,
    ...(inferred?.canonicalCountry ? [inferred.canonicalCountry] : []),
    ...(inferred?.canonicalRegion ? [inferred.canonicalRegion] : []),
    ...(inferred?.canonicalSubRegion ? [inferred.canonicalSubRegion] : []),
  ]);
  const varietals = uniqueValues([
    ...wine.varietals,
    ...(inferred?.grapes.length ? inferred.grapes : []),
  ]);
  const inferredWineTypeFromVarietals = varietals
    .map((varietal) =>
      inferenceMap.grapeToWineType.get(normalizeInferenceLookupValue(varietal)) ?? null
    )
    .filter((value): value is WineType => Boolean(value));
  const uniqueWineTypes = Array.from(new Set(inferredWineTypeFromVarietals));
  const inferredWineType =
    uniqueWineTypes.length === 1 ? toListScanWineType(uniqueWineTypes[0]) : null;
  const wineType =
    wine.wine_type !== "unknown"
      ? wine.wine_type
      : toListScanWineType(inferred?.wineType ?? null) ?? inferredWineType ?? wine.wine_type;

  return {
    ...wine,
    regions,
    varietals,
    wine_type: wineType,
    rationale: buildListScanRationale({
      wine_type: wineType,
      varietals,
      regions,
      price_display: wine.price_display,
    }),
  } satisfies ListScanParsedWine;
}

function applyStubMatchPercents(wines: ListScanParsedWine[]) {
  return wines.map((wine) => ({
    ...wine,
    match_percent: createStableMatchPercent(
      `${wine.menu_label}|${wine.price_display ?? ""}|${wine.source_order}`
    ),
  }));
}

async function loadUserPreferenceEntries(
  supabase: SupabaseClient,
  userId: string
): Promise<PreferenceSourceEntry[]> {
  const selectAttempts = [
    {
      fields:
        "id, rating, advanced_notes, wine_type, canonical_region, canonical_sub_region, canonical_country, region, appellation, country",
      missingColumns: [
        "wine_type",
        "canonical_region",
        "canonical_sub_region",
        "canonical_country",
      ] as const,
    },
    {
      fields: "id, rating, advanced_notes, region, appellation, country",
      missingColumns: [] as const,
    },
  ] as const;

  const result = await executeSelectWithFallback({
    attempts: selectAttempts,
    getFallbackColumns: (attempt) => attempt.missingColumns,
    attempt: async (attempt) => {
      const response = await supabase
        .from("wine_entries")
        .select(attempt.fields)
        .eq("user_id", userId)
        .not("rating", "is", null);

      return {
        data: response.data,
        error: response.error,
      };
    },
  });

  if (result.error) {
    throw result.error;
  }

  const rows = (((result.data ?? []) as unknown) as PreferenceEntryRow[]);
  const grapeMap = await fetchPrimaryGrapesByEntryId(
    supabase as unknown as Parameters<typeof fetchPrimaryGrapesByEntryId>[0],
    rows.map((row) => row.id)
  );

  return rows.map((row) => ({
    rating: row.rating ?? null,
    advanced_notes: normalizeAdvancedNotes(row.advanced_notes),
    wine_type: isWineType(row.wine_type) ? row.wine_type : null,
    canonical_region: row.canonical_region ?? row.region ?? null,
    canonical_sub_region: row.canonical_sub_region ?? row.appellation ?? null,
    canonical_country: row.canonical_country ?? row.country ?? null,
    region: row.region ?? null,
    appellation: row.appellation ?? null,
    country: row.country ?? null,
    primary_grapes:
      grapeMap.get(row.id)?.map((grape) => grape.name).join(", ") ?? null,
  }));
}

function buildStubScoreSummary(
  basedOnEntryCount: number,
  warning: string
): ListScanResult["score_summary"] {
  return {
    mode: LIST_SCAN_SCORE_MODES[1],
    based_on_entry_count: basedOnEntryCount,
    warning,
  };
}

function buildPersonalizedScoreSummary(
  basedOnEntryCount: number
): ListScanResult["score_summary"] {
  return {
    mode: LIST_SCAN_SCORE_MODES[0],
    based_on_entry_count: basedOnEntryCount,
    warning: null,
  };
}

function memoizePromiseByKey<Key, Value>(load: (key: Key) => Promise<Value>) {
  const cache = new Map<Key, Promise<Value>>();

  return (key: Key) => {
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }

    const next = load(key);
    cache.set(key, next);
    return next;
  };
}

function memoizeSharedPromise<Value>(load: () => Promise<Value>) {
  let cached: Promise<Value> | null = null;

  return () => {
    if (!cached) {
      cached = load();
    }
    return cached;
  };
}

function createMemoizedProfileAssemblyDataSource(
  supabase: SupabaseClient
): ProfileAssemblyDataSource {
  const dataSource = createSupabaseProfileAssemblyDataSource(supabase);

  return {
    listBaseProfiles: memoizePromiseByKey((wineType: WineType) =>
      dataSource.listBaseProfiles(wineType)
    ),
    listAgingCurves: memoizePromiseByKey((wineType: WineType) =>
      dataSource.listAgingCurves(wineType)
    ),
    listVintageWeatherModifiers: memoizePromiseByKey((vintage: number) =>
      dataSource.listVintageWeatherModifiers(vintage)
    ),
    listGrapeSensitivityCoefficients: memoizeSharedPromise(() =>
      dataSource.listGrapeSensitivityCoefficients()
    ),
    listClassificationTaxonomy: memoizeSharedPromise(() =>
      dataSource.listClassificationTaxonomy()
    ),
    listClassificationTierModifiers: memoizeSharedPromise(() =>
      dataSource.listClassificationTierModifiers()
    ),
    listProducerModifiers: memoizeSharedPromise(() => dataSource.listProducerModifiers()),
    listProducerRegionCrosswalk: memoizeSharedPromise(() =>
      dataSource.listProducerRegionCrosswalk()
    ),
  };
}

async function enrichParsedWines(params: {
  wines: ListScanParsedWine[];
  userId?: string | null;
  userSupabase?: SupabaseClient | null;
  preloadedInferenceMap?: Awaited<ReturnType<typeof loadInferenceMap>> | null;
  preloadedPreferenceEntries?: PreferenceSourceEntry[] | null;
}): Promise<EnrichedListScanWines> {
  const warnings: string[] = [];
  let inferenceMap: Awaited<ReturnType<typeof loadInferenceMap>> | null =
    params.preloadedInferenceMap ?? null;

  if (!inferenceMap) {
    try {
      inferenceMap = await loadInferenceMap();
    } catch {
      warnings.push(
        "Database inference was unavailable, so some varietal and region guesses fell back to built-in patterns."
      );
    }
  }

  const inferredWines =
    inferenceMap !== null
      ? params.wines.map((wine) => applyInferenceToWine(wine, inferenceMap!))
      : params.wines;
  const stubbedWines = applyStubMatchPercents(inferredWines);

  if (!params.userId || !params.userSupabase) {
    return {
      wines: stubbedWines,
      scoreSummary: buildStubScoreSummary(
        0,
        "Sign in to save scans and unlock personalized match scores."
      ),
      warnings,
    };
  }

  let preferenceEntries: PreferenceSourceEntry[];
  if (params.preloadedPreferenceEntries) {
    preferenceEntries = params.preloadedPreferenceEntries;
  } else {
    try {
      preferenceEntries = await loadUserPreferenceEntries(
        params.userSupabase,
        params.userId
      );
    } catch {
      warnings.push(
        "Preference data could not be loaded, so match percentages are using placeholder values."
      );
      return {
        wines: stubbedWines,
        scoreSummary: buildStubScoreSummary(
          0,
          "Personalized scores were temporarily unavailable for this scan."
        ),
        warnings,
      };
    }
  }

  const qualifyingEntryCount = preferenceEntries.filter((entry) => entry.advanced_notes).length;
  if (qualifyingEntryCount < 5) {
    return {
      wines: stubbedWines,
      scoreSummary: buildStubScoreSummary(
        qualifyingEntryCount,
        "Personalized scores unlock after 5+ rated entries with tasting notes."
      ),
      warnings,
    };
  }

  // TEAM ALPHA: Batch Prefetch Strategy
  // Collect all unique wine types and vintages upfront
  const uniqueWineTypes: WineType[] = [];
  const uniqueVintages: number[] = [];
  const wineTypeMap = new Map<ListScanWineType, WineType>();

  for (const wine of inferredWines) {
    const wineType = toAlgorithmWineType(wine.wine_type);
    if (wineType && !wineTypeMap.has(wine.wine_type)) {
      wineTypeMap.set(wine.wine_type, wineType);
      uniqueWineTypes.push(wineType);
    }
    if (wine.vintage) {
      const vintage = Number.parseInt(wine.vintage, 10);
      if (!Number.isNaN(vintage) && !uniqueVintages.includes(vintage)) {
        uniqueVintages.push(vintage);
      }
    }
  }

  const prefetchStartTime = Date.now();

  // Prefetch all reference data in a SINGLE batch
  const referenceSupabase = createSupabaseAdminClient();
  const memoizedDataSource = createMemoizedProfileAssemblyDataSource(referenceSupabase);
  const prefetchedData = await batchPrefetchProfileData(
    memoizedDataSource,
    uniqueWineTypes,
    uniqueVintages
  );
  const prefetchedDataSource = createPreFetchedProfileDataSource(prefetchedData);

  const prefetchMs = Date.now() - prefetchStartTime;
  console.log(`[Team Alpha] Prefetch completed in ${prefetchMs}ms for ${uniqueWineTypes.length} wine types and ${uniqueVintages.length} vintages`);

  const preferenceVectors = new Map<WineType, ReturnType<typeof buildUserPreferenceVector>>();
  const profileCache = new Map<
    string,
    Promise<Awaited<ReturnType<typeof assembleWineProfileWithDataSource>>>
  >();
  let scoredWineCount = 0;

  const scoringStartTime = Date.now();

  const wines = await Promise.all(
    inferredWines.map(async (wine) => {
      const wineType = toAlgorithmWineType(wine.wine_type);
      if (!wineType) {
        return wine;
      }

      const inferredLocation =
        inferenceMap !== null ? resolveInferenceForWine(wine, inferenceMap) : null;
      const primaryGrapes =
        wine.varietals.length > 0
          ? wine.varietals.join(", ")
          : inferredLocation?.grapes.join(", ") ?? null;

      try {
        const profileInput = {
          wine_type: wineType,
          canonical_region: inferredLocation?.canonicalRegion ?? wine.regions[0] ?? null,
          canonical_sub_region:
            inferredLocation?.canonicalSubRegion ??
            (wine.regions.length > 1 ? wine.regions[wine.regions.length - 1] : null),
          canonical_country: inferredLocation?.canonicalCountry ?? null,
          primary_grapes: primaryGrapes,
          vintage: wine.vintage ? Number.parseInt(wine.vintage, 10) || null : null,
          producer: wine.producer,
          classification: null,
          quality_tier: null,
        } as const;
        const profileKey = JSON.stringify(profileInput);
        const profilePromise =
          profileCache.get(profileKey) ??
          assembleWineProfileWithDataSource(profileInput, prefetchedDataSource);
        profileCache.set(profileKey, profilePromise);
        const profile = await profilePromise;
        const preferenceVector =
          preferenceVectors.get(wineType) ??
          buildUserPreferenceVector(preferenceEntries, wineType);
        preferenceVectors.set(wineType, preferenceVector);
        const match = computeMatchScore(profile, preferenceVector);
        scoredWineCount += 1;

        return {
          ...wine,
          match_percent: Math.min(100, Math.round(match.score)),
        } satisfies ListScanParsedWine;
      } catch {
        return wine;
      }
    })
  );

  const scoringMs = Date.now() - scoringStartTime;
  console.log(`[Team Alpha] Scoring completed in ${scoringMs}ms for ${scoredWineCount} wines`);

  if (scoredWineCount === 0) {
    warnings.push(
      "Profile assembly was unavailable for this scan, so match percentages are using placeholder values."
    );
    return {
      wines: stubbedWines,
      scoreSummary: buildStubScoreSummary(
        qualifyingEntryCount,
        "Personalized scores were temporarily unavailable for this scan."
      ),
      warnings,
    };
  }

  if (scoredWineCount < wines.length) {
    warnings.push(
      "Some wines could not be fully profiled, so a few match percentages may be unavailable."
    );
  }

  return {
    wines,
    scoreSummary: buildPersonalizedScoreSummary(qualifyingEntryCount),
    warnings,
  };
}

function baseInstructions(sourceHint: string) {
  return (
    "You extract structured restaurant wine-list data. Return only strict JSON. " +
    "Preserve menu wording closely in menu_label, keep price_display as shown on the list, and set price_value to the primary numeric price when possible. " +
    "When a wine has both by-the-glass and by-the-bottle pricing, keep both prices in price_display in source order, formatted like $22/$110, and do not leave either price in menu_label. " +
    "Treat each wine entry block as exactly one wine object. A single wine may span multiple stacked rows, but blank space before the next item is a strong boundary between wines. Only merge lines when they clearly belong to the same entry, and never combine adjacent wines or borrow details from a neighboring row. " +
    "Use section headers and visual layout to infer wine_type whenever possible; for example, wines listed under a Red section should be red even if the grape is omitted. " +
    "wine_type must be one of sparkling, white, rose, orange, red, dessert_fortified, or unknown. " +
    "varietals must contain canonical grape or blend names only when there is enough evidence. " +
    "regions must include any place-based identifiers found or strongly implied by the wine listing, from broad to specific, such as country, region, AVA, village, appellation, or area. " +
    "Exclude anything that is not a wine listing. Never return food, beer, cocktails, coffee, tea, water, juice, soda, or other non-wine beverages. " +
    "Do not invent vintages, producers, varietals, or regions. Use null or [] when unclear. " +
    `The source is ${sourceHint}.`
  );
}

async function createStructuredResponse(params: {
  sourceHint: string;
  userId: string;
  reasoningEffort?: StructuredResponseReasoningEffort;
  input:
    | string
    | Array<{
        role: "user";
        content: Array<
          | { type: "input_text"; text: string }
          | { type: "input_image"; image_url: string; detail: "high" | "low" | "auto" }
          | { type: "input_file"; filename?: string; file_data?: string }
        >;
      }>;
}) {
  const openai = getOpenAiClient();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await openai.responses.create(
      {
        model: "gpt-5-mini",
        reasoning: { effort: params.reasoningEffort ?? "minimal" },
        max_output_tokens: 16000,
        text: {
          format: {
            type: "json_schema",
            name: "wine_list_scan",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                venue_name: { type: ["string", "null"] },
                list_title: { type: ["string", "null"] },
                overall_confidence: { type: ["number", "null"] },
                warnings: {
                  type: "array",
                  items: { type: "string" },
                },
                wines: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      menu_label: { type: "string" },
                      producer: { type: ["string", "null"] },
                      wine_name: { type: ["string", "null"] },
                      vintage: { type: ["string", "null"] },
                      wine_type: {
                        type: ["string", "null"],
                        enum: [
                          "sparkling",
                          "white",
                          "rose",
                          "orange",
                          "red",
                          "dessert_fortified",
                          "unknown",
                          null,
                        ],
                      },
                      price_display: { type: ["string", "null"] },
                      price_value: { type: ["number", "null"] },
                      varietals: {
                        type: "array",
                        items: { type: "string" },
                      },
                      regions: {
                        type: "array",
                        items: { type: "string" },
                      },
                      confidence: { type: ["number", "null"] },
                    },
                    required: [
                      "menu_label",
                      "producer",
                      "wine_name",
                      "vintage",
                      "wine_type",
                      "price_display",
                      "price_value",
                      "varietals",
                      "regions",
                      "confidence",
                    ],
                  },
                },
              },
              required: [
                "venue_name",
                "list_title",
                "overall_confidence",
                "warnings",
                "wines",
              ],
            },
          },
        },
        input:
          typeof params.input === "string"
            ? [
                {
                  role: "user",
                  content: [
                    {
                      type: "input_text",
                      text: `${baseInstructions(params.sourceHint)}\n\n${params.input}`,
                    },
                  ],
                },
              ]
            : params.input,
        safety_identifier: params.userId,
      },
      { signal: controller.signal }
    );

    const outputText =
      "output_text" in response && typeof response.output_text === "string"
        ? response.output_text
        : "";
    if (!outputText.trim()) {
      throw new Error("No data returned from list scan");
    }

    const extracted = extractJson(outputText);
    const parsed = responseSchema.safeParse(extracted.value);
    if (!parsed.success) {
      throw new Error("Unable to parse structured list scan data");
    }
    if (!extracted.recovered) {
      return parsed.data;
    }

    return {
      ...parsed.data,
      warnings: mergeParsedWarnings(parsed.data.warnings, [
        "This scan recovered from an incomplete model response, so some wines may be missing. Review the list carefully.",
      ]),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function parseUploadedSourceFromVisualBlocks(params: {
  sourceHint: string;
  sourceLabel: string;
  continuityInstruction: string;
  userId: string;
  content: Array<
    | { type: "input_image"; image_url: string; detail: "high" | "low" | "auto" }
    | { type: "input_file"; filename?: string; file_data?: string }
  >;
}) {
  // Single-call path: send images/files directly to the structured response
  // model which extracts all wine data in one pass, eliminating the previous
  // two-call pipeline (block transcription → structured parse).
  return createStructuredResponse({
    sourceHint: params.sourceHint,
    userId: params.userId,
    reasoningEffort: "low",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildInitialUploadPrompt({
              sourceHint: params.sourceHint,
              sourceLabel: params.sourceLabel,
              continuityInstruction: params.continuityInstruction,
            }),
          },
          ...params.content,
        ],
      },
    ],
  });
}

// ─── Google Cloud Vision OCR ────────────────────────────────────────────────
// Extracts text from one or more image files using the Google Cloud Vision API.
// Returns the concatenated text from all images in order.
// Requires GOOGLE_CLOUD_VISION_API_KEY env var.
// ────────────────────────────────────────────────────────────────────────────

async function extractTextFromImagesViaCloudVision(
  files: File[]
): Promise<string> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GOOGLE_CLOUD_VISION_API_KEY not configured.");
  }

  const results: string[] = [];

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64Content = buffer.toString("base64");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: [
              {
                image: { content: base64Content },
                features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
              },
            ],
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        throw new Error(`Vision API returned ${response.status}`);
      }

      const data = (await response.json()) as {
        responses?: Array<{
          fullTextAnnotation?: { text?: string };
          error?: { message?: string };
        }>;
      };

      const annotation = data.responses?.[0];
      if (annotation?.error) {
        throw new Error(
          annotation.error.message ?? "Vision API returned an error."
        );
      }

      const text = annotation?.fullTextAnnotation?.text?.trim();
      if (text) {
        results.push(text);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  return results.join("\n\n");
}

async function parseImageSource({
  files,
  sourceLabel,
  userId,
}: {
  files: File[];
  sourceLabel: string | null;
  userId: string;
}) {
  if (files.length === 0) {
    throw new Error("Upload at least one list image.");
  }
  if (files.length > MAX_IMAGE_COUNT) {
    throw new Error(`Upload up to ${MAX_IMAGE_COUNT} list images at a time.`);
  }

  // Validate all files are images and within size limits.
  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      throw new Error("List image must be an image file.");
    }
    if (file.size > MAX_IMAGE_INPUT_BYTES) {
      throw new Error("List image is too large.");
    }
  }

  const title = normalizeText(sourceLabel) ?? files[0]?.name ?? "wine-list-image";

  // Diagnostic breadcrumbs — surfaced in _timing so we can debug Vercel.
  const _imageDiag: Record<string, unknown> = {
    fileCount: files.length,
    fileSizes: files.map((f) => f.size),
    fileTypes: files.map((f) => f.type),
  };

  // ──────────────────────────────────────────────────────────────────────
  // FALLBACK 1: Cloud Vision OCR → heuristic regex parse.
  // Used when Gemini Flash is not configured or fails.
  // ──────────────────────────────────────────────────────────────────────
  try {
    const tOcr0 = Date.now();
    const ocrText = await extractTextFromImagesViaCloudVision(files);
    _imageDiag.cloudVisionMs = Date.now() - tOcr0;
    _imageDiag.ocrTextLength = ocrText.length;
    _imageDiag.ocrTextPreview = ocrText.substring(0, 300);
    console.log(`[ListScan Image] Cloud Vision OCR: ${_imageDiag.cloudVisionMs}ms, ${ocrText.length} chars`);
    if (ocrText.trim()) {
      const tHeuristic0 = Date.now();
      const wineSectionText =
        extractStrictWineSectionText(ocrText) || ocrText;
      _imageDiag.sectionTextLength = wineSectionText.length;
      _imageDiag.usedSectionExtraction = wineSectionText !== ocrText;
      const heuristic = buildHeuristicParsedResponse({
        text: wineSectionText,
        title,
        fallbackWarning: "",
      });
      _imageDiag.heuristicMs = Date.now() - tHeuristic0;
      _imageDiag.heuristicWineCount = heuristic.wines.length;
      console.log(`[ListScan Image] Heuristic parse: ${_imageDiag.heuristicMs}ms, ${heuristic.wines.length} wines from section text`);
      if (heuristic.wines.length > 0) {
        _imageDiag.path = "cloud_vision_heuristic";
        (heuristic as Record<string, unknown>)._imageDiag = _imageDiag;
        return heuristic;
      }

      // If section extraction missed, try from full OCR text.
      const fullHeuristic = buildHeuristicParsedResponse({
        text: ocrText,
        title,
        fallbackWarning: "",
      });
      _imageDiag.fullHeuristicWineCount = fullHeuristic.wines.length;
      console.log(`[ListScan Image] Full text heuristic: ${fullHeuristic.wines.length} wines`);
      if (fullHeuristic.wines.length > 0) {
        _imageDiag.path = "cloud_vision_full_text_heuristic";
        (fullHeuristic as Record<string, unknown>)._imageDiag = _imageDiag;
        return fullHeuristic;
      }
      _imageDiag.fallbackReason = "heuristic_found_0_wines";
    } else {
      _imageDiag.fallbackReason = "ocr_returned_empty";
    }
  } catch (ocrError) {
    _imageDiag.fallbackReason = "cloud_vision_error";
    _imageDiag.errorMessage = ocrError instanceof Error ? ocrError.message : String(ocrError);
    console.log(`[ListScan Image] Cloud Vision failed: ${_imageDiag.errorMessage}, falling back to OpenAI`);
  }

  // ──────────────────────────────────────────────────────────────────────
  // OpenAI Vision fallback (kept as backup for when Cloud Vision is
  // unavailable or OCR quality is insufficient, e.g. handwritten lists)
  // ──────────────────────────────────────────────────────────────────────
  _imageDiag.path = "openai_vision_fallback";
  console.log(`[ListScan Image] ⚠️ Falling back to OpenAI Vision: ${JSON.stringify(_imageDiag)}`);
  const tOpenAi0 = Date.now();
  const preparedImages: string[] = [];
  for (const file of files) {
    try {
      const prepared = await prepareOpenAiImageDataUrl(file, {
        maxInputBytes: MAX_IMAGE_INPUT_BYTES,
        maxOutputBytes: MAX_IMAGE_PROCESSED_BYTES,
        maxDimension: 2200,
        jpegQuality: 86,
      });
      preparedImages.push(prepared.dataUrl);
    } catch (error) {
      if (
        error instanceof OpenAiImagePreparationError &&
        error.code === "output_too_large"
      ) {
        throw new Error("List image is too large.");
      }
      if (
        error instanceof OpenAiImagePreparationError &&
        error.code === "unsupported_format"
      ) {
        throw new Error(
          "That photo format could not be processed. Try a JPG, PNG, or WebP image."
        );
      }
      throw error;
    }
  }

  const sourceHint =
    files.length > 1
      ? `${files.length} photos of the same restaurant or retail wine list`
      : "a photo of a restaurant or retail wine list";
  const resolvedSourceLabel = sourceLabel ?? files[0]?.name ?? "wine-list-image";
  const continuityInstruction =
    files.length > 1
      ? "If multiple images are provided, treat them as consecutive pages of the same list and merge them into one response without duplicating wines."
      : "Treat the photo as a wine list page and preserve the visible row order.";

  const openAiResult = await parseUploadedSourceFromVisualBlocks({
    sourceHint,
    sourceLabel: resolvedSourceLabel,
    continuityInstruction,
    userId,
    content: preparedImages.map((image_url) => ({
      type: "input_image" as const,
      image_url,
      detail: "high" as const,
    })),
  });
  _imageDiag.openAiMs = Date.now() - tOpenAi0;
  _imageDiag.openAiWineCount = openAiResult.wines.length;
  console.log(`[ListScan Image] OpenAI Vision completed: ${_imageDiag.openAiMs}ms, ${openAiResult.wines.length} wines`);
  (openAiResult as Record<string, unknown>)._imageDiag = _imageDiag;
  return openAiResult;
}

async function extractTextFromPdfFile(file: File) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: Buffer.from(await file.arrayBuffer()) });
  try {
    const result = await parser.getText();
    return result.text.trim();
  } finally {
    await parser.destroy();
  }
}

/**
 * Normalize text extracted from a PDF before feeding into section extraction
 * and heuristic parsing. Handles PDF-specific patterns that differ from
 * HTML/OCR text: page markers, spaced-out headings, etc.
 */
function normalizePdfExtractedText(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];

  for (const rawLine of lines) {
    // Remove page markers like "-- 32 of 43 --"
    if (/^--\s*\d+\s+of\s+\d+\s*--$/.test(rawLine.trim())) {
      continue;
    }

    // Collapse spaced-out characters: "C A B E R N E T" → "CABERNET"
    // Detect lines where most word-tokens are single uppercase letters
    // separated by spaces (e.g. "C A B E R N E T & B O R D E A U X")
    let line = rawLine;
    const spacedMatch = line.match(
      /(?:^|[\t])([A-Z] (?:[A-Z] )*[A-Z](?:\s*[&/\-,]\s*[A-Z] (?:[A-Z] )*[A-Z])*)/
    );
    if (spacedMatch) {
      const collapsed = spacedMatch[1]!.replace(
        /([A-Z]) (?=[A-Z](?:\s|$|[&/\-,]))/g,
        "$1"
      );
      line = line.replace(spacedMatch[1]!, collapsed);
    }

    result.push(line);
  }

  const normalized = result.join("\n");
  console.log(
    `[ListScan PDF] normalizePdfExtractedText: ${text.length} → ${normalized.length} chars, ${text.split("\n").length - result.length} lines removed`
  );
  return normalized;
}

async function parsePdfTextSource({
  file,
  sourceLabel,
}: {
  file: File;
  sourceLabel: string | null;
  userId: string;
}) {
  const tExtract0 = Date.now();
  const rawExtractedText = await extractTextFromPdfFile(file);
  const extractMs = Date.now() - tExtract0;
  console.log(
    `[ListScan PDF] Text extraction: ${extractMs}ms, ${rawExtractedText.length} chars`
  );
  console.log(
    `[ListScan PDF] Text preview: ${rawExtractedText.substring(0, 500)}`
  );

  // Normalize PDF-specific patterns (page markers, spaced-out headings)
  // BEFORE section extraction so heading detection works correctly.
  const extractedText = normalizePdfExtractedText(rawExtractedText);

  // PDF text path feeds ONLY into the heuristic regex parser (no API call),
  // so we pass Infinity to avoid the truncation limits designed for OpenAI input.
  const focusedText =
    extractStrictWineSectionText(extractedText, Infinity) || extractedText;
  const title = normalizeText(sourceLabel) ?? normalizeText(file.name);

  // Fast path: parse directly from extracted PDF text — no API call needed.
  const tHeuristic0 = Date.now();
  const heuristic = buildHeuristicParsedResponse({
    text: focusedText,
    title,
    fallbackWarning: "",
  });
  const heuristicMs = Date.now() - tHeuristic0;
  console.log(
    `[ListScan PDF] Heuristic parse (section text): ${heuristicMs}ms, ${heuristic.wines.length} wines from ${focusedText.length} chars`
  );

  if (heuristic.wines.length > 0) {
    // Attach PDF diagnostics to the result
    (heuristic as Record<string, unknown>)._pdfDiag = {
      extractMs,
      textLength: extractedText.length,
      focusedTextLength: focusedText.length,
      heuristicMs,
      wineCount: heuristic.wines.length,
      path: "pdf_text_heuristic",
    };
    return heuristic;
  }

  // Try compacted text if section-aware parse found nothing.
  // Pass Infinity for PDF — no API token limit to respect.
  const compactedText = compactWineSectionTextForModel(focusedText, Infinity);
  if (compactedText.trim()) {
    const compactedHeuristic = buildHeuristicParsedResponse({
      text: compactedText,
      title,
      fallbackWarning: "",
    });
    console.log(
      `[ListScan PDF] Compacted heuristic: ${compactedHeuristic.wines.length} wines`
    );
    if (compactedHeuristic.wines.length > 0) {
      (compactedHeuristic as Record<string, unknown>)._pdfDiag = {
        extractMs,
        textLength: extractedText.length,
        compactedTextLength: compactedText.length,
        wineCount: compactedHeuristic.wines.length,
        path: "pdf_text_compacted_heuristic",
      };
      return compactedHeuristic;
    }
  }

  // Try full raw text as last resort before giving up on text path.
  if (focusedText !== extractedText) {
    const fullHeuristic = buildHeuristicParsedResponse({
      text: extractedText,
      title,
      fallbackWarning: "",
    });
    console.log(
      `[ListScan PDF] Full text heuristic: ${fullHeuristic.wines.length} wines`
    );
    if (fullHeuristic.wines.length > 0) {
      (fullHeuristic as Record<string, unknown>)._pdfDiag = {
        extractMs,
        textLength: extractedText.length,
        wineCount: fullHeuristic.wines.length,
        path: "pdf_text_full_heuristic",
      };
      return fullHeuristic;
    }
  }

  console.log(
    `[ListScan PDF] ⚠️ Text path found 0 wines — will fall through to OpenAI visual`
  );
  throw new Error("That PDF did not contain readable wine-list text.");

  // ──────────────────────────────────────────────────────────────────────
  // OpenAI fallback (disabled — kept for reference / future re-enablement)
  // ──────────────────────────────────────────────────────────────────────
  // try {
  //   return await createStructuredResponse({
  //     sourceHint: "text extracted from a PDF wine list",
  //     userId,
  //     input:
  //       `PDF label: ${title ?? "Unknown"}\n\n` +
  //       "Extract every wine entry from this wine-list text. " +
  //       "Each wine listing in the PDF must become exactly one wine object. " +
  //       "Never merge adjacent wines into one object, even if they share a producer, region, or section. " +
  //       "Preserve the original order from the PDF. " +
  //       "Ignore section headers, page furniture, navigation, and non-wine beverages.\n\n" +
  //       compactedText,
  //   });
  // } catch (error) {
  //   // ... OpenAI error handling was here
  // }
}

async function parsePdfSource({
  file,
  sourceLabel,
  userId,
}: {
  file: File;
  sourceLabel: string | null;
  userId: string;
}) {
  if (file.size > MAX_FILE_INPUT_BYTES) {
    throw new Error("PDF is too large.");
  }

  try {
    const tText0 = Date.now();
    const result = await parsePdfTextSource({
      file,
      sourceLabel,
      userId,
    });
    console.log(
      `[ListScan PDF] ✅ Text path succeeded in ${Date.now() - tText0}ms`
    );
    return result;
  } catch (textError) {
    console.log(
      `[ListScan PDF] ⚠️ Text path failed: ${textError instanceof Error ? textError.message : String(textError)}, falling back to OpenAI visual`
    );
  }

  console.log(`[ListScan PDF] 🐌 Using slow OpenAI visual fallback...`);
  const buffer = Buffer.from(await file.arrayBuffer());
  const sourceHint = "a PDF wine list";
  const resolvedSourceLabel = sourceLabel ?? file.name;
  const continuityInstruction =
    "If the PDF spans multiple pages, preserve the global list order and do not drop continuation rows.";

  return parseUploadedSourceFromVisualBlocks({
    sourceHint,
    sourceLabel: resolvedSourceLabel,
    continuityInstruction:
      `${continuityInstruction} Treat the document as a wine list, not a tasting note.`,
    userId,
    content: [
      {
        type: "input_file",
        filename: file.name || "wine-list.pdf",
        file_data: `data:application/pdf;base64,${buffer.toString("base64")}`,
      },
    ],
  });
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sliceHtmlAroundHash(html: string, hash: string) {
  const normalizedHash = decodeURIComponent(hash.replace(/^#/, "")).trim().toLowerCase();
  if (!normalizedHash) {
    return html;
  }

  const pattern = new RegExp(
    `(?:id|name)=(["'])${escapeRegExp(normalizedHash)}\\1`,
    "i"
  );
  const match = pattern.exec(html);
  if (!match) {
    return html;
  }

  const start = Math.max(0, match.index - 1_000);
  const end = Math.min(html.length, match.index + 180_000);
  return html.slice(start, end);
}

function stripHtmlToText(html: string) {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const titleMatch = withoutScripts.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1]).trim() : null;
  // Convert heading tags to markdown-style markers BEFORE stripping all tags.
  // This preserves section structure (e.g. <h2>Sparkling</h2> → ## Sparkling)
  // so downstream extractStrictWineSectionText can detect wine section boundaries.
  const withHeadingMarkers = withoutScripts.replace(
    /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_match, level: string, inner: string) => {
      const hashes = "#".repeat(Number(level));
      const cleaned = inner.replace(/<[^>]+>/g, " ").trim();
      return `\n${hashes} ${cleaned}\n`;
    }
  );

  const text = decodeHtmlEntities(
    withHeadingMarkers
      .replace(/<\/(p|div|li|tr|section|article)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );

  return {
    title,
    text: text.slice(0, MAX_FETCHED_TEXT_CHARS),
  };
}

// Legacy fallback kept temporarily while the stricter extractor bakes in.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function extractLikelyWineSectionText(
  text: string,
  maxChars: number = MAX_FETCHED_TEXT_CHARS
) {
  const lines = text
    .split("\n")
    .map((line) => normalizeText(line))
    .filter((line): line is string => Boolean(line));

  if (lines.length === 0) {
    return "";
  }

  const headingPatterns = [
    /^##\s*wines?\b/i,
    /^##\s*(sparkling|white|red|rose|rosé|orange|skin contact|dessert|fortified|sweet)\b/i,
  ];
  const stopPattern =
    /^##\s*(beer|beers|cocktail|cocktails|soft beverage|soft beverages|spirits?|coffee|tea|desserts?)\b/i;

  let startIndex = lines.findIndex((line) =>
    headingPatterns.some((pattern) => pattern.test(line))
  );
  if (startIndex === -1) {
    startIndex = 0;
  }

  let endIndex = lines.findIndex(
    (line, index) => index > startIndex && stopPattern.test(line)
  );
  if (endIndex === -1) {
    endIndex = lines.length;
  }

  return lines.slice(startIndex, endIndex).join("\n").slice(0, maxChars);
}

function extractStrictWineSectionText(
  text: string,
  maxChars: number = MAX_FETCHED_TEXT_CHARS
) {
  const lines = text
    .split("\n")
    .map((line) => normalizeText(line))
    .filter((line): line is string => Boolean(line));

  if (lines.length === 0) {
    return "";
  }

  let startIndex = lines.findIndex((line) => /^##\s*wines?\b/i.test(line));
  if (startIndex === -1) {
    startIndex = lines.findIndex((line) => WINE_SECTION_HEADING_PATTERN.test(line));
  }
  if (startIndex === -1) {
    startIndex = 0;
  }

  const collected: string[] = [];
  let skippingNonWineSection = false;

  for (const line of lines.slice(startIndex)) {
    if (/^##\s*/.test(line)) {
      if (NON_WINE_SECTION_HEADING_PATTERN.test(line)) {
        skippingNonWineSection = true;
        continue;
      }
      skippingNonWineSection = false;
      collected.push(line);
      continue;
    }

    if (skippingNonWineSection || NON_CONTENT_LINE_PATTERN.test(line)) {
      continue;
    }

    collected.push(line);
  }

  return collected.join("\n").slice(0, maxChars);
}

function cleanListLine(line: string) {
  return line.replace(/^[*•\-]+\s*/, "").replace(/\s+/g, " ").trim();
}

function compactWineSectionTextForModel(
  text: string,
  maxChars: number = MAX_URL_MODEL_INPUT_CHARS
) {
  const lines = text
    .split("\n")
    .map((line) => cleanListLine(line))
    .filter(Boolean);

  if (lines.length === 0) {
    return "";
  }

  const compacted: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || NON_CONTENT_LINE_PATTERN.test(line)) {
      continue;
    }

    if (/^##\s*/.test(line)) {
      if (NON_WINE_SECTION_HEADING_PATTERN.test(line)) {
        continue;
      }
      const normalized = normalizeText(line);
      if (normalized && compacted[compacted.length - 1] !== normalized) {
        compacted.push(normalized);
      }
      continue;
    }

    const looksNonWineOnly =
      ABSOLUTE_NON_WINE_ENTRY_PATTERN.test(line) && !WINE_SIGNAL_PATTERN.test(line);
    if (looksNonWineOnly) {
      continue;
    }

    if (!/[A-Za-z]/.test(line) && !/\$/.test(line)) {
      continue;
    }

    const normalized = normalizeText(line);
    if (normalized && compacted[compacted.length - 1] !== normalized) {
      compacted.push(normalized);
    }
  }

  return compacted.join("\n").slice(0, maxChars);
}

function detectWineTypeFromText(
  value: string,
  currentType: ListScanWineType
): ListScanWineType {
  const normalized = value.toLowerCase();
  if (
    normalized.includes("sparkling") ||
    normalized.includes("champagne") ||
    normalized.includes("pet-nat")
  ) {
    return "sparkling";
  }
  if (
    normalized.includes("dessert") ||
    normalized.includes("fortified") ||
    normalized.includes("port") ||
    normalized.includes("sherry") ||
    normalized.includes("madeira")
  ) {
    return "dessert_fortified";
  }
  if (normalized.includes("red")) {
    return "red";
  }
  if (normalized.includes("rosé") || normalized.includes("rose")) {
    return "rose";
  }
  if (normalized.includes("orange") || normalized.includes("skin contact")) {
    return "orange";
  }
  if (normalized.includes("white")) {
    return "white";
  }
  return currentType;
}

function detectWineTypeFromSignals(
  value: string,
  currentType: ListScanWineType
): ListScanWineType {
  if (SPARKLING_WINE_PATTERN.test(value)) {
    return "sparkling";
  }
  if (DESSERT_FORTIFIED_WINE_PATTERN.test(value)) {
    return "dessert_fortified";
  }
  if (ROSE_WINE_PATTERN.test(value)) {
    return "rose";
  }
  if (ORANGE_WINE_PATTERN.test(value)) {
    return "orange";
  }

  const appellationType = APPELLATION_INFERENCES.find(
    (entry) => entry.wineType && entry.pattern.test(value)
  )?.wineType;
  if (appellationType) {
    return appellationType;
  }

  if (RED_WINE_PATTERN.test(value) && !WHITE_WINE_PATTERN.test(value)) {
    return "red";
  }
  if (ROSE_WINE_PATTERN.test(value)) {
    return "rose";
  }
  if (ORANGE_WINE_PATTERN.test(value)) {
    return "orange";
  }
  if (WHITE_WINE_PATTERN.test(value)) {
    return "white";
  }

  return detectWineTypeFromText(value, currentType);
}

function extractRegionsFromFallbackContext(value: string) {
  const segments = value
    .split(",")
    .map((segment) => normalizeText(segment))
    .filter((segment): segment is string => Boolean(segment))
    .filter((segment) => !/(^| )'?(\d{2}|\d{4})$/.test(segment));

  if (segments.length <= 1) {
    return [] as string[];
  }

  return segments.slice(1).slice(0, 3);
}

function buildHeuristicParsedResponse(params: {
  text: string;
  title: string | null;
  fallbackWarning: string;
}): ParsedResponse {
  const lines = params.text
    .split("\n")
    .map((line) => cleanListLine(line))
    .filter(Boolean);

  const wines: ParsedResponse["wines"] = [];
  let currentType: ListScanWineType = "unknown";
  let inWineSection = false;
  let buffer: string[] = [];
  const pricePatternQuick = /\$\s*\d+/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    // Detect section headings: markdown ## headings (from URL scans) OR
    // plain-text all-caps / title-case short headings (from OCR image scans).
    // OCR text won't have ## prefixes, so we also match lines like
    // "WHITE WINE", "Red Wine", "SPARKLING", "DRAFT BEER", etc.
    const isMarkdownHeading = /^##\s*/.test(line);
    const isAllCapsHeadingLike =
      !isMarkdownHeading &&
      !pricePatternQuick.test(line) &&
      /^[A-Z][A-Z\s&/\-,]+$/.test(line);
    // Standard short heading (< 40 chars) OR longer all-caps line that
    // matches a known wine section pattern — PDF text often produces
    // headings longer than 40 chars after spaced-char normalization.
    const isOcrHeading =
      isAllCapsHeadingLike &&
      (line.length < 40 ||
        WINE_SECTION_HEADING_PATTERN.test(`## ${line}`) ||
        NON_WINE_SECTION_HEADING_PATTERN.test(`## ${line}`));
    const headingText = isMarkdownHeading
      ? line
      : isOcrHeading
        ? `## ${line}`
        : null;

    if (headingText) {
      if (NON_WINE_SECTION_HEADING_PATTERN.test(headingText)) {
        inWineSection = false;
        buffer = [];
        continue;
      }
      if (WINE_SECTION_HEADING_PATTERN.test(headingText) || isMarkdownHeading) {
        inWineSection = true;
        currentType = detectWineTypeFromSignals(headingText, currentType);
        buffer = [];
        continue;
      }
      // Unknown all-caps heading (e.g. "DRAFT BEER" matched above, but
      // "APPETIZERS" didn't match wine heading) — exit wine section.
      if (isOcrHeading) {
        inWineSection = false;
        buffer = [];
        continue;
      }
    }

    // OCR from printed menus often splits wine names and prices onto separate
    // lines and uses bare trailing numbers without $ signs. Also handle
    // price-only lines (just dots + number) and bare small numbers that are
    // likely standalone prices on their own line.
    const priceMatch =
      line.match(
        /\$\s*\d+(?:\.\d{1,2})?(?:\s*(?:\/|[-–])\s*\$?\s*\d+(?:\.\d{1,2})?)+/
      ) ??
      line.match(/\$\s*\d+(?:\.\d{1,2})?/) ??
      (inWineSection
        ? // Tab-separated bare price (common in PDF text):
          // "PRODUCER NAME\t2019\t479" or "SECOND GROWTH\t2008\t759"
          line.match(/\t(\d{2,5})\s*$/) ??
          // Dot-leader + number: ".... 16" or ".......18"
          line.match(/\.{2,}\s*(\d{1,4}(?:\.\d{1,2})?)\s*$/) ??
          // Wine name followed by 2+ spaces then number: "Chardonnay  18"
          line.match(/\s{2,}(\d{1,4}(?:\.\d{1,2})?)\s*$/) ??
          // Wine name then single space then 2-3 digit number: "Pinot Noir 22"
          line.match(/[a-zA-Z)]\s(\d{2,3}(?:\.\d{1,2})?)\s*$/) ??
          // Price-only line: just a number (e.g. "16" or "18") — only when
          // the entire line is a short number and we have something buffered
          (buffer.length > 0 && /^\d{1,3}(?:\.\d{1,2})?$/.test(line)
            ? line.match(/^(\d{1,3}(?:\.\d{1,2})?)$/)
            : null)
        : null);

    // Skip bare numbers that look like vintages, not prices (e.g. 2019, 2023)
    if (!priceMatch) {
      if (
        inWineSection &&
        !/^(by the glass|by the bottle|wine list)$/i.test(line) &&
        !ABSOLUTE_NON_WINE_ENTRY_PATTERN.test(line) &&
        // Don't buffer bare numbers — they're likely stray prices or vintages,
        // not wine names
        !/^\d{1,4}$/.test(line)
      ) {
        // Clean trailing dot-leaders from OCR (e.g. "Frog's Leap Chardonnay, Napa Valley.")
        const cleanedLine = line.replace(/\.{2,}\s*$/, "").replace(/\.\s*$/, "");
        buffer.push(cleanedLine || line);
        buffer = buffer.slice(-2);
      }
      continue;
    }

    const priceDisplay = normalizeCompositePriceDisplay(priceMatch[0]);
    const priceValue = parseFallbackPriceValue(priceDisplay);
    const lineWithoutPrice = normalizeText(
      line.replace(priceMatch[0], "").replace(/\.{2,}\s*$/, "")
    );

    // OCR often puts wine names and prices on separate lines. When the price
    // is on its own line (lineWithoutPrice is empty/just dots), each buffered
    // entry is likely a separate wine. Emit earlier buffer entries as their
    // own wines (with the same price as a reasonable guess), then use only the
    // last buffer entry for this price line.
    if (!lineWithoutPrice && buffer.length > 1) {
      // Each earlier buffer entry is a standalone wine whose price line we
      // missed (OCR merged it or it was on a line we couldn't parse).
      // Emit them with the current price as best guess.
      for (let bi = 0; bi < buffer.length - 1; bi++) {
        const orphanName = buffer[bi];
        if (!orphanName || /^\d{1,4}$/.test(orphanName)) continue;
        const orphanContext = orphanName;
        if (ABSOLUTE_NON_WINE_ENTRY_PATTERN.test(orphanContext)) continue;
        if (!inWineSection && !WINE_SIGNAL_PATTERN.test(orphanContext)) continue;
        const orphanVintageMatch = orphanContext.match(
          /\b((?:19|20)\d{2})\b|'(\d{2})\b|\b(N\.?V\.?)\b/i
        );
        const orphanVintage = orphanVintageMatch
          ? orphanVintageMatch[3]
            ? "NV"
            : orphanVintageMatch[1] ?? `20${orphanVintageMatch[2]}`
          : null;
        wines.push({
          menu_label: orphanName,
          producer: null,
          wine_name: orphanName,
          vintage: orphanVintage,
          wine_type: detectWineTypeFromSignals(orphanContext, currentType),
          price_display: priceDisplay,
          price_value: Number.isFinite(priceValue) ? priceValue : null,
          varietals: [],
          regions: extractRegionsFromFallbackContext(orphanContext),
          confidence: 0.6, // lower confidence — price is a guess
        });
      }
      // Keep only the last buffer entry for this price line
      buffer = [buffer[buffer.length - 1]!];
    }

    const menuParts = [...buffer, lineWithoutPrice].filter(
      (part, index, items) =>
        Boolean(part) &&
        items.findIndex(
          (candidate) => candidate?.toLowerCase() === part?.toLowerCase()
        ) === index
    ) as string[];
    const menuLabel = menuParts.join(" — ") || line;
    const combinedContext = menuParts.join(", ");
    const rowContext = [menuLabel, lineWithoutPrice, ...menuParts]
      .filter(Boolean)
      .join(" | ");

    if (ABSOLUTE_NON_WINE_ENTRY_PATTERN.test(rowContext)) {
      buffer = [];
      continue;
    }
    if (!inWineSection && !WINE_SIGNAL_PATTERN.test(rowContext)) {
      buffer = [];
      continue;
    }

    // Extract vintage from the combined context (e.g. '23, '21, 2023, N.V.)
    const vintageMatch = rowContext.match(
      /\b((?:19|20)\d{2})\b|'(\d{2})\b|\b(N\.?V\.?)\b/i
    );
    const vintage = vintageMatch
      ? vintageMatch[3]
        ? "NV"
        : vintageMatch[1] ?? `20${vintageMatch[2]}`
      : null;

    wines.push({
      menu_label: menuLabel,
      producer: buffer[0] ?? null,
      wine_name: lineWithoutPrice ?? null,
      vintage,
      wine_type: detectWineTypeFromSignals(combinedContext, currentType),
      price_display: priceDisplay,
      price_value: Number.isFinite(priceValue) ? priceValue : null,
      varietals: [],
      regions: extractRegionsFromFallbackContext(combinedContext),
      confidence: 0.72,
    });

    buffer = [];
  }

  return {
    venue_name: null,
    list_title: params.title,
    overall_confidence: wines.length > 0 ? 0.78 : 0.35,
    warnings: params.fallbackWarning ? [params.fallbackWarning] : [],
    wines,
  };
}

function assertHttpUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Enter a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are supported.");
  }
  return parsed;
}

async function fetchRemoteSource(url: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "CellarSnap/1.0 (+wine-list-scan)",
        Accept:
          "text/html,application/pdf,image/*;q=0.9,text/plain;q=0.8,*/*;q=0.2",
      },
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Unable to fetch that URL right now.");
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function parseUrlSource({ url, userId }: { url: string; userId: string }) {
  const parsedUrl = assertHttpUrl(url);
  const response = await fetchRemoteSource(parsedUrl);
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();

  if (contentType.includes("application/pdf") || parsedUrl.pathname.endsWith(".pdf")) {
    const bytes = await response.arrayBuffer();
    const file = new File([bytes], parsedUrl.pathname.split("/").pop() || "wine-list.pdf", {
      type: "application/pdf",
    });
    return parsePdfSource({
      file,
      sourceLabel: parsedUrl.toString(),
      userId,
    });
  }

  if (contentType.startsWith("image/")) {
    const bytes = await response.arrayBuffer();
    const file = new File([bytes], parsedUrl.pathname.split("/").pop() || "wine-list.jpg", {
      type: contentType || "image/jpeg",
    });
    return parseImageSource({
      files: [file],
      sourceLabel: parsedUrl.toString(),
      userId,
    });
  }

  const rawHtml = await response.text();
  const focusedHtml = sliceHtmlAroundHash(rawHtml, parsedUrl.hash);
  const { title, text } = stripHtmlToText(focusedHtml);
  const wineSectionText = extractStrictWineSectionText(text);
  if (!wineSectionText.trim()) {
    throw new Error("That URL did not contain readable list text.");
  }

  // Fast path: parse directly from extracted text — no API call needed.
  // The heuristic parser handles section headings, prices, vintages, and
  // wine-type detection. Varietals and regions are filled in downstream by
  // normalizeParsedWines + applyInferenceToWine.
  const heuristic = buildHeuristicParsedResponse({
    text: wineSectionText,
    title,
    fallbackWarning: "",
  });

  if (heuristic.wines.length > 0) {
    return heuristic;
  }

  // If the section-aware heuristic found nothing, try from compacted text.
  const compactedWineSectionText = compactWineSectionTextForModel(wineSectionText);
  if (compactedWineSectionText.trim()) {
    const compactedHeuristic = buildHeuristicParsedResponse({
      text: compactedWineSectionText,
      title,
      fallbackWarning: "",
    });
    if (compactedHeuristic.wines.length > 0) {
      return compactedHeuristic;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // OpenAI fallback (disabled — kept for reference / future re-enablement)
  // ──────────────────────────────────────────────────────────────────────
  // try {
  //   return await createStructuredResponse({
  //     sourceHint: "text extracted from a restaurant wine-list webpage",
  //     userId,
  //     input:
  //       `URL: ${parsedUrl.toString()}\n` +
  //       `Page title: ${title ?? "Unknown"}\n\n` +
  //       "Extract every wine entry from this wine-list text. " +
  //       "Each wine listing on the page must become exactly one wine object. " +
  //       "Never merge two adjacent wines into one object, even if they share a section, producer, or region. " +
  //       "Do not borrow a price, vintage, producer, varietal, or region from a neighboring entry. " +
  //       "Preserve the wines in the exact order they appear on the page. " +
  //       "menu_label must reproduce the wine listing text as closely as possible, preserving the original word order including producer, wine name, grape variety, region, and vintage, but do not include prices in menu_label. " +
  //       "Ignore navigation, booking widgets, opening hours, unrelated marketing copy, and any non-wine beverages.\n\n" +
  //       compactedWineSectionText,
  //   });
  // } catch (error) {
  //   // ... OpenAI error handling was here
  // }

  throw new Error("That URL did not contain readable wine-list text.");
}

export async function parseWineListSource(
  params: ParseSourceParams
): Promise<ListScanResult> {
  const t0 = Date.now();
  const timing: Record<string, number> = {};

  // Pre-warm: kick off inference map + user preference loading in parallel
  // with the parse step so they're ready by the time we need them for scoring.
  const inferenceMapPromise = loadInferenceMap().catch(() => null);
  const preferenceEntriesPromise =
    params.userId && params.userSupabase
      ? loadUserPreferenceEntries(params.userSupabase, params.userId).catch(
          () => null
        )
      : Promise.resolve(null);

  const tParse0 = Date.now();
  const parsed =
    params.sourceType === "url"
      ? await parseUrlSource({ url: params.url, userId: params.requesterId })
      : params.sourceType === "pdf"
        ? await parsePdfSource({
            file: params.file,
            sourceLabel: params.sourceLabel,
            userId: params.requesterId,
          })
        : await parseImageSource({
            files: params.files,
            sourceLabel: params.sourceLabel,
            userId: params.requesterId,
          });
  timing.parse_ms = Date.now() - tParse0;

  // Await pre-warmed data (should already be resolved or nearly so).
  const tPreWarm0 = Date.now();
  const [preloadedInferenceMap, preloadedPreferenceEntries] = await Promise.all([
    inferenceMapPromise,
    preferenceEntriesPromise,
  ]);
  timing.prewarm_await_ms = Date.now() - tPreWarm0;

  const tEnrich0 = Date.now();
  const enriched = await enrichParsedWines({
    wines: normalizeParsedWines(parsed),
    userId: params.userId ?? null,
    userSupabase: params.userSupabase ?? null,
    preloadedInferenceMap,
    preloadedPreferenceEntries,
  });
  timing.enrich_ms = Date.now() - tEnrich0;

  const warnings = [...(parsed.warnings ?? []), ...enriched.warnings]
    .map((warning) => normalizeText(warning))
    .filter((warning): warning is string => Boolean(warning));
  const facets = deriveListScanFacets(enriched.wines);

  timing.total_ms = Date.now() - t0;

  // Pull _imageDiag from the parsed response if it was attached by parseImageSource.
  const imageDiag = (parsed as Record<string, unknown>)?._imageDiag ?? null;
  if (imageDiag) {
    timing._imageDiag = imageDiag as number; // smuggle through as any
  }

  console.log(
    `[ListScan Timing] source=${params.sourceType} | parse=${timing.parse_ms}ms | prewarm=${timing.prewarm_await_ms}ms | enrich=${timing.enrich_ms}ms | total=${timing.total_ms}ms | wines=${enriched.wines.length}`
  );

  return {
    scan_id: createListScanId(),
    source_type: params.sourceType,
    source_label:
      params.sourceType === "url"
        ? params.url
        : normalizeText(params.sourceLabel) ??
          normalizeText(params.sourceType === "pdf" ? params.file.name : params.files[0]?.name),
    venue_name: normalizeText(parsed.venue_name),
    list_title: normalizeText(parsed.list_title),
    overall_confidence: toPercent(parsed.overall_confidence, 76),
    warnings,
    score_summary: enriched.scoreSummary,
    facets,
    wines: enriched.wines,
    scanned_at: new Date().toISOString(),
    _timing: timing,
  } as ListScanResult;
}

export const __listScanTestUtils = {
  applyInferenceToWine,
  applyStubMatchPercents,
  detectWineTypeFromSignals,
  extractJson,
  normalizeWineType,
};

export function detectListScanSourceType(params: {
  files: File[];
  url: string | null;
}): ListScanSourceType {
  if (params.url) {
    return "url";
  }
  if (params.files.length === 0) {
    throw new Error("Upload a list image or PDF, or enter a URL.");
  }
  if (params.files.every((file) => file.type.startsWith("image/"))) {
    return "image";
  }
  if (
    params.files.length === 1 &&
    (params.files[0].type === "application/pdf" ||
      params.files[0].name.toLowerCase().endsWith(".pdf"))
  ) {
    return "pdf";
  }
  throw new Error("Upload either one PDF or one or more images.");
}
