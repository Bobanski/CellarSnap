"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import Photo from "@/components/Photo";

const GRENACHE = "#7B1D3A";
const ROSE = "#C4607A";
const CHAMPAGNE = "#F0ECE4";
const FOG = "#8A8078";
const VIOGNIER = "#C9A84C";
const NEBBIOLO = "#4A3060";

type LibraryEntry = {
  id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  region: string | null;
  country: string | null;
  canonical_region: string | null;
  label_image_url: string | null;
  rating: number | null;
  consumed_at: string | null;
  wine_type: string | null;
};

type SortMode = "recent" | "vintage" | "rating";

type Filters = {
  region: string | null;
  producer: string | null;
  vintage: string | null;
  wineType: string | null;
};

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "recent", label: "Recent" },
  { value: "vintage", label: "Vintage" },
  { value: "rating", label: "Rating" },
];

const EMPTY_FILTERS: Filters = { region: null, producer: null, vintage: null, wineType: null };

function formatDate(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return null; }
}

function ratingDisplay(rating: number | null) {
  if (rating == null) return null;
  const stars = Math.round(rating / 20);
  return `${stars}/5`;
}

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Filter dropdown ────────────────────────────────────────────

function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: string[];
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  if (options.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold transition"
        style={{
          background: value ? `${GRENACHE}30` : "transparent",
          color: value ? ROSE : FOG,
          border: `1px solid ${value ? `${GRENACHE}40` : `${FOG}30`}`,
        }}
      >
        {value ?? label}
        <span className="text-[8px]">{open ? "\u25B2" : "\u25BC"}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-full z-20 mt-1 max-h-48 w-40 overflow-y-auto rounded-xl py-1 shadow-lg"
            style={{ background: "#1E1830", border: `1px solid ${NEBBIOLO}40` }}
          >
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              className="w-full px-3 py-1.5 text-left text-[11px] transition hover:bg-[var(--color-surface-hover)]"
              style={{ color: value ? FOG : ROSE }}
            >
              All {label}
            </button>
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => { onChange(opt); setOpen(false); }}
                className="w-full truncate px-3 py-1.5 text-left text-[11px] transition hover:bg-[var(--color-surface-hover)]"
                style={{ color: value === opt ? ROSE : CHAMPAGNE }}
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────

