"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatConsumedDate } from "@/lib/formatDate";
import { shouldHideProducerInEntryTile } from "@/lib/entryDisplay";
import Photo from "@/components/Photo";
import NavBar from "@/components/NavBar";
import QprBadge from "@/components/QprBadge";
import RatingBadge from "@/components/RatingBadge";
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

function EntryCard({ entry }: { entry: WineEntryWithUrls & { comment_count?: number } }) {
  const commentCount = (entry as Record<string, unknown>).comment_count as number | undefined;
  return (
    <Link
      href={`/entries/${entry.id}`}
      className="group flex gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)] transition hover:-translate-y-0.5 hover:border-amber-300/40"
    >
      <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-black/40 text-xs text-zinc-400">
        {entry.label_image_url ? (
          <Photo
            src={entry.label_image_url}
            alt={entry.wine_name ?? entry.producer ?? "Wine label"}
            containerClassName="h-full w-full"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          "No photo"
        )}
      </div>
      <div className="flex flex-1 flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-2">
            {entry.wine_name ? (
              <h2 className="text-lg font-semibold text-zinc-50">{entry.wine_name}</h2>
            ) : <span />}
            {commentCount != null && commentCount > 0 ? (
              <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-zinc-500">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true"><path d="M7 18H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 4v-4z" /></svg>
                <span className="text-[11px] tabular-nums">{commentCount}</span>
              </span>
            ) : null}
          </div>
          {(() => {
            const hideProducer = shouldHideProducerInEntryTile(
              entry.wine_name,
              entry.producer
            );
            const producer = hideProducer ? null : entry.producer;
            if (!producer && !entry.vintage) {
              return null;
            }
            return (
              <p className="text-sm text-zinc-400">
                {producer ?? ""}
                {producer && entry.vintage ? (
                  <span className="text-zinc-500">{" · "}{entry.vintage}</span>
                ) : entry.vintage ? (
                  <span className="text-zinc-500">{entry.vintage}</span>
                ) : null}
              </p>
            );
          })()}
          {[entry.country, entry.region, entry.appellation].filter(Boolean).length > 0 ? (
            <p className="mt-1 text-xs text-zinc-500">
              {[entry.country, entry.region, entry.appellation]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
          {((typeof entry.rating === "number" && !Number.isNaN(entry.rating)) ||
            entry.qpr_level) ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {typeof entry.rating === "number" && !Number.isNaN(entry.rating) ? (
                <RatingBadge rating={entry.rating} variant="text" />
              ) : null}
              {entry.qpr_level ? <QprBadge level={entry.qpr_level} /> : null}
            </div>
          ) : (
            <span />
          )}
          <span>{formatConsumedDate(entry.consumed_at)}</span>
        </div>
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
  const [sortBy, setSortBy] = useState<SortBy>("consumed_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [filterType, setFilterType] = useState<FilterType>("");
  const [filterValue, setFilterValue] = useState<string>("");
  const [filterMin, setFilterMin] = useState<string>("");
  const [filterMax, setFilterMax] = useState<string>("");
  const [libraryViewMode, setLibraryViewMode] =
    useState<LibraryViewMode>("grouped");
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
        return mult * (aValue - bValue);
      });
    }

    if (sortBy === "vintage") {
      return copy.sort((a, b) => {
        const aValue = toVintageNumber(a.vintage) ?? -Infinity;
        const bValue = toVintageNumber(b.vintage) ?? -Infinity;
        return mult * (aValue - bValue);
      });
    }

    return copy.sort((a, b) => mult * a.consumed_at.localeCompare(b.consumed_at));
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

    return Array.from(groups.values());
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
  const sortSummary = `${sortByLabel} · ${sortOrderLabel}`;

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

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <NavBar />
        <header className="space-y-2">
          <span className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
            My library
          </span>
          <h1 className="text-3xl font-semibold text-zinc-50">
            Curate your cellar library.
          </h1>
          <p className="text-sm text-zinc-300">
            Organize bottles by region, vintage, or varietal while keeping your filters.
          </p>
        </header>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => toggleControlPanel("sort")}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                  activeControlPanel === "sort"
                    ? "border-amber-300/70 bg-amber-300/15 text-amber-100"
                    : "border-white/10 text-zinc-200 hover:border-white/30"
                }`}
                aria-expanded={activeControlPanel === "sort"}
              >
                <span className="font-semibold">Sort</span>
                <span className="hidden text-xs text-zinc-400 sm:inline">
                  {sortSummary}
                </span>
                <svg
                  viewBox="0 0 12 12"
                  className={`h-3 w-3 transition ${activeControlPanel === "sort" ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M2 4.5 6 8l4-3.5" />
                </svg>
              </button>

              <button
                type="button"
                onClick={() => toggleControlPanel("filter")}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                  activeControlPanel === "filter"
                    ? "border-amber-300/70 bg-amber-300/15 text-amber-100"
                    : "border-white/10 text-zinc-200 hover:border-white/30"
                }`}
                aria-expanded={activeControlPanel === "filter"}
              >
                <span className="font-semibold">Filter</span>
                <span className="hidden text-xs text-zinc-400 sm:inline">
                  {filterSummary}
                </span>
                <svg
                  viewBox="0 0 12 12"
                  className={`h-3 w-3 transition ${activeControlPanel === "filter" ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M2 4.5 6 8l4-3.5" />
                </svg>
              </button>

              <button
                type="button"
                onClick={() => toggleControlPanel("organize")}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                  activeControlPanel === "organize"
                    ? "border-amber-300/70 bg-amber-300/15 text-amber-100"
                    : "border-white/10 text-zinc-200 hover:border-white/30"
                }`}
                aria-expanded={activeControlPanel === "organize"}
              >
                <span className="font-semibold">Organize</span>
                <span className="hidden text-xs text-zinc-400 sm:inline">
                  {organizeSummary}
                </span>
                <svg
                  viewBox="0 0 12 12"
                  className={`h-3 w-3 transition ${activeControlPanel === "organize" ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M2 4.5 6 8l4-3.5" />
                </svg>
              </button>
            </div>

            <div className="flex w-full max-w-md items-center gap-2">
              <label htmlFor="library-search" className="sr-only">
                Search your library
              </label>
              <input
                id="library-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search wine, producer, region, or varietal"
                className="w-full rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none"
              />
              {isSearchActive ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="shrink-0 rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-white/30 hover:text-zinc-100"
                >
                  Clear
                </button>
              ) : null}
            </div>

            <span className="text-xs text-zinc-400">
              {sortedEntries.length} {sortedEntries.length === 1 ? "entry" : "entries"}
            </span>
          </div>

          {activeControlPanel ? (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              {activeControlPanel === "sort" ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
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
                          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                            sortBy === option.value
                              ? "border-amber-300/70 bg-amber-300/15 text-amber-100"
                              : "border-white/10 text-zinc-300 hover:border-white/30"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Order
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {sortOrderOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setSortOrder(option.value)}
                          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                            sortOrder === option.value
                              ? "border-amber-300/70 bg-amber-300/15 text-amber-100"
                              : "border-white/10 text-zinc-300 hover:border-white/30"
                          }`}
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
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
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
                          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                            filterType === option.value
                              ? "border-amber-300/70 bg-amber-300/15 text-amber-100"
                              : "border-white/10 text-zinc-300 hover:border-white/30"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filterType === "country" ? (
                    <div className="max-w-xs">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                        Country
                      </label>
                      <select
                        className="select-field w-full rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-zinc-200 focus:border-amber-300 focus:outline-none"
                        value={filterValue}
                        onChange={(event) => setFilterValue(event.target.value)}
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
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                        {filterType === "rating" ? "Rating range" : "Vintage range"}
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          className="w-28 rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-zinc-200 focus:border-amber-300 focus:outline-none"
                          type="number"
                          inputMode="numeric"
                          placeholder="Min"
                          value={filterMin}
                          onChange={(event) => setFilterMin(event.target.value)}
                        />
                        <input
                          className="w-28 rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-zinc-200 focus:border-amber-300 focus:outline-none"
                          type="number"
                          inputMode="numeric"
                          placeholder="Max"
                          value={filterMax}
                          onChange={(event) => setFilterMax(event.target.value)}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {activeControlPanel === "organize" ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
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
                          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                            libraryViewMode === option.value
                              ? "border-amber-300/70 bg-amber-300/15 text-amber-100"
                              : "border-white/10 text-zinc-300 hover:border-white/30"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {libraryViewMode === "grouped" ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
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
                              try { localStorage.setItem("libraryGroupScheme", option.value); } catch {}
                            }}
                            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                              groupScheme === option.value
                                ? "border-amber-300/70 bg-amber-300/15 text-amber-100"
                                : "border-white/10 text-zinc-300 hover:border-white/30"
                            }`}
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
        </section>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
            Loading your library...
          </div>
        ) : errorMessage ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
            {errorMessage}
          </div>
        ) : sortedEntries.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-sm text-zinc-300">
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
                className="mt-4 inline-flex rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50"
              >
                {loadingMore ? "Loading..." : "Load more"}
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {libraryViewMode === "grouped" ? (
              <div className="space-y-5">
                {groupedEntries.map((group) => {
                  const expanded = Boolean(expandedGroups[group.id]);
                  const visibleEntries = expanded
                    ? group.entries
                    : group.entries.slice(0, GROUP_PREVIEW_COUNT);
                  return (
                    <section
                      key={group.id}
                      className="rounded-2xl border border-white/10 bg-white/5 p-4"
                    >
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-lg font-semibold text-zinc-50">{group.label}</h2>
                          <p className="text-xs text-zinc-400">
                            {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}
                          </p>
                        </div>
                        {group.entries.length > GROUP_PREVIEW_COUNT ? (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedGroups((prev) => ({
                                ...prev,
                                [group.id]: !prev[group.id],
                              }))
                            }
                            className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                          >
                            {expanded ? "Show less" : "See all"}
                          </button>
                        ) : null}
                      </div>
                      <div className="grid gap-5 md:grid-cols-2">
                        {visibleEntries.map((entry) => (
                          <EntryCard key={entry.id} entry={entry} />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="grid gap-5 md:grid-cols-2">
                {sortedEntries.map((entry) => (
                  <EntryCard key={entry.id} entry={entry} />
                ))}
              </div>
            )}
            {hasMore ? (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="inline-flex rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50"
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
