"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  buildListScanVarietalAccentMap,
  createDefaultListScanFilters,
  deriveListScanFacets,
  deriveListScanRegionGroups,
  filterListScanWines,
  formatListScanPriceDisplay,
  getListScanStructuredMeta,
  getListScanDisplayLines,
  getListScanFilterAccentTone,
  getListScanVarietalAccentTone,
  getListScanSectionTitle,
  getTopListScanRecommendations,
  sortListScanWines,
  listScanWineTypeLabels,
  sanitizeListScanFilters,
  resolveListScanWineType,
  type ListScanFilterAccentTone,
  type ListScanFilters,
  type ListScanFilterableWineType,
  type ListScanResult,
  type ListScanSortMode,
} from "@shared";
import FacetMultiSelect from "@/features/listScan/FacetMultiSelect";
import RegionFilterSelect from "@/features/listScan/RegionFilterSelect";
import NavBar from "@/components/NavBar";
import { readListScanResult, saveListScanResult } from "@/lib/listScan/storage";

const EMPTY_WINE_TYPES: ListScanFilterableWineType[] = [];
const EMPTY_STRING_LIST: string[] = [];

function formatCurrencyValue(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `$${value}` : "";
}

function formatPriceInputValue(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function parseNonNegativePriceInput(value: string) {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, parsed);
}

function formatPriceDisplay(priceDisplay: string | null, menuLabel?: string) {
  return formatListScanPriceDisplay(priceDisplay, menuLabel) ?? "-";
}

function summarizeSelectedLabels(values: string[], emptyLabel: string) {
  if (values.length === 0) {
    return emptyLabel;
  }
  if (values.length <= 2) {
    return values.join(", ");
  }
  return `${values.slice(0, 2).join(", ")} +${values.length - 2}`;
}

function buildPriceSummary(filters: ListScanFilters) {
  if (filters.price_mode === "any") {
    return "Any price";
  }
  if (filters.price_mode === "under") {
    return filters.price_max !== null
      ? `Under ${formatCurrencyValue(filters.price_max)}`
      : "Under a set price";
  }
  if (filters.price_mode === "over") {
    return filters.price_min !== null
      ? `Over ${formatCurrencyValue(filters.price_min)}`
      : "Over a set price";
  }

  const min = filters.price_min !== null ? formatCurrencyValue(filters.price_min) : "min";
  const max = filters.price_max !== null ? formatCurrencyValue(filters.price_max) : "max";
  return `Between ${min} and ${max}`;
}

function buildWineTypeSummary(
  selected: ListScanFilterableWineType[],
  available: ListScanFilterableWineType[]
) {
  const visibleSelected = selected.filter((value) => available.includes(value));
  if (available.length === 0) {
    return "No options found";
  }
  if (visibleSelected.length === 0 || visibleSelected.length === available.length) {
    return "All available";
  }
  return summarizeSelectedLabels(
    visibleSelected.map((value) => listScanWineTypeLabels[value]),
    "All available"
  );
}

function buildMatchSummary(filters: ListScanFilters) {
  return filters.min_match_percent > 0
    ? `Over ${filters.min_match_percent}%`
    : "Any match";
}

function getAccentPillClasses(
  tone: ListScanFilterAccentTone,
  selected: boolean
) {
  if (tone === "rose") {
    return selected
      ? "border border-[#C76886]/70 bg-[#C76886]/18 text-[#fde5ec]"
      : "border border-[#C76886]/35 bg-[#C76886]/10 text-[#f1bfd0] hover:border-[#C76886]/60";
  }
  if (tone === "orange") {
    return selected
      ? "border border-[#D17A2A]/75 bg-[#D17A2A]/18 text-[#fde6c7]"
      : "border border-[#D17A2A]/35 bg-[#D17A2A]/10 text-[#f2c78f] hover:border-[#D17A2A]/60";
  }
  if (tone === "white") {
    return selected
      ? "border border-[var(--color-accent-secondary)]/70 bg-[var(--color-accent-secondary)]/18 text-[var(--color-text-on-accent)]"
      : "border border-[var(--color-accent-secondary)]/30 bg-[var(--color-accent-secondary)]/8 text-[var(--color-text-on-accent)] hover:border-[var(--color-accent-secondary)]/55";
  }
  if (tone === "red") {
    return selected
      ? "border border-[#4A3060] bg-[#4A3060] text-[#f3eef8]"
      : "border border-[#4A3060]/45 bg-[#4A3060]/15 text-[#dbcfe7] hover:border-[#4A3060]/75";
  }
  return selected
    ? "border border-emerald-400 bg-emerald-400 text-emerald-950"
    : "border border-[var(--color-border)] text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)]";
}