export function LibraryTab() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(false);

  const loadEntries = useCallback(async (afterCursor?: string | null) => {
    const isInitial = !afterCursor;
    if (isInitial) setLoading(true); else setLoadingMore(true);

    try {
      const params = new URLSearchParams({ limit: "50", sort: "consumed_at" });
      if (afterCursor) params.set("cursor", afterCursor);
      const res = await fetch(`/api/entries?${params}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const newEntries = (data.entries ?? []) as LibraryEntry[];
      setEntries((prev) => isInitial ? newEntries : [...prev, ...newEntries]);
      setCursor(data.next_cursor ?? null);
      setHasMore(Boolean(data.next_cursor));
    } catch { /* ignore */ }
    finally {
      if (isInitial) setLoading(false); else setLoadingMore(false);
    }
  }, []);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  // Extract unique filter values from loaded entries
  const filterOptions = useMemo(() => {
    const regions = new Set<string>();
    const producers = new Set<string>();
    const vintages = new Set<string>();
    const wineTypes = new Set<string>();

    for (const e of entries) {
      const region = e.canonical_region?.trim() || e.region?.trim();
      if (region) regions.add(region);
      if (e.producer?.trim()) producers.add(e.producer.trim());
      if (e.vintage?.trim()) vintages.add(e.vintage.trim());
      if (e.wine_type?.trim()) wineTypes.add(titleCase(e.wine_type.trim()));
    }

    return {
      regions: [...regions].sort(),
      producers: [...producers].sort(),
      vintages: [...vintages].sort((a, b) => b.localeCompare(a)), // newest first
      wineTypes: [...wineTypes].sort(),
    };
  }, [entries]);

  const activeFilterCount = [filters.region, filters.producer, filters.vintage, filters.wineType].filter(Boolean).length;

  // Filter + sort
  const displayEntries = useMemo(() => {
    let filtered = entries;

    // Text search
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter((e) =>
        (e.wine_name?.toLowerCase().includes(q)) ||
        (e.producer?.toLowerCase().includes(q)) ||
        (e.region?.toLowerCase().includes(q)) ||
        (e.canonical_region?.toLowerCase().includes(q)) ||
        (e.country?.toLowerCase().includes(q)) ||
        (e.vintage?.includes(q))
      );
    }

    // Dropdown filters
    if (filters.region) {
      filtered = filtered.filter((e) =>
        (e.canonical_region?.trim() || e.region?.trim()) === filters.region
      );
    }
    if (filters.producer) {
      filtered = filtered.filter((e) => e.producer?.trim() === filters.producer);
    }
    if (filters.vintage) {
      filtered = filtered.filter((e) => e.vintage?.trim() === filters.vintage);
    }
    if (filters.wineType) {
      filtered = filtered.filter((e) =>
        e.wine_type && titleCase(e.wine_type.trim()) === filters.wineType
      );
    }

    // Sort
    const sorted = [...filtered];
    if (sortMode === "rating") {
      sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    } else if (sortMode === "vintage") {
      sorted.sort((a, b) => (b.vintage ?? "").localeCompare(a.vintage ?? ""));
    }
    // "recent" is the default fetch order

    return sorted;
  }, [entries, searchQuery, sortMode, filters]);

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 py-2.5 px-3" style={{ borderBottom: `0.5px solid rgba(245,237,214,0.04)` }}>
            <div className="h-[76px] w-16 shrink-0 rounded-lg bg-[var(--color-surface-raised)]" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-36 rounded bg-[var(--color-surface-raised)]" />
              <div className="h-3 w-24 rounded bg-[var(--color-surface-raised)]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{ background: `linear-gradient(135deg, ${GRENACHE}10 0%, #0F0810 100%)`, border: `1px solid ${GRENACHE}15` }}
      >
        <p className="text-lg font-light" style={{ fontFamily: "var(--font-serif)", color: CHAMPAGNE }}>
          No wines logged yet.
        </p>
        <p className="mt-2 text-xs" style={{ color: FOG }}>
          Your wine library will appear here as you log entries.
        </p>
        <Link
          href="/entries/new"
          className="mt-4 inline-block rounded-full px-4 py-2 text-xs font-semibold transition hover:opacity-90"
          style={{ background: GRENACHE, color: CHAMPAGNE }}
        >
          Log your first wine
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* ── Controls row ─────────────────────────── */}
      <div className="mb-3 space-y-3">
        {/* Search + filter toggle */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="13" height="13" viewBox="0 0 20 20" fill="none">
              <circle cx="8.2" cy="8.2" r="5.4" stroke={FOG} strokeWidth="1.4" />
              <line x1="12" y1="12" x2="16.6" y2="16.6" stroke={FOG} strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search wines..."
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-2 pl-9 pr-3 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] outline-none transition focus:border-[var(--color-border-strong)]"
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersVisible(!filtersVisible)}
            className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-[10px] font-semibold transition"
            style={{
              background: filtersVisible || activeFilterCount > 0 ? `${GRENACHE}25` : "transparent",
              color: activeFilterCount > 0 ? ROSE : FOG,
              border: `1px solid ${activeFilterCount > 0 ? `${GRENACHE}40` : `${FOG}25`}`,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <line x1="1" y1="4" x2="15" y2="4" stroke="currentColor" strokeWidth="1.2" />
              <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.2" />
              <line x1="5" y1="12" x2="11" y2="12" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            {activeFilterCount > 0 && (
              <span className="rounded-full px-1 text-[9px]" style={{ background: GRENACHE, color: CHAMPAGNE }}>
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Sort pills */}
        <div className="flex items-center gap-1">
          <span className="mr-1 text-[10px]" style={{ color: FOG }}>Sort:</span>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSortMode(opt.value)}
              className="rounded-full px-2.5 py-1 text-[10px] font-semibold transition"
              style={{
                background: sortMode === opt.value ? `${GRENACHE}30` : "transparent",
                color: sortMode === opt.value ? ROSE : FOG,
                border: `1px solid ${sortMode === opt.value ? `${GRENACHE}40` : "transparent"}`,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Filter dropdowns */}
        {filtersVisible && (
          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown
              label="Region"
              value={filters.region}
              options={filterOptions.regions}
              onChange={(v) => setFilters((f) => ({ ...f, region: v }))}
            />
            <FilterDropdown
              label="Producer"
              value={filters.producer}
              options={filterOptions.producers}
              onChange={(v) => setFilters((f) => ({ ...f, producer: v }))}
            />
            <FilterDropdown
              label="Vintage"
              value={filters.vintage}
              options={filterOptions.vintages}
              onChange={(v) => setFilters((f) => ({ ...f, vintage: v }))}
            />
            <FilterDropdown
              label="Type"
              value={filters.wineType}
              options={filterOptions.wineTypes}
              onChange={(v) => setFilters((f) => ({ ...f, wineType: v }))}
            />
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="text-[10px] font-semibold transition hover:opacity-80"
                style={{ color: ROSE }}
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Result count ─────────────────────────── */}
      <p className="mb-3 text-xs" style={{ color: FOG }}>
        {searchQuery.trim() || activeFilterCount > 0 ? (
          <>{displayEntries.length} result{displayEntries.length !== 1 ? "s" : ""}</>
        ) : (
          <><span style={{ color: CHAMPAGNE, fontWeight: 600 }}>{entries.length}{hasMore ? "+" : ""}</span> wines</>
        )}
      </p>

      {/* ── Entry list ───────────────────────────── */}
      <div>
        {displayEntries.length === 0 && (searchQuery.trim() || activeFilterCount > 0) && (
          <div className="rounded-xl p-6 text-center" style={{ background: `${GRENACHE}08` }}>
            <p className="text-sm" style={{ color: FOG }}>No wines match your filters.</p>
          </div>
        )}
        {displayEntries.map((entry) => (
          <Link
            key={entry.id}
            href={`/entries/${entry.id}?from=profile`}
            className="group flex items-center gap-3 px-3.5 py-2.5"
            style={{ borderBottom: "0.5px solid rgba(245, 237, 214, 0.04)" }}
          >
            {/* Thumbnail */}
            <div
              className="flex shrink-0 items-center justify-center overflow-hidden"
              style={{
                width: 64,
                height: 76,
                borderRadius: 8,
                border: "0.5px solid var(--color-border)",
                background: "rgba(0,0,0,0.4)",
              }}
            >
              {entry.label_image_url ? (
                <Photo
                  src={entry.label_image_url}
                  alt={entry.wine_name ?? "Wine label"}
                  containerClassName="h-full w-full"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-4 w-4 text-[var(--color-text-tertiary)]">
                  <path d="M12 2C11 2 10 6 10 10c0 2 .5 3 2 3s2-1 2-3c0-4-1-8-2-8z" />
                  <path d="M10 13v7a2 2 0 0 0 4 0v-7" />
                </svg>
              )}
            </div>

            {/* Name + meta */}
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate" style={{ fontFamily: "var(--font-serif)", fontSize: 18, color: CHAMPAGNE }}>
                {entry.wine_name || "Unnamed wine"}
              </span>
              {(entry.producer || entry.canonical_region || entry.region || entry.country) && (
                <span className="truncate text-[13px]" style={{ color: FOG }}>
                  {[entry.producer, entry.canonical_region || entry.region || entry.country].filter(Boolean).join(" \u00B7 ")}
                </span>
              )}
              <div className="mt-0.5 flex items-center gap-2">
                {entry.vintage && (
                  <span className="text-[10px]" style={{ color: `${FOG}90` }}>{entry.vintage}</span>
                )}
                {entry.consumed_at && (
                  <span className="text-[10px]" style={{ color: `${FOG}70` }}>{formatDate(entry.consumed_at)}</span>
                )}
              </div>
            </div>

            {/* Rating */}
            {entry.rating != null && (
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-xs"
                style={{
                  fontFamily: "var(--font-serif)",
                  background: `${VIOGNIER}18`,
                  color: VIOGNIER,
                }}
              >
                {ratingDisplay(entry.rating)}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* ── Load more ────────────────────────────── */}
      {hasMore && !searchQuery.trim() && activeFilterCount === 0 && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => loadEntries(cursor)}
            disabled={loadingMore}
            className="rounded-full px-5 py-2 text-xs font-semibold transition hover:opacity-90 disabled:opacity-50"
            style={{ background: `${GRENACHE}20`, color: ROSE, border: `1px solid ${GRENACHE}25` }}
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
