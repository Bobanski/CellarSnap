export type EntryLibrarySortBy = "consumed_at" | "rating" | "vintage";
export type EntryLibrarySortOrder = "asc" | "desc";
export type EntryLibraryFilterType = "vintage" | "country" | "rating" | "";
export type EntryLibraryGroupScheme = "region" | "vintage" | "varietal";
export type EntryLibraryViewMode = "grouped" | "all";
export type EntryLibraryControlPanel = "sort" | "filter" | "organize" | null;

export const ENTRY_LIBRARY_GROUP_PREVIEW_COUNT = 4;

export const ENTRIES_LIBRARY_HEADER = {
  eyebrow: "Cellar",
  title: "Your collection.",
} as const;

export const ENTRIES_LIBRARY_STATS_LABELS = {
  totalEntries: "Entries",
  avgRating: "Avg rating",
  countries: "Countries",
} as const;

export const ENTRIES_LIBRARY_CONTROL_BUTTON_LABELS = {
  sort: "Sort",
  filter: "Filter",
  organize: "Organize",
} as const;

export const ENTRIES_LIBRARY_PANEL_LABELS = {
  search: "Search your library",
  sortBy: "Sort by",
  order: "Order",
  filterBy: "Filter by",
  country: "Country",
  libraryView: "Library view",
  groupBy: "Group by",
} as const;

export const ENTRIES_LIBRARY_INPUT_PLACEHOLDERS = {
  search: "Search wine, producer, region...",
  min: "Min",
  max: "Max",
} as const;

export const ENTRIES_LIBRARY_ACTION_LABELS = {
  clearSearch: "Clear",
  allCountries: "All countries",
  loading: "Loading your library...",
  loadMore: "Load more",
  loadingMore: "Loading...",
  seeAll: "See all",
  showLess: "Show less",
} as const;

export const ENTRIES_LIBRARY_FILTER_OPTIONS = [
  { value: "" as const, label: "None" },
  { value: "country" as const, label: "Country" },
  { value: "vintage" as const, label: "Vintage range" },
  { value: "rating" as const, label: "Rating range" },
] as const;

export const ENTRIES_LIBRARY_SORT_OPTIONS = [
  { value: "consumed_at" as const, label: "Date consumed" },
  { value: "rating" as const, label: "Rating" },
  { value: "vintage" as const, label: "Vintage" },
] as const;

export const ENTRIES_LIBRARY_VIEW_OPTIONS = [
  { value: "grouped" as const, label: "Grouped" },
  { value: "all" as const, label: "Full list" },
] as const;

export const ENTRIES_LIBRARY_GROUP_OPTIONS = [
  { value: "region" as const, label: "Region" },
  { value: "vintage" as const, label: "Vintage" },
  { value: "varietal" as const, label: "Varietal" },
] as const;

type EntryLibrarySearchGrapeLike = {
  name: string;
};

type EntryLibraryGroupingEntryLike = {
  consumed_at: string;
  created_at: string;
  id: string;
  wine_name?: string | null;
  producer?: string | null;
  vintage?: string | null;
  country?: string | null;
  region?: string | null;
  appellation?: string | null;
  classification?: string | null;
  notes?: string | null;
  ai_notes_summary?: string | null;
  location_text?: string | null;
  rating?: number | null;
  qpr_level?: string | null;
  primary_grapes?: readonly EntryLibrarySearchGrapeLike[] | EntryLibrarySearchGrapeLike[] | null;
};

type EntryLibraryStatsLike = {
  country?: string | null;
  rating?: number | null;
};

function normalizeEntryLabel(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function includesSearchValue(
  value: string | number | null | undefined,
  query: string
): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  return String(value).toLowerCase().includes(query);
}

function toWordSet(value: string | null | undefined): Set<string> {
  const normalized = value?.toLowerCase() ?? "";
  const words = normalized.match(/[a-z0-9]+/g) ?? [];
  return new Set(words.filter((word) => word.length >= 2));
}

