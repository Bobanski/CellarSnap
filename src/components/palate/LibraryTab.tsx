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

type SortMode = "recent" | "rating" | "name";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "recent", label: "Recent" },
  { value: "rating", label: "Top Rated" },
  { value: "name", label: "A-Z" },
];

function formatDate(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return null; }
}

function ratingDisplay(rating: number | null) {
  if (rating == null) return null;
  // Convert 1-100 to 1-5 display
  const stars = Math.round(rating / 20);
  return `${stars}/5`;
}

export function LibraryTab() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

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

  // Filter + sort
  const displayEntries = useMemo(() => {
    let filtered = entries;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      filtered = entries.filter((e) =>
        (e.wine_name?.toLowerCase().includes(q)) ||
        (e.producer?.toLowerCase().includes(q)) ||
        (e.region?.toLowerCase().includes(q)) ||
        (e.canonical_region?.toLowerCase().includes(q)) ||
        (e.country?.toLowerCase().includes(q)) ||
        (e.vintage?.includes(q))
      );
    }

    const sorted = [...filtered];
    if (sortMode === "rating") {
      sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    } else if (sortMode === "name") {
      sorted.sort((a, b) => (a.wine_name ?? "").localeCompare(b.wine_name ?? ""));
    }
    // "recent" is the default fetch order

    return sorted;
  }, [entries, searchQuery, sortMode]);

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
      {/* Search + Sort controls */}
      <div className="mb-4 flex items-center gap-3">
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
        <div className="flex shrink-0 gap-1">
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
      </div>

      {/* Entry count */}
      <p className="mb-3 text-xs" style={{ color: FOG }}>
        {searchQuery.trim() ? (
          <>{displayEntries.length} result{displayEntries.length !== 1 ? "s" : ""}</>
        ) : (
          <><span style={{ color: CHAMPAGNE, fontWeight: 600 }}>{entries.length}{hasMore ? "+" : ""}</span> wines</>
        )}
      </p>

      {/* Entry list */}
      <div>
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
              {entry.consumed_at && (
                <span className="mt-0.5 text-[10px]" style={{ color: `${FOG}90` }}>
                  {formatDate(entry.consumed_at)}
                </span>
              )}
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

      {/* Load more */}
      {hasMore && !searchQuery.trim() && (
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