function getWineTypeButtonClasses(
  type: ListScanFilterableWineType,
  selected: boolean
) {
  if (type === "dessert_fortified") {
    return getAccentPillClasses("neutral", selected);
  }
  return getAccentPillClasses(getListScanFilterAccentTone(type), selected);
}

function hasCustomWineTypeSelection(
  selected: ListScanFilterableWineType[],
  available: ListScanFilterableWineType[]
) {
  if (available.length === 0) {
    return false;
  }

  return !available.every((type) => selected.includes(type));
}

function countActiveFilterGroups(
  filters: ListScanFilters,
  availableWineTypes: ListScanFilterableWineType[]
) {
  let count = 0;

  if (filters.price_mode !== "any") {
    count += 1;
  }
  if (hasCustomWineTypeSelection(filters.included_wine_types, availableWineTypes)) {
    count += 1;
  }
  if (filters.selected_varietals.length > 0) {
    count += 1;
  }
  if (filters.selected_regions.length > 0) {
    count += 1;
  }
  if (filters.min_match_percent > 0) {
    count += 1;
  }

  return count;
}

type FilterDropdownProps = {
  label: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  onDone?: () => void;
  children: ReactNode;
};

function FilterDropdown({
  label,
  summary,
  open,
  onToggle,
  onDone,
  children,
}: FilterDropdownProps) {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-[var(--color-border)] bg-black/25">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
            {label}
          </span>
          <span className="mt-1 block truncate text-sm font-semibold text-[var(--color-text-primary)]">
            {summary}
          </span>
        </span>
        <span className="text-sm font-semibold text-[var(--color-text-secondary)]">{open ? "v" : ">"}</span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-white/8 p-4">
          {children}
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
              onClick={onDone ?? onToggle}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ResultsLoadingSkeleton() {
  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-8">
        <div className="h-3 w-24 animate-pulse rounded-full bg-[var(--color-surface-hover)]" />
        <div className="mt-4 h-8 w-72 animate-pulse rounded-full bg-[var(--color-surface-hover)]" />
        <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded-full bg-[var(--color-surface-hover)]" />
        <div className="mt-6 flex gap-3">
          <div className="h-10 w-32 animate-pulse rounded-full bg-[var(--color-surface-hover)]" />
          <div className="h-10 w-28 animate-pulse rounded-full bg-[var(--color-surface-hover)]" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-6"
          >
            <div className="h-3 w-24 animate-pulse rounded-full bg-[var(--color-surface-hover)]" />
            <div className="mt-4 h-6 w-40 animate-pulse rounded-full bg-[var(--color-surface-hover)]" />
            <div className="mt-3 h-4 w-full animate-pulse rounded-full bg-[var(--color-surface-hover)]" />
            <div className="mt-2 h-4 w-3/4 animate-pulse rounded-full bg-[var(--color-surface-hover)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ListScanResultsScreen() {
  const searchParams = useSearchParams();
  const scanId = searchParams.get("scanId") ?? "";
  const [result, setResult] = useState<ListScanResult | null | undefined>(
    scanId ? undefined : null
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState(() => createDefaultListScanFilters());
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [wineTypeOpen, setWineTypeOpen] = useState(false);
  const [varietalOpen, setVarietalOpen] = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [sortMode, setSortMode] = useState<ListScanSortMode>("list_order");

  useEffect(() => {
    const cachedResult = scanId ? readListScanResult(scanId) : null;

    let isActive = true;

    const loadSavedResult = async () => {
      setResult(scanId ? cachedResult ?? undefined : null);
      setLoadError(null);

      if (!scanId) {
        return;
      }

      try {
        const response = await fetch(`/api/list-scan/scans/${encodeURIComponent(scanId)}`, {
          cache: "no-store",
        });

        if (!isActive) {
          return;
        }

        if (response.ok) {
          const payload = (await response.json()) as ListScanResult;
          saveListScanResult(payload);
          setResult(payload);
          setLoadError(null);
          return;
        }

        if (cachedResult) {
          setResult(cachedResult);
          setLoadError(null);
          return;
        }

        if (response.status === 401 || response.status === 404) {
          setResult(null);
          setLoadError(
            response.status === 401
              ? "Sign in to reopen saved scans across devices."
              : null
          );
          return;
        }

        setLoadError("Unable to reload this scan right now.");
        setResult(null);
      } catch {
        if (!isActive) {
          return;
        }

        setResult(cachedResult ?? null);
        if (!cachedResult) {
          setLoadError("Unable to reload this scan right now.");
        } else {
          setLoadError("Showing the last cached copy because the saved scan could not be reloaded.");
        }
      }
    };

    void loadSavedResult();

    return () => {
      isActive = false;
    };
  }, [scanId]);

  const derivedFacets = useMemo(
    () => (result ? deriveListScanFacets(result.wines) : null),
    [result]
  );
  const varietalAccentMap = useMemo(
    () => (result ? buildListScanVarietalAccentMap(result.wines) : {}),
    [result]
  );
  const regionGroups = useMemo(
    () => (result ? deriveListScanRegionGroups(result.wines) : []),
    [result]
  );
  const visibleFilters = useMemo(
    () =>
      result
        ? sanitizeListScanFilters(
            filters,
            derivedFacets ?? undefined,
            regionGroups
          )
        : filters,
    [derivedFacets, filters, regionGroups, result]
  );
  const availableWineTypes = derivedFacets?.wine_types ?? EMPTY_WINE_TYPES;
  const availableVarietals = derivedFacets?.varietals ?? EMPTY_STRING_LIST;
  const hasWineTypeOptions = availableWineTypes.length > 0;
  const hasVarietalOptions = availableVarietals.length > 0;
  const hasRegionOptions = regionGroups.length > 0;
  const filteredWines = useMemo(
    () =>
      result
        ? sortListScanWines(filterListScanWines(result.wines, visibleFilters), sortMode)
        : [],
    [result, sortMode, visibleFilters]
  );
  const topRecommendations = useMemo(
    () => getTopListScanRecommendations(filteredWines, 3),
    [filteredWines]
  );
  const highlightedIds = useMemo(
    () => new Set(topRecommendations.map((wine) => wine.id)),
    [topRecommendations]
  );
  const activeFilterCount = useMemo(
    () =>
      derivedFacets
        ? countActiveFilterGroups(visibleFilters, availableWineTypes)
        : 0,
    [availableWineTypes, derivedFacets, visibleFilters]
  );

  const toggleFiltersVisibility = () => {
    if (filtersVisible) {
      setPriceOpen(false);
      setWineTypeOpen(false);
      setVarietalOpen(false);
      setRegionOpen(false);
      setMatchOpen(false);
    }
    setFiltersVisible((current) => !current);
  };

  if (result === undefined) {
    return (
      <div className="min-h-screen bg-[var(--color-screen-bg)] px-6 py-10 text-[var(--color-text-primary)]">
        <div className="mx-auto w-full max-w-6xl space-y-8">
          <NavBar />
          <ResultsLoadingSkeleton />
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-[var(--color-screen-bg)] px-6 py-10 text-[var(--color-text-primary)]">
        <div className="mx-auto w-full max-w-6xl space-y-8">
          <NavBar />
          <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-8 text-sm text-[var(--color-text-secondary)]">
            {loadError ?? "This scan result is no longer available in the current session."}
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/list-scan"
                className="inline-flex rounded-full bg-[var(--color-accent-primary)] px-4 py-2 font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-primary)]"
              >
                Scan another
              </Link>
              <Link
                href="/list-scan/history"
                className="inline-flex rounded-full border border-[var(--color-border)] px-4 py-2 font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
              >
                My scans
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-screen-bg)] px-6 py-10 text-[var(--color-text-primary)]">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <NavBar />

        <header className="space-y-3">
          <span className="block text-xs uppercase tracking-[0.3em] text-[var(--color-accent-secondary)]/70">
            List results
          </span>
          <h1 className="text-3xl font-semibold text-[var(--color-text-primary)]">
            {result.venue_name || result.list_title || "Scanned wine list"}
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Filter the scanned list, review the current top 3, and browse the full
            list in its original order.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/list-scan"
              className="inline-flex rounded-full bg-[var(--color-accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-primary)]"
            >
              Scan another
            </Link>
            <Link
              href="/list-scan/history"
              className="inline-flex rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
            >
              My scans
            </Link>
          </div>
        </header>

        {loadError ? (
          <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-5 text-sm text-[var(--color-text-primary)] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)]">
            {loadError}
          </section>
        ) : null}

        {result.score_summary.warning ? (
          <section className="rounded-3xl border border-[var(--color-accent-secondary)]/25 bg-[var(--color-accent-primary)]/10 p-5 text-sm text-[var(--color-text-on-accent)] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-secondary)]/80">
              Match scoring
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-on-accent)]">
              {result.score_summary.warning}
            </p>
          </section>
        ) : null}

        <section className="space-y-5 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                Filters
              </p>
              <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
                Narrow the scanned list
              </h2>
            </div>

            <button
              type="button"
              onClick={toggleFiltersVisibility}
              aria-expanded={filtersVisible}
              className="inline-flex items-center gap-3 self-start rounded-full border border-white/12 bg-black/25 px-4 py-2.5 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-white/25 hover:bg-black/35"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 text-[var(--color-text-primary)]">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path d="M4 6h16" />
                  <path d="M7 12h10" />
                  <path d="M10 18h4" />
                </svg>
              </span>
              <span>{filtersVisible ? "Hide filters" : "Show filters"}</span>
              {activeFilterCount > 0 ? (
                <span className="rounded-full border border-[var(--color-border)] bg-white/8 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-text-primary)]">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>

          {filtersVisible ? (
            <div className="grid grid-cols-2 items-start gap-4">
              <div className={priceOpen ? "col-span-2 min-w-0" : "min-w-0"}>
                <FilterDropdown
                  label="Price"
                  summary={buildPriceSummary(visibleFilters)}
                  open={priceOpen}
                  onToggle={() => setPriceOpen((current) => !current)}
                >
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "any", label: "Any" },
                    { value: "under", label: "Under" },
                    { value: "between", label: "Between" },
                    { value: "over", label: "Over" },
                  ].map((option) => {
                    const selected = filters.price_mode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setFilters((current) => ({
                            ...current,
                            price_mode: option.value as typeof current.price_mode,
                          }))
                        }
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                          selected
                            ? "bg-[var(--color-accent-primary)] text-[var(--color-text-on-accent)]"
                            : "border border-[var(--color-border)] text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)]"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {filters.price_mode === "under" || filters.price_mode === "between" ? (
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      placeholder={filters.price_mode === "under" ? "Max price" : "Min price"}
                      value={formatPriceInputValue(
                        filters.price_mode === "under" ? filters.price_max : filters.price_min
                      )}
                      onChange={(event) =>
                        setFilters((current) => {
                          const newValue = parseNonNegativePriceInput(event.target.value);
                          // Validate bounds in "between" mode
                          if (current.price_mode === "between") {
                            const otherValue = current.price_max;
                            // Swap if new min > current max (and max is non-zero)
                            if (newValue !== null && otherValue !== null && newValue > otherValue && otherValue > 0) {
                              return {
                                ...current,
                                price_min: otherValue,
                                price_max: newValue,
                              };
                            }
                          }
                          return {
                            ...current,
                            [current.price_mode === "under" ? "price_max" : "price_min"]: newValue,
                          };
                        })
                      }
                      className="rounded-xl border border-[var(--color-border)] bg-[#171210] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)]/60 focus:outline-none"
                    />
                  ) : null}

                  {filters.price_mode === "between" || filters.price_mode === "over" ? (
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      placeholder={filters.price_mode === "over" ? "Min price" : "Max price"}
                      value={formatPriceInputValue(
                        filters.price_mode === "over" ? filters.price_min : filters.price_max
                      )}
                      onChange={(event) =>
                        setFilters((current) => {
                          const newValue = parseNonNegativePriceInput(event.target.value);
                          // Validate bounds in "between" mode
                          if (current.price_mode === "between") {
                            const otherValue = current.price_min;
                            // Swap if new max < current min (and new value is non-zero)
                            if (newValue !== null && otherValue !== null && newValue < otherValue && newValue > 0) {
                              return {
                                ...current,
                                price_min: newValue,
                                price_max: otherValue,
                              };
                            }
                          }
                          return {
                            ...current,
                            [current.price_mode === "over" ? "price_min" : "price_max"]: newValue,
                          };
                        })
                      }
                      className="rounded-xl border border-[var(--color-border)] bg-[#171210] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)]/60 focus:outline-none"
                    />
                  ) : null}
                </div>
                </FilterDropdown>
              </div>

              {result && hasWineTypeOptions ? (
                <div className={wineTypeOpen ? "col-span-2 min-w-0" : "min-w-0"}>
                  <FilterDropdown
                    label="Wine type"
                    summary={buildWineTypeSummary(
                      visibleFilters.included_wine_types,
                      availableWineTypes
                    )}
                    open={wineTypeOpen}
                    onToggle={() => setWineTypeOpen((current) => !current)}
                  >
                  <div className="flex flex-wrap gap-2">
                    {availableWineTypes.map((type) => {
                      const selected = visibleFilters.included_wine_types.includes(type);
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() =>
                            setFilters((current) => ({
                              ...current,
                              included_wine_types: current.included_wine_types.includes(type)
                                ? current.included_wine_types.filter((value) => value !== type)
                                : [...current.included_wine_types, type],
                            }))
                          }
                          className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${getWineTypeButtonClasses(
                            type,
                            selected
                          )}`}
                        >
                          {listScanWineTypeLabels[type]}
                        </button>
                    );
                    })}
                  </div>
                  </FilterDropdown>
                </div>
              ) : null}

              {hasVarietalOptions ? (
                <div className={varietalOpen ? "col-span-2 min-w-0" : "min-w-0"}>
                  <FacetMultiSelect
                    label="Varietal"
                    placeholder="Type a varietal from this list"
                    options={availableVarietals}
                    selected={visibleFilters.selected_varietals}
                    onChange={(selected_varietals) =>
                      setFilters((current) => ({ ...current, selected_varietals }))
                    }
                    getOptionTone={(option) =>
                      getListScanVarietalAccentTone(option, varietalAccentMap)
                    }
                    open={varietalOpen}
                    onOpenChange={setVarietalOpen}
                  />
                </div>
              ) : null}

              {hasRegionOptions ? (
                <div className={regionOpen ? "col-span-2 min-w-0" : "min-w-0"}>
                  <RegionFilterSelect
                    regionGroups={regionGroups}
                    selected={visibleFilters.selected_regions}
                    onChange={(selected_regions) =>
                      setFilters((current) => ({ ...current, selected_regions }))
                    }
                    open={regionOpen}
                    onOpenChange={setRegionOpen}
                  />
                </div>
              ) : null}

              <div className={matchOpen ? "col-span-2 min-w-0" : "min-w-0"}>
                <FilterDropdown
                  label="Match"
                  summary={buildMatchSummary(visibleFilters)}
                  open={matchOpen}
                  onToggle={() => setMatchOpen((current) => !current)}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm text-[var(--color-text-secondary)]">Show wines over</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="100"
                      placeholder="0"
                      value={
                        filters.min_match_percent > 0 ? String(filters.min_match_percent) : ""
                      }
                      onChange={(event) => {
                        const trimmed = event.target.value.trim();
                        const nextValue = trimmed === "" ? 0 : Number(trimmed);
                        setFilters((current) => ({
                          ...current,
                          min_match_percent: Number.isFinite(nextValue)
                            ? Math.max(0, Math.min(100, Math.round(nextValue)))
                            : current.min_match_percent,
                        }));
                      }}
                      className="w-24 rounded-xl border border-[var(--color-border)] bg-[#171210] px-3 py-2 text-center text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-emerald-300/60 focus:outline-none"
                    />
                    <span className="text-sm text-[var(--color-text-secondary)]">%</span>
                  </div>
                </FilterDropdown>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/8 bg-black/15 px-4 py-4 text-sm text-[var(--color-text-tertiary)]">
              {activeFilterCount > 0
                ? `${activeFilterCount} filter ${
                    activeFilterCount === 1 ? "setting is" : "settings are"
                  } active. Open the filter icon to adjust them.`
                : "Filters start hidden to keep the page focused. Open the filter icon whenever you want to narrow by price, wine type, varietal, region, or match."}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
              Top 3
            </p>
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
              Current recommendations
            </h2>
          </div>

          {topRecommendations.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {topRecommendations.map((wine, index) => (
                (() => {
                  const display = getListScanDisplayLines(wine);
                  const structured = getListScanStructuredMeta(wine);
                  const detailLine =
                    display.subtitle ??
                    [display.wineName, display.producer].filter(Boolean).join(" · ");
                  const metaLine = [structured.typeLabel, structured.primaryVarietal, structured.displayRegion]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <article
                      key={wine.id}
                      className="rounded-3xl border border-emerald-300/20 bg-emerald-400/7 p-5 shadow-[0_20px_60px_-40px_rgba(16,185,129,0.55)]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/80">
                          Recommendation {index + 1}
                        </p>
                        <span className="rounded-full border border-emerald-300/35 bg-emerald-400/10 px-3 py-1 text-sm font-semibold text-emerald-200">
                          {wine.match_percent}%
                        </span>
                      </div>

                      <div className="mt-3 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                            {display.title}
                          </h3>
                          {detailLine ? (
                            <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
                              {detailLine}
                            </p>
                          ) : null}
                          {metaLine ? (
                            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                              {metaLine}
                            </p>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-right text-base font-semibold text-emerald-100">
                          {formatPriceDisplay(wine.price_display, wine.menu_label)}
                        </span>
                      </div>

                      <p className="mt-4 text-sm leading-6 text-[var(--color-text-primary)]">{wine.rationale}</p>
                    </article>
                  );
                })()
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-5 text-sm text-[var(--color-text-secondary)]">
              No wines match the current filters.
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                Full list
              </p>
              <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
                {sortMode === "match"
                  ? "Filtered wines by best match"
                  : "Filtered wines in list order"}
              </h2>
              <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
                {filteredWines.length} of {result.wines.length} shown
              </p>
            </div>

            <div className="flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-black/25 p-1">
              {(
                [
                  { value: "list_order", label: "List Order" },
                  { value: "match", label: "Best Match" },
                ] as const
              ).map((option) => {
                const active = sortMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSortMode(option.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "bg-white/12 text-[var(--color-text-primary)] shadow-sm"
                        : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[#120f0e]">
            <div className="grid grid-cols-[minmax(0,1fr)_120px_88px] gap-3 border-b border-[var(--color-border)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
              <span>Wine</span>
              <span className="text-center">Price</span>
              <span className="whitespace-nowrap text-right">% match</span>
            </div>

            <div className="max-h-[520px] overflow-y-auto">
              {filteredWines.length > 0 ? (
                (() => {
                  let lastSectionType: string | null = null;
                  return filteredWines.map((wine) => {
                    const highlighted = highlightedIds.has(wine.id);
                    const display = getListScanDisplayLines(wine);
                    const structured = getListScanStructuredMeta(wine);
                    const metaLine = [
                      structured.typeLabel,
                      structured.primaryVarietal,
                      structured.displayRegion,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    const resolvedType = resolveListScanWineType(wine);
                    const showSectionHeader =
                      sortMode === "list_order" && resolvedType !== lastSectionType;
                    lastSectionType = resolvedType;

                    return (
                      <div key={wine.id}>
                        {showSectionHeader ? (
                          <div className="border-b border-white/8 bg-white/4 px-5 py-2">
                            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                              {getListScanSectionTitle(resolvedType)}
                            </span>
                          </div>
                        ) : null}
                        <div className="grid grid-cols-[minmax(0,1fr)_120px_88px] gap-3 border-b border-white/6 px-5 py-3 text-sm">
                          <div className="min-w-0">
                            <p
                              className={`truncate ${
                                highlighted
                                  ? "font-bold text-emerald-300"
                                  : "font-medium text-[var(--color-text-primary)]"
                              }`}
                            >
                              {display.title}
                            </p>
                            {metaLine ? (
                              <p className="mt-1 truncate text-xs text-[var(--color-text-tertiary)]">
                                {metaLine}
                              </p>
                            ) : null}
                          </div>
                          <span
                            className={`text-right font-medium ${
                              highlighted ? "text-emerald-300" : "text-[var(--color-text-primary)]"
                            }`}
                          >
                            {formatPriceDisplay(wine.price_display, wine.menu_label)}
                          </span>
                          <span
                            className={`text-right font-semibold ${
                              highlighted ? "text-emerald-300" : "text-[var(--color-text-tertiary)]"
                            }`}
                          >
                            {wine.match_percent}%
                          </span>
                        </div>
                      </div>
                    );
                  });
                })()
              ) : (
                <div className="px-5 py-6 text-sm text-[var(--color-text-tertiary)]">
                  No wines match the current filter set.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