export function toEntryVintageNumber(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function compareEntryChronology<T extends EntryLibraryGroupingEntryLike>(
  left: T,
  right: T
): number {
  const consumedDateSort = left.consumed_at.localeCompare(right.consumed_at);
  if (consumedDateSort !== 0) {
    return consumedDateSort;
  }

  const createdAtSort = left.created_at.localeCompare(right.created_at);
  if (createdAtSort !== 0) {
    return createdAtSort;
  }

  return left.id.localeCompare(right.id);
}

export function getEntryLibraryGroupLabel<T extends EntryLibraryGroupingEntryLike>(
  entry: T,
  scheme: EntryLibraryGroupScheme
): string {
  if (scheme === "region") {
    const region = entry.region?.trim();
    if (region) {
      return region;
    }

    const appellation = entry.appellation?.trim();
    if (appellation) {
      return appellation;
    }

    const country = entry.country?.trim();
    if (country) {
      return country;
    }

    return "Unknown region";
  }

  if (scheme === "vintage") {
    return normalizeEntryLabel(entry.vintage, "Unknown vintage");
  }

  const primaryVarietal = entry.primary_grapes?.find(
    (grape) => grape.name.trim().length > 0
  )?.name.trim();
  if (primaryVarietal) {
    return primaryVarietal;
  }

  const classification = entry.classification?.trim();
  if (classification) {
    return classification;
  }

  return "Unknown varietal";
}

export function createEntryLibraryGroupId(
  scheme: EntryLibraryGroupScheme,
  label: string
): string {
  return `${scheme}:${label.toLowerCase()}`;
}

export function entryMatchesLibrarySearch<T extends EntryLibraryGroupingEntryLike>(
  entry: T,
  query: string
): boolean {
  if (!query) {
    return true;
  }

  const directFields: Array<string | number | null | undefined> = [
    entry.wine_name,
    entry.producer,
    entry.vintage,
    entry.country,
    entry.region,
    entry.appellation,
    entry.classification,
    entry.notes,
    entry.ai_notes_summary,
    entry.location_text,
    entry.rating,
    entry.qpr_level,
  ];

  if (directFields.some((field) => includesSearchValue(field, query))) {
    return true;
  }

  return Boolean(
    entry.primary_grapes?.some((grape) => includesSearchValue(grape.name, query))
  );
}

export function shouldHideProducerInEntryTile(
  wineName: string | null | undefined,
  producer: string | null | undefined
): boolean {
  const wineWords = toWordSet(wineName);
  const producerWords = toWordSet(producer);

  if (wineWords.size === 0 || producerWords.size === 0) {
    return false;
  }

  let sharedWordCount = 0;
  for (const word of producerWords) {
    if (!wineWords.has(word)) {
      continue;
    }
    sharedWordCount += 1;
    if (sharedWordCount >= 3) {
      return true;
    }
  }

  return false;
}

export function getEntryListDisplayRating(
  rating: number | null | undefined
): string | null {
  if (typeof rating !== "number" || Number.isNaN(rating)) {
    return null;
  }

  return String(rating);
}

export function getEntriesCollectionStats<T extends EntryLibraryStatsLike>(
  entries: readonly T[]
) {
  const ratings = entries
    .map((entry) => entry.rating)
    .filter((rating): rating is number => typeof rating === "number" && !Number.isNaN(rating));

  return {
    totalEntries: entries.length,
    avgRating:
      ratings.length > 0
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        : null,
    uniqueCountries: new Set(
      entries
        .map((entry) => entry.country?.trim())
        .filter((country): country is string => Boolean(country))
    ).size,
  };
}

export function getEntriesCountLabel(count: number): string {
  return `${count} ${count === 1 ? "entry" : "entries"}`;
}

export function getEntriesSortOrderOptions(sortBy: EntryLibrarySortBy) {
  return sortBy === "rating"
    ? [
        { value: "desc" as const, label: "High to low" },
        { value: "asc" as const, label: "Low to high" },
      ]
    : [
        { value: "desc" as const, label: "Newest first" },
        { value: "asc" as const, label: "Oldest first" },
      ];
}

export function getEntriesEmptyStateMessage({
  hasMore = false,
  isFilterActive,
  isRangeFilterActive,
  isSearchActive,
}: {
  hasMore?: boolean;
  isFilterActive: boolean;
  isRangeFilterActive: boolean;
  isSearchActive: boolean;
}) {
  if (isSearchActive) {
    return hasMore
      ? "No entries match this search yet. Try loading more."
      : "No entries match this search.";
  }

  if (isRangeFilterActive) {
    return "There are no wines found in this range.";
  }

  if (isFilterActive) {
    return hasMore
      ? "No entries match this filter yet. Try loading more."
      : "No entries match this filter.";
  }

  return "Your library is empty. Add your first bottle!";
}
