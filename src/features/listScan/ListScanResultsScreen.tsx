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
  getListScanDisplayLines,
  getListScanFilterAccentTone,
  getListScanVarietalAccentTone,
  getListScanSectionTitle,
  getTopListScanRecommendations,
  listScanWineTypeLabels,
  LIST_SCAN_FILTERABLE_WINE_TYPES,
  resolveListScanWineType,
  type ListScanFilterAccentTone,
  type ListScanFilters,
  type ListScanFilterableWineType,
  type ListScanResult,
  type ListScanWineType,
} from "@shared";
import FacetMultiSelect from "@/features/listScan/FacetMultiSelect";
import RegionFilterSelect from "@/features/listScan/RegionFilterSelect";
import NavBar from "@/components/NavBar";
import { readListScanResult, saveListScanResult } from "@/lib/listScan/storage";

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

function formatWineListSubLabel(
  varietals: string[],
  wineType: ListScanWineType
) {
  if (varietals.length > 1) {
    if (wineType === "rose") {
      return "Rose blend";
    }
    if (wineType === "orange") {
      return "Orange blend";
    }
    if (wineType === "red") {
      return "Red blend";
    }
    if (wineType === "white") {
      return "White blend";
    }
    return "Blend";
  }
  if (varietals[0] === "Red Blend") {
    return "Red blend";
  }
  if (varietals[0] === "White Blend") {
    return "White blend";
  }
  if (varietals[0] === "Rose Blend") {
    return "Rose blend";
  }
  if (varietals[0] === "Orange Blend") {
    return "Orange blend";
  }
  return varietals[0] || "Varietal not parsed";
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
  const threshold =
    filters.min_match_percent > 0
      ? `Over ${filters.min_match_percent}%`
      : "Any match";
  const column = filters.show_match_column ? "showing % column" : "hiding % column";
  return `${threshold}, ${column}`;
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
      ? "border border-[#C9A84C]/70 bg-[#C9A84C]/18 text-[#f5e8bc]"
      : "border border-[#C9A84C]/30 bg-[#C9A84C]/8 text-[#e7d491] hover:border-[#C9A84C]/55";
  }
  if (tone === "red") {
    return selected
      ? "border border-[#4A3060] bg-[#4A3060] text-[#f3eef8]"
      : "border border-[#4A3060]/45 bg-[#4A3060]/15 text-[#dbcfe7] hover:border-[#4A3060]/75";
  }
  return selected
    ? "border border-emerald-400 bg-emerald-400 text-emerald-950"
    : "border border-white/10 text-zinc-200 hover:border-white/30";
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
  if (filters.min_match_percent > 0 || !filters.show_match_column) {
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
    <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-black/25">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
            {label}
          </span>
          <span className="mt-1 block truncate text-sm font-semibold text-zinc-100">
            {summary}
          </span>
        </span>
        <span className="text-sm font-semibold text-zinc-300">{open ? "v" : ">"}</span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-white/8 p-4">
          {children}
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
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
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <div className="h-3 w-24 animate-pulse rounded-full bg-white/10" />
        <div className="mt-4 h-8 w-72 animate-pulse rounded-full bg-white/10" />
        <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded-full bg-white/10" />
        <div className="mt-6 flex gap-3">
          <div className="h-10 w-32 animate-pulse rounded-full bg-white/10" />
          <div className="h-10 w-28 animate-pulse rounded-full bg-white/10" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-3xl border border-white/10 bg-white/5 p-6"
          >
            <div className="h-3 w-24 animate-pulse rounded-full bg-white/10" />
            <div className="mt-4 h-6 w-40 animate-pulse rounded-full bg-white/10" />
            <div className="mt-3 h-4 w-full animate-pulse rounded-full bg-white/10" />
            <div className="mt-2 h-4 w-3/4 animate-pulse rounded-full bg-white/10" />
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

  useEffect(() => {
    let isActive = true;
    const cachedResult = scanId ? readListScanResult(scanId) : null;
    const initialStateTimer = window.setTimeout(() => {
      if (!isActive) {
        return;
      }
      setResult(scanId ? cachedResult ?? undefined : null);
      setLoadError(null);
    }, 0);

    if (!scanId) {
      return () => {
        isActive = false;
        window.clearTimeout(initialStateTimer);
      };
    }

    const loadSavedResult = async () => {
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
      window.clearTimeout(initialStateTimer);
    };
  }, [scanId]);

  const filteredWines = useMemo(
    () => (result ? filterListScanWines(result.wines, filters) : []),
    [filters, result]
  );
  const topRecommendations = useMemo(
    () => getTopListScanRecommendations(filteredWines, 3),
    [filteredWines]
  );
  const highlightedIds = useMemo(
    () => new Set(topRecommendations.map((wine) => wine.id)),
    [topRecommendations]
  );
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
  const activeFilterCount = useMemo(
    () =>
      derivedFacets
        ? countActiveFilterGroups(filters, derivedFacets.wine_types)
        : 0,
    [derivedFacets, filters]
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
      <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
        <div className="mx-auto w-full max-w-6xl space-y-8">
          <NavBar />
          <ResultsLoadingSkeleton />
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
        <div className="mx-auto w-full max-w-6xl space-y-8">
          <NavBar />
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-sm text-zinc-300">
            {loadError ?? "This scan result is no longer available in the current session."}
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/list-scan"
                className="inline-flex rounded-full bg-amber-400 px-4 py-2 font-semibold text-zinc-950 transition hover:bg-amber-300"
              >
                Scan another
              </Link>
              <Link
                href="/list-scan/history"
                className="inline-flex rounded-full border border-white/10 px-4 py-2 font-semibold text-zinc-100 transition hover:border-white/30"
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
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <NavBar />

        <header className="space-y-3">
          <span className="block text-xs uppercase tracking-[0.3em] text-amber-300/70">
            List results
          </span>
          <h1 className="text-3xl font-semibold text-zinc-50">
            {result.venue_name || result.list_title || "Scanned wine list"}
          </h1>
          <p className="text-sm text-zinc-300">
            Filter the scanned list, review the current top 3, and browse the full
            list in its original order.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/list-scan"
              className="inline-flex rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
            >
              Scan another
            </Link>
            <Link
              href="/list-scan/history"
              className="inline-flex rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-white/30"
            >
              My scans
            </Link>
          </div>
        </header>

        {loadError ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-zinc-200 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)]">
            {loadError}
          </section>
        ) : null}

        {result.score_summary.warning ? (
          <section className="rounded-3xl border border-amber-300/25 bg-amber-400/10 p-5 text-sm text-amber-50 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/80">
              Match scoring
            </p>
            <p className="mt-2 text-sm leading-6 text-amber-50">
              {result.score_summary.warning}
            </p>
          </section>
        ) : null}

        <section className="space-y-5 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Filters
              </p>
              <h2 className="text-xl font-semibold text-zinc-50">
                Narrow the scanned list
              </h2>
            </div>

            <button
              type="button"
              onClick={toggleFiltersVisibility}
              aria-expanded={filtersVisible}
              className="inline-flex items-center gap-3 self-start rounded-full border border-white/12 bg-black/25 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-white/25 hover:bg-black/35"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-100">
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
                <span className="rounded-full border border-white/10 bg-white/8 px-2 py-0.5 text-[11px] font-semibold text-zinc-100">
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
                  summary={buildPriceSummary(filters)}
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
                            ? "bg-amber-400 text-zinc-950"
                            : "border border-white/10 text-zinc-200 hover:border-white/30"
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
                        setFilters((current) => ({
                          ...current,
                          [current.price_mode === "under" ? "price_max" : "price_min"]:
                            parseNonNegativePriceInput(event.target.value),
                        }))
                      }
                      className="rounded-xl border border-white/10 bg-[#171210] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300/60 focus:outline-none"
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
                        setFilters((current) => ({
                          ...current,
                          [current.price_mode === "over" ? "price_min" : "price_max"]:
                            parseNonNegativePriceInput(event.target.value),
                        }))
                      }
                      className="rounded-xl border border-white/10 bg-[#171210] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300/60 focus:outline-none"
                    />
                  ) : null}
                </div>
                </FilterDropdown>
              </div>

              <div className={wineTypeOpen ? "col-span-2 min-w-0" : "min-w-0"}>
                <FilterDropdown
                  label="Wine type"
                  summary={buildWineTypeSummary(
                    filters.included_wine_types,
                    derivedFacets?.wine_types ?? []
                  )}
                  open={wineTypeOpen}
                  onToggle={() => setWineTypeOpen((current) => !current)}
                >
                <div className="flex flex-wrap gap-2">
                  {LIST_SCAN_FILTERABLE_WINE_TYPES.map((type) => {
                    const available = derivedFacets?.wine_types.includes(type) ?? false;
                    const selected = filters.included_wine_types.includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        disabled={!available}
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
                        )} ${available ? "" : "cursor-not-allowed opacity-35"}`}
                      >
                        {listScanWineTypeLabels[type]}
                      </button>
                    );
                  })}
                </div>
                </FilterDropdown>
              </div>

              <div className={varietalOpen ? "col-span-2 min-w-0" : "min-w-0"}>
                <FacetMultiSelect
                  label="Varietal"
                  placeholder="Type a varietal from this list"
                  options={derivedFacets?.varietals ?? []}
                  selected={filters.selected_varietals}
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

              <div className={regionOpen ? "col-span-2 min-w-0" : "min-w-0"}>
                <RegionFilterSelect
                  regionGroups={regionGroups}
                  selected={filters.selected_regions}
                  onChange={(selected_regions) =>
                    setFilters((current) => ({ ...current, selected_regions }))
                  }
                  open={regionOpen}
                  onOpenChange={setRegionOpen}
                />
              </div>

              <div className={matchOpen ? "col-span-2 min-w-0" : "min-w-0"}>
                <FilterDropdown
                  label="Match"
                  summary={buildMatchSummary(filters)}
                  open={matchOpen}
                  onToggle={() => setMatchOpen((current) => !current)}
                >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-zinc-300">Show wines over</span>
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
                    className="w-24 rounded-xl border border-white/10 bg-[#171210] px-3 py-2 text-center text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-300/60 focus:outline-none"
                  />
                  <span className="text-sm text-zinc-300">%</span>
                </div>

                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    checked={filters.show_match_column}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        show_match_column: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-white/20 accent-emerald-400"
                  />
                  Show % match in full list
                </label>
                </FilterDropdown>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/8 bg-black/15 px-4 py-4 text-sm text-zinc-400">
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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Top 3
            </p>
            <h2 className="text-xl font-semibold text-zinc-50">
              Current recommendations
            </h2>
          </div>

          {topRecommendations.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {topRecommendations.map((wine, index) => (
                (() => {
                  const display = getListScanDisplayLines(wine);
                  const subLabel = formatWineListSubLabel(
                    wine.varietals,
                    resolveListScanWineType(wine)
                  );
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
                          <h3 className="text-lg font-semibold text-zinc-50">
                            {display.title}
                          </h3>
                          {subLabel ? (
                            <p className="mt-1 text-sm leading-6 text-zinc-300">
                              {subLabel}
                            </p>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-right text-base font-semibold text-emerald-100">
                          {formatPriceDisplay(wine.price_display, wine.menu_label)}
                        </span>
                      </div>

                      <p className="mt-4 text-sm leading-6 text-zinc-200">{wine.rationale}</p>
                    </article>
                  );
                })()
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-zinc-300">
              No wines match the current filters.
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Full list
            </p>
            <h2 className="text-xl font-semibold text-zinc-50">
              Filtered wines in uploaded list order
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {filteredWines.length} of {result.wines.length} shown
            </p>
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#120f0e]">
            <div
              className={`grid gap-3 border-b border-white/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400 ${
                filters.show_match_column
                  ? "grid-cols-[minmax(0,1fr)_120px_110px]"
                  : "grid-cols-[minmax(0,1fr)_120px]"
              }`}
            >
              <span>Wine</span>
              <span className="text-center">Price</span>
              {filters.show_match_column ? (
                <span className="whitespace-nowrap text-right">% match</span>
              ) : null}
            </div>

            <div className="max-h-[520px] overflow-y-auto">
              {filteredWines.length > 0 ? (
                (() => {
                  let lastSectionType: string | null = null;
                  return filteredWines.map((wine) => {
                    const highlighted = highlightedIds.has(wine.id);
                    const display = getListScanDisplayLines(wine);
                    const subLabel = formatWineListSubLabel(
                      wine.varietals,
                      resolveListScanWineType(wine)
                    );
                    const resolvedType = resolveListScanWineType(wine);
                    const showSectionHeader = resolvedType !== lastSectionType;
                    lastSectionType = resolvedType;

                    return (
                      <div key={wine.id}>
                        {showSectionHeader ? (
                          <div className="border-b border-white/8 bg-white/4 px-5 py-2">
                            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                              {getListScanSectionTitle(resolvedType)}
                            </span>
                          </div>
                        ) : null}
                        <div
                          className={`grid gap-3 border-b border-white/6 px-5 py-3 text-sm ${
                            filters.show_match_column
                              ? "grid-cols-[minmax(0,1fr)_120px_110px]"
                              : "grid-cols-[minmax(0,1fr)_120px]"
                          }`}
                        >
                          <div className="min-w-0">
                            <p
                              className={`truncate ${
                                highlighted
                                  ? "font-bold text-emerald-300"
                                  : "font-medium text-zinc-100"
                              }`}
                            >
                              {display.title}
                            </p>
                            <p className="mt-1 truncate text-xs text-zinc-500">
                              {subLabel}
                            </p>
                          </div>
                          <span
                            className={`text-right font-medium ${
                              highlighted ? "text-emerald-300" : "text-zinc-200"
                            }`}
                          >
                            {formatPriceDisplay(wine.price_display, wine.menu_label)}
                          </span>
                          {filters.show_match_column ? (
                            <span
                              className={`text-right font-semibold ${
                                highlighted ? "text-emerald-300" : "text-zinc-400"
                              }`}
                            >
                              {wine.match_percent}%
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  });
                })()
              ) : (
                <div className="px-5 py-6 text-sm text-zinc-400">
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
