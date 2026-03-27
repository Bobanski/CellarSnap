"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatConsumedDate } from "@/lib/formatDate";
import { shouldHideProducerInEntryTile } from "@/lib/entryDisplay";
import Photo from "@/components/Photo";
import AppShell from "@/components/AppShell";
import type { WineEntryWithUrls } from "@/types/wine";

type SortBy = "consumed_at" | "rating" | "vintage";
type SortOrder = "asc" | "desc";
type FilterType = "vintage" | "country" | "rating" | "";
type GroupScheme = "region" | "vintage" | "varietal";
type LibraryViewMode = "grouped" | "all";
type ControlPanel = "sort" | "filter" | "organize" | null;

type EntryGroup = {
  id: string;
  label: string;
  entries: WineEntryWithUrls[];
};

const GROUP_PREVIEW_COUNT = 4;

function normalizeLabel(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function toVintageNumber(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareEntryChronology(a: WineEntryWithUrls, b: WineEntryWithUrls): number {
  const consumedDateSort = a.consumed_at.localeCompare(b.consumed_at);
  if (consumedDateSort !== 0) {
    return consumedDateSort;
  }

  const createdAtSort = a.created_at.localeCompare(b.created_at);
  if (createdAtSort !== 0) {
    return createdAtSort;
  }

  return a.id.localeCompare(b.id);
}

function getGroupLabel(entry: WineEntryWithUrls, scheme: GroupScheme): string {
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
    return normalizeLabel(entry.vintage, "Unknown vintage");
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

function createGroupId(scheme: GroupScheme, label: string): string {
  return `${scheme}:${label.toLowerCase()}`;
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

function entryMatchesSearch(entry: WineEntryWithUrls, query: string): boolean {
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

/* ─── Compact entry row for the new cellar design ─── */
function EntryRow({ entry }: { entry: WineEntryWithUrls & { comment_count?: number } }) {
  const hideProducer = shouldHideProducerInEntryTile(entry.wine_name, entry.producer);
  const producer = hideProducer ? null : entry.producer;
  const metaParts = [producer, entry.region || entry.country].filter(Boolean);

  return (
    <Link
      href={`/entries/${entry.id}`}
      className="group flex items-center gap-3 px-3.5 py-2.5"
      style={{ borderBottom: "0.5px solid rgba(245, 237, 214, 0.04)" }}
    >
      {/* Thumbnail */}
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden bg-black/40"
        style={{
          width: 64,
          height: 76,
          borderRadius: 8,
          border: "0.5px solid var(--color-border)",
        }}
      >
        {entry.label_image_url ? (
          <Photo
            src={entry.label_image_url}
            alt={entry.wine_name ?? entry.producer ?? "Wine label"}
            containerClassName="h-full w-full"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-4 w-4 text-[var(--color-text-tertiary)]" aria-hidden="true">
            <path d="M12 2C11 2 10 6 10 10c0 2 .5 3 2 3s2-1 2-3c0-4-1-8-2-8z" />
            <path d="M10 13v7a2 2 0 0 0 4 0v-7" />
          </svg>
        )}
      </div>

      {/* Center: name + meta */}
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className="truncate text-[var(--color-text-primary)]"
          style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}
        >
          {entry.wine_name || "Unnamed wine"}
        </span>
        {metaParts.length > 0 ? (
          <span
            className="truncate text-[var(--color-text-secondary)]"
            style={{ fontSize: 13 }}
          >
            {metaParts.join(" \u00B7 ")}
          </span>
        ) : null}
      </div>

      {/* Right: rating + date */}
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {typeof entry.rating === "number" && !Number.isNaN(entry.rating) ? (
          <span
            className="inline-flex items-center justify-center"
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 16,
              background: "rgba(201, 168, 76, 0.12)",
              color: "var(--color-accent-gold)",
              borderRadius: 4,
              padding: "1px 6px",
              lineHeight: 1.4,
            }}
          >
            {entry.rating}
          </span>
        ) : null}
        <span className="text-[var(--color-text-tertiary)]" style={{ fontSize: 12 }}>
          {formatConsumedDate(entry.consumed_at)}
        </span>
      </div>
    </Link>
  );
}

export default function EntriesPage() {
  const [entries, setEntries] = useState<WineEntryWithUrls[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchBarVisible, setSearchBarVisible] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("consumed_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [filterType, setFilterType] = useState<FilterType>("");
  const [filterValue, setFilterValue] = useState<string>("");
  const [filterMin, setFilterMin] = useState<string>("");
  const [filterMax, setFilterMax] = useState<string>("");
  const [libraryViewMode, setLibraryViewMode] =
    useState<LibraryViewMode>("all");
  const [groupScheme, setGroupScheme] = useState<GroupScheme>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("libraryGroupScheme");
      if (saved === "region" || saved === "vintage" || saved === "varietal") return saved;
    }
    return "region";
  });
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [activeControlPanel, setActiveControlPanel] = useState<ControlPanel>(null);

  const isRangeFilterActive =
    (filterType === "rating" || filterType === "vintage") &&
    (filterMin !== "" || filterMax !== "");
  const isFilterActive =
    filterType === "country" ? filterValue !== "" : isRangeFilterActive;
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const isSearchActive = normalizedSearchQuery.length > 0;

  const uniqueValues = useMemo(() => {
    const vintages = new Set<number>();
    const countries = new Set<string>();
    const ratings = new Set<number>();

    entries.forEach((entry) => {
      const vintage = toVintageNumber(entry.vintage);
      if (vintage !== null) {
        vintages.add(vintage);
      }
      if (entry.country) countries.add(entry.country);
      if (entry.rating !== null && entry.rating !== undefined) {
        ratings.add(entry.rating);
      }
    });

    return {
      vintage: Array.from(vintages)
        .sort((a, b) => a - b)
        .map(String),
      country: Array.from(countries).sort(),
      rating: Array.from(ratings)
        .sort((a, b) => a - b)
        .map(String),
    };
  }, [entries]);

  /* ─── Stats computations ─── */
  const stats = useMemo(() => {
    const totalEntries = entries.length;
    const ratingsArray = entries
      .map((e) => e.rating)
      .filter((r): r is number => typeof r === "number" && !Number.isNaN(r));
    const avgRating =
      ratingsArray.length > 0
        ? ratingsArray.reduce((sum, r) => sum + r, 0) / ratingsArray.length
        : null;
    const uniqueCountries = new Set(entries.map((e) => e.country).filter(Boolean)).size;
    return { totalEntries, avgRating, uniqueCountries };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    if (!filterType) return entries;

    if (filterType === "country") {
      if (!filterValue) return entries;
      return entries.filter((entry) => entry.country === filterValue);
    }

    if (filterType === "rating" || filterType === "vintage") {
      if (!filterMin && !filterMax) return entries;
      const min = filterMin ? Number(filterMin) : -Infinity;
      const max = filterMax ? Number(filterMax) : Infinity;
      const rangeMin = Math.min(min, max);
      const rangeMax = Math.max(min, max);

      return entries.filter((entry) => {
        const value =
          filterType === "vintage"
            ? toVintageNumber(entry.vintage)
            : entry.rating ?? null;
        if (value === null || Number.isNaN(value)) return false;
        return value >= rangeMin && value <= rangeMax;
      });
    }

    return entries;
  }, [entries, filterType, filterValue, filterMin, filterMax]);

  const searchedEntries = useMemo(() => {
    if (!isSearchActive) {
      return filteredEntries;
    }

    return filteredEntries.filter((entry) =>
      entryMatchesSearch(entry, normalizedSearchQuery)
    );
  }, [filteredEntries, isSearchActive, normalizedSearchQuery]);

  const sortedEntries = useMemo(() => {
    const copy = [...searchedEntries];
    const mult = sortOrder === "asc" ? 1 : -1;

    if (sortBy === "rating") {
      return copy.sort((a, b) => {
        const aValue = a.rating ?? -Infinity;
        const bValue = b.rating ?? -Infinity;
        const numericSort = aValue - bValue;
        if (numericSort !== 0) {
          return mult * numericSort;
        }
        return mult * compareEntryChronology(a, b);
      });
    }

    if (sortBy === "vintage") {
      return copy.sort((a, b) => {
        const aValue = toVintageNumber(a.vintage) ?? -Infinity;
        const bValue = toVintageNumber(b.vintage) ?? -Infinity;
        const numericSort = aValue - bValue;
        if (numericSort !== 0) {
          return mult * numericSort;
        }
        return mult * compareEntryChronology(a, b);
      });
    }

    return copy.sort((a, b) => mult * compareEntryChronology(a, b));
  }, [searchedEntries, sortBy, sortOrder]);

  const groupedEntries = useMemo<EntryGroup[]>(() => {
    if (libraryViewMode !== "grouped") {
      return [];
    }

    const groups = new Map<string, EntryGroup>();

    sortedEntries.forEach((entry) => {
      const label = getGroupLabel(entry, groupScheme);
      const id = createGroupId(groupScheme, label);
      const existing = groups.get(id);
      if (existing) {
        existing.entries.push(entry);
        return;
      }
      groups.set(id, { id, label, entries: [entry] });
    });

    const sorted = Array.from(groups.values());
    sorted.sort((a, b) => {
      if (groupScheme === "vintage") {
        // Reverse chronological: most recent first, "Unknown" last
        if (a.label === "Unknown vintage") return 1;
        if (b.label === "Unknown vintage") return -1;
        return b.label.localeCompare(a.label, undefined, { numeric: true });
      }
      // A-Z for region and varietal, "Unknown" last
      const aUnknown = a.label.startsWith("Unknown ");
      const bUnknown = b.label.startsWith("Unknown ");
      if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
      return a.label.localeCompare(b.label);
    });
    return sorted;
  }, [groupScheme, libraryViewMode, sortedEntries]);

  useEffect(() => {
    let isMounted = true;

    const loadEntries = async () => {
      if (isMounted) {
        setLoading(true);
        setErrorMessage(null);
        setNextCursor(null);
        setHasMore(false);
      }

      try {
        const response = await fetch("/api/entries?limit=50", { cache: "no-store" });
        if (!response.ok) {
          if (isMounted) {
            setErrorMessage("Unable to load your library.");
            setLoading(false);
          }
          return;
        }

        const data = await response.json();
        if (isMounted) {
          setEntries(data.entries ?? []);
          setNextCursor(data.next_cursor ?? null);
          setHasMore(Boolean(data.has_more));
          setLoading(false);
        }
      } catch {
        if (isMounted) {
          setErrorMessage("Unable to load your library.");
          setLoading(false);
        }
      }
    };

    loadEntries().catch(() => null);

    return () => {
      isMounted = false;
    };
  }, []);

  const loadMore = async () => {
    if (!hasMore || loadingMore || !nextCursor) {
      return;
    }

    setLoadingMore(true);
    setErrorMessage(null);
    try {
      const response = await fetch(
        `/api/entries?limit=50&cursor=${encodeURIComponent(nextCursor)}`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        setErrorMessage("Unable to load more entries.");
        return;
      }
      const data = await response.json();
      setEntries((prev) => [...prev, ...(data.entries ?? [])]);
      setNextCursor(data.next_cursor ?? null);
      setHasMore(Boolean(data.has_more));
    } finally {
      setLoadingMore(false);
    }
  };

  const sortByLabel =
    sortBy === "consumed_at"
      ? "Date"
      : sortBy === "rating"
        ? "Rating"
        : "Vintage";
  const sortOrderOptions: Array<{ value: SortOrder; label: string }> =
    sortBy === "rating"
      ? [
          { value: "desc", label: "High to low" },
          { value: "asc", label: "Low to high" },
        ]
      : [
          { value: "desc", label: "Newest first" },
          { value: "asc", label: "Oldest first" },
        ];
  const sortOrderLabel =
    sortOrderOptions.find((option) => option.value === sortOrder)?.label ??
    "Newest first";
  const sortSummary = `${sortByLabel} \u00B7 ${sortOrderLabel}`;

  const filterSummary = (() => {
    if (!filterType) {
      return "None";
    }

    if (filterType === "country") {
      return filterValue ? `Country: ${filterValue}` : "Country: all";
    }

    const rangeLabel = filterType === "vintage" ? "Vintage" : "Rating";
    if (!filterMin && !filterMax) {
      return `${rangeLabel}: any`;
    }
    const min = filterMin || "Any";
    const max = filterMax || "Any";
    return `${rangeLabel}: ${min} - ${max}`;
  })();

  const organizeSummary =
    libraryViewMode === "all"
      ? "Full list"
      : `Grouped by ${
          groupScheme === "region"
            ? "region"
            : groupScheme === "vintage"
              ? "vintage"
              : "varietal"
        }`;

  const toggleControlPanel = (panel: Exclude<ControlPanel, null>) => {
    setActiveControlPanel((current) => (current === panel ? null : panel));
  };

  const updateFilterType = (newFilterType: FilterType) => {
    setFilterType(newFilterType);
    setFilterValue("");
    setFilterMin("");
    setFilterMax("");
  };

  /* ─── Pill style helpers ─── */
  const pillActive =
    "text-[var(--color-text-on-accent)] uppercase tracking-[1px]";
  const pillInactive =
    "text-[var(--color-text-secondary)] uppercase tracking-[1px]";

  return (
    <AppShell>
      <div className="px-5 pb-8 pt-6 text-[var(--color-text-primary)]">
        <div className="mx-auto w-full max-w-2xl space-y-5">

          {/* ─── Page header ─── */}
          <header>
            <span
              className="block uppercase"
              style={{
                fontSize: 9,
                letterSpacing: 3,
                color: "var(--color-accent-secondary)",
              }}
            >
              Cellar
            </span>
            <h1
              className="mt-1"
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 44,
                fontWeight: 300,
                color: "var(--color-text-primary)",
                lineHeight: 1.2,
              }}
            >
              Your collection.
            </h1>
          </header>

          {/* ─── Stats row ─── */}
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { value: stats.totalEntries, label: "Entries" },
              {
                value: stats.avgRating !== null ? stats.avgRating.toFixed(1) : "\u2014",
                label: "Avg rating",
              },
              { value: stats.uniqueCountries, label: "Countries" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="text-center"
                style={{
                  background: "var(--color-surface-primary)",
                  border: "0.5px solid var(--color-border)",
                  borderRadius: 12,
                  padding: "14px 8px",
                }}
              >
                <span
                  className="block"
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: 38,
                    fontWeight: 300,
                    color: "var(--color-text-primary)",
                    lineHeight: 1.2,
                  }}
                >
                  {stat.value}
                </span>
                <span
                  className="mt-1 block uppercase"
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.8,
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  {stat.label}
                </span>
              </div>
            ))}
          </div>

          {/* ─── Search bar ─── */}
          {searchBarVisible && (
            <div className="relative">
              <label htmlFor="library-search" className="sr-only">
                Search your library
              </label>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-tertiary)]"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                id="library-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search wine, producer, region..."
                className="w-full focus:outline-none"
                autoFocus
                style={{
                  background: "rgba(245, 237, 214, 0.04)",
                  border: "0.5px solid var(--color-border-strong)",
                  borderRadius: 10,
                  padding: "9px 12px 9px 32px",
                  fontSize: 12,
                  color: "var(--color-text-secondary)",
                }}
              />
              {isSearchActive ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2"
                  style={{
                    fontSize: 9,
                    letterSpacing: 1,
                    color: "var(--color-text-tertiary)",
                    textTransform: "uppercase",
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
          )}

          {/* ─── Sort / Filter / Organize pills ─── */}
          <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {([
              { panel: "sort" as const, label: "Sort", summary: sortSummary },
              { panel: "filter" as const, label: "Filter", summary: filterSummary },
              { panel: "organize" as const, label: "Organize", summary: organizeSummary },
            ]).map((item) => {
              const isActive = activeControlPanel === item.panel;
              return (
                <button
                  key={item.panel}
                  type="button"
                  onClick={() => toggleControlPanel(item.panel)}
                  className={`shrink-0 transition ${isActive ? pillActive : pillInactive}`}
                  style={{
                    background: isActive
                      ? "var(--color-accent-primary)"
                      : "rgba(245, 237, 214, 0.05)",
                    border: isActive
                      ? "none"
                      : "0.5px solid var(--color-border-strong)",
                    borderRadius: 20,
                    padding: "5px 12px",
                    fontSize: 9,
                    letterSpacing: 1,
                  }}
                  aria-expanded={isActive}
                >
                  {item.label}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => {
                setSearchBarVisible(!searchBarVisible);
                if (!searchBarVisible) {
                  setSearchQuery("");
                }
              }}
              className="shrink-0"
              style={{
                background: "transparent",
                border: "none",
                padding: "4px 8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
              aria-label="Toggle search"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  width: "16px",
                  height: "16px",
                  color: "var(--color-text-tertiary)",
                }}
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </button>

            <span
              className="ml-auto shrink-0 self-center"
              style={{
                fontSize: 9,
                letterSpacing: 1,
                color: "var(--color-text-tertiary)",
                textTransform: "uppercase",
              }}
            >
              {sortedEntries.length} {sortedEntries.length === 1 ? "entry" : "entries"}
            </span>
          </div>

          {/* ─── Control panel drawers ─── */}
          {activeControlPanel ? (
            <div
              style={{
                background: "var(--color-surface-primary)",
                border: "0.5px solid var(--color-border)",
                borderRadius: 14,
                padding: 14,
              }}
            >
              {activeControlPanel === "sort" ? (
                <div className="space-y-4">
                  <div>
                    <p
                      className="uppercase"
                      style={{ fontSize: 8, letterSpacing: 1.5, color: "var(--color-text-tertiary)" }}
                    >
                      Sort by
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {([
                        { value: "consumed_at" as SortBy, label: "Date consumed" },
                        { value: "rating" as SortBy, label: "Rating" },
                        { value: "vintage" as SortBy, label: "Vintage" },
                      ]).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setSortBy(option.value)}
                          className={`transition uppercase ${sortBy === option.value ? pillActive : pillInactive}`}
                          style={{
                            background:
                              sortBy === option.value
                                ? "var(--color-accent-primary)"
                                : "rgba(245, 237, 214, 0.05)",
                            border:
                              sortBy === option.value
                                ? "none"
                                : "0.5px solid var(--color-border-strong)",
                            borderRadius: 20,
                            padding: "5px 12px",
                            fontSize: 9,
                            letterSpacing: 1,
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p
                      className="uppercase"
                      style={{ fontSize: 8, letterSpacing: 1.5, color: "var(--color-text-tertiary)" }}
                    >
                      Order
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {sortOrderOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setSortOrder(option.value)}
                          className={`transition uppercase ${sortOrder === option.value ? pillActive : pillInactive}`}
                          style={{
                            background:
                              sortOrder === option.value
                                ? "var(--color-accent-primary)"
                                : "rgba(245, 237, 214, 0.05)",
                            border:
                              sortOrder === option.value
                                ? "none"
                                : "0.5px solid var(--color-border-strong)",
                            borderRadius: 20,
                            padding: "5px 12px",
                            fontSize: 9,
                            letterSpacing: 1,
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {activeControlPanel === "filter" ? (
                <div className="space-y-4">
                  <div>
                    <p
                      className="uppercase"
                      style={{ fontSize: 8, letterSpacing: 1.5, color: "var(--color-text-tertiary)" }}
                    >
                      Filter by
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {([
                        { value: "" as FilterType, label: "None" },
                        { value: "country" as FilterType, label: "Country" },
                        { value: "vintage" as FilterType, label: "Vintage range" },
                        { value: "rating" as FilterType, label: "Rating range" },
                      ]).map((option) => (
                        <button
                          key={option.value || "none"}
                          type="button"
                          onClick={() => updateFilterType(option.value)}
                          className={`transition uppercase ${filterType === option.value ? pillActive : pillInactive}`}
                          style={{
                            background:
                              filterType === option.value
                                ? "var(--color-accent-primary)"
                                : "rgba(245, 237, 214, 0.05)",
                            border:
                              filterType === option.value
                                ? "none"
                                : "0.5px solid var(--color-border-strong)",
                            borderRadius: 20,
                            padding: "5px 12px",
                            fontSize: 9,
                            letterSpacing: 1,
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filterType === "country" ? (
                    <div className="max-w-xs">
                      <label
                        className="mb-1 block uppercase"
                        style={{ fontSize: 8, letterSpacing: 1.5, color: "var(--color-text-tertiary)" }}
                      >
                        Country
                      </label>
                      <select
                        className="select-field w-full focus:outline-none"
                        value={filterValue}
                        onChange={(event) => setFilterValue(event.target.value)}
                        style={{
                          background: "rgba(245, 237, 214, 0.04)",
                          border: "0.5px solid var(--color-border-strong)",
                          borderRadius: 10,
                          padding: "9px 12px",
                          fontSize: 12,
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        <option value="">All countries</option>
                        {uniqueValues.country.map((country) => (
                          <option key={country} value={country}>
                            {country}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {filterType === "rating" || filterType === "vintage" ? (
                    <div>
                      <label
                        className="mb-1 block uppercase"
                        style={{ fontSize: 8, letterSpacing: 1.5, color: "var(--color-text-tertiary)" }}
                      >
                        {filterType === "rating" ? "Rating range" : "Vintage range"}
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          className="w-28 focus:outline-none"
                          type="number"
                          inputMode="numeric"
                          placeholder="Min"
                          value={filterMin}
                          onChange={(event) => setFilterMin(event.target.value)}
                          style={{
                            background: "rgba(245, 237, 214, 0.04)",
                            border: "0.5px solid var(--color-border-strong)",
                            borderRadius: 10,
                            padding: "9px 12px",
                            fontSize: 12,
                            color: "var(--color-text-secondary)",
                          }}
                        />
                        <input
                          className="w-28 focus:outline-none"
                          type="number"
                          inputMode="numeric"
                          placeholder="Max"
                          value={filterMax}
                          onChange={(event) => setFilterMax(event.target.value)}
                          style={{
                            background: "rgba(245, 237, 214, 0.04)",
                            border: "0.5px solid var(--color-border-strong)",
                            borderRadius: 10,
                            padding: "9px 12px",
                            fontSize: 12,
                            color: "var(--color-text-secondary)",
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {activeControlPanel === "organize" ? (
                <div className="space-y-4">
                  <div>
                    <p
                      className="uppercase"
                      style={{ fontSize: 8, letterSpacing: 1.5, color: "var(--color-text-tertiary)" }}
                    >
                      Library view
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {([
                        { value: "grouped" as LibraryViewMode, label: "Grouped" },
                        { value: "all" as LibraryViewMode, label: "Full list" },
                      ]).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setLibraryViewMode(option.value)}
                          className={`transition uppercase ${libraryViewMode === option.value ? pillActive : pillInactive}`}
                          style={{
                            background:
                              libraryViewMode === option.value
                                ? "var(--color-accent-primary)"
                                : "rgba(245, 237, 214, 0.05)",
                            border:
                              libraryViewMode === option.value
                                ? "none"
                                : "0.5px solid var(--color-border-strong)",
                            borderRadius: 20,
                            padding: "5px 12px",
                            fontSize: 9,
                            letterSpacing: 1,
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {libraryViewMode === "grouped" ? (
                    <div>
                      <p
                        className="uppercase"
                        style={{ fontSize: 8, letterSpacing: 1.5, color: "var(--color-text-tertiary)" }}
                      >
                        Group by
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {([
                          { value: "region" as GroupScheme, label: "Region" },
                          { value: "vintage" as GroupScheme, label: "Vintage" },
                          { value: "varietal" as GroupScheme, label: "Varietal" },
                        ]).map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              setGroupScheme(option.value);
                              try { localStorage.setItem("libraryGroupScheme", option.value); } catch { /* noop */ }
                            }}
                            className={`transition uppercase ${groupScheme === option.value ? pillActive : pillInactive}`}
                            style={{
                              background:
                                groupScheme === option.value
                                  ? "var(--color-accent-primary)"
                                  : "rgba(245, 237, 214, 0.05)",
                              border:
                                groupScheme === option.value
                                  ? "none"
                                  : "0.5px solid var(--color-border-strong)",
                              borderRadius: 20,
                              padding: "5px 12px",
                              fontSize: 9,
                              letterSpacing: 1,
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ─── Entry list ─── */}
          {loading ? (
            <div
              className="text-center"
              style={{
                background: "var(--color-surface-primary)",
                border: "0.5px solid var(--color-border)",
                borderRadius: 14,
                padding: "24px 16px",
                fontSize: 12,
                color: "var(--color-text-secondary)",
              }}
            >
              Loading your library...
            </div>
          ) : errorMessage ? (
            <div
              style={{
                borderRadius: 14,
                border: "0.5px solid rgba(192, 57, 43, 0.3)",
                background: "rgba(192, 57, 43, 0.08)",
                padding: "24px 16px",
                fontSize: 12,
                color: "#e6a0a0",
              }}
            >
              {errorMessage}
            </div>
          ) : sortedEntries.length === 0 ? (
            <div
              style={{
                background: "var(--color-surface-primary)",
                border: "0.5px solid var(--color-border)",
                borderRadius: 14,
                padding: "32px 16px",
                fontSize: 12,
                color: "var(--color-text-secondary)",
                textAlign: "center",
              }}
            >
              <p>
                {isSearchActive
                  ? hasMore
                    ? "No entries match this search yet. Try loading more."
                    : "No entries match this search."
                  : isRangeFilterActive
                    ? "There are no wines found in this range."
                    : isFilterActive
                      ? hasMore
                        ? "No entries match this filter yet. Try loading more."
                        : "No entries match this filter."
                      : "Your library is empty. Add your first bottle!"}
              </p>
              {hasMore ? (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="mt-4 transition disabled:opacity-50"
                  style={{
                    background: "var(--color-accent-primary)",
                    color: "var(--color-text-on-accent)",
                    borderRadius: 20,
                    padding: "5px 14px",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 1,
                    textTransform: "uppercase" as const,
                  }}
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {libraryViewMode === "grouped" ? (
                <div className="space-y-4">
                  {groupedEntries.map((group) => {
                    const expanded = Boolean(expandedGroups[group.id]);
                    const visibleEntries = expanded
                      ? group.entries
                      : group.entries.slice(0, GROUP_PREVIEW_COUNT);
                    return (
                      <section
                        key={group.id}
                        style={{
                          background: "var(--color-surface-primary)",
                          border: "0.5px solid var(--color-border)",
                          borderRadius: 14,
                          overflow: "hidden",
                        }}
                      >
                        {/* Group header */}
                        <div
                          className="flex items-center justify-between"
                          style={{ padding: "10px 14px 6px" }}
                        >
                          <span
                            className="uppercase"
                            style={{
                              fontSize: 8,
                              letterSpacing: 2,
                              color: "var(--color-accent-secondary)",
                            }}
                          >
                            {group.label} &middot; {group.entries.length}{" "}
                            {group.entries.length === 1 ? "entry" : "entries"}
                          </span>
                          {group.entries.length > GROUP_PREVIEW_COUNT ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedGroups((prev) => ({
                                  ...prev,
                                  [group.id]: !prev[group.id],
                                }))
                              }
                              style={{
                                fontSize: 8,
                                letterSpacing: 1,
                                color: "var(--color-text-tertiary)",
                                textTransform: "uppercase" as const,
                              }}
                            >
                              {expanded ? "Show less" : "See all"}
                            </button>
                          ) : null}
                        </div>
                        {/* Entry rows */}
                        <div>
                          {visibleEntries.map((entry) => (
                            <EntryRow key={entry.id} entry={entry} />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div
                  style={{
                    background: "var(--color-surface-primary)",
                    border: "0.5px solid var(--color-border)",
                    borderRadius: 14,
                    overflow: "hidden",
                  }}
                >
                  {sortedEntries.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} />
                  ))}
                </div>
              )}
              {hasMore ? (
                <div className="pt-1 text-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="transition disabled:opacity-50"
                    style={{
                      background: "var(--color-accent-primary)",
                      color: "var(--color-text-on-accent)",
                      borderRadius: 20,
                      padding: "5px 14px",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 1,
                      textTransform: "uppercase" as const,
                    }}
                  >
                    {loadingMore ? "Loading..." : "Load more"}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
