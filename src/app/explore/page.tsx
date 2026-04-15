"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { toExploreSlug, WINE_REGIONS } from "@shared";
import AppShell from "@/components/AppShell";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SearchResult = {
  type: "grape" | "region" | "producer";
  name: string;
  href: string;
};

type TrendingItem = {
  rank: number;
  name: string;
  type: "region" | "grape" | "producer";
  slug: string;
  href: string;
  subtitle: string;
};

type FeaturedCard = {
  slug: string;
  display_name: string;
  tagline: string;
  hero_image_url: string | null;
  characteristics: string[];
  href: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POPULAR_GRAPES = [
  "Pinot Noir", "Cabernet Sauvignon", "Chardonnay", "Sauvignon Blanc",
  "Syrah / Shiraz", "Nebbiolo", "Riesling", "Grenache",
  "Merlot", "Malbec", "Tempranillo", "Sangiovese",
];

const POPULAR_REGIONS = [
  "Burgundy", "Bordeaux", "Napa Valley", "Tuscany",
  "Champagne", "Piedmont", "Rioja", "Barossa Valley",
  "Willamette Valley", "Mendoza", "Mosel", "Rhone Valley",
  "Sonoma", "Stellenbosch",
];

const TYPE_BADGE_STYLE: Record<string, string> = {
  region: "border-[var(--color-accent-primary)]/40 text-[var(--color-accent-secondary)]",
  grape: "border-[var(--color-accent-gold)]/40 text-[var(--color-accent-gold)]",
  producer: "border-[var(--color-accent-purple)]/40 text-[var(--color-accent-purple)]",
};

const COLLAPSE_KEY = "cellarsnap:explore-categories-collapsed";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExplorePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [producers, setProducers] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trending / editorial state
  const [trending, setTrending] = useState<TrendingItem[] | null>(null);
  const [featuredRegion, setFeaturedRegion] = useState<FeaturedCard | null>(null);
  const [grapeSpotlight, setGrapeSpotlight] = useState<FeaturedCard | null>(null);
  const [editorialLoading, setEditorialLoading] = useState(true);

  // Category collapse
  const [categoriesCollapsed, setCategoriesCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COLLAPSE_KEY) === "true";
  });

  const toggleCategories = () => {
    setCategoriesCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, String(next));
      return next;
    });
  };

  // Load user's most-logged producers (for search)
  useEffect(() => {
    let mounted = true;
    const loadProducers = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;
      const { data } = await supabase
        .from("wine_entries")
        .select("producer")
        .eq("user_id", user.id)
        .not("producer", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!mounted || !data) return;
      const counts = new Map<string, number>();
      for (const row of data) {
        const p = (row.producer as string)?.trim();
        if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
      }
      const sorted = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([name]) => name);
      if (mounted) setProducers(sorted);
    };
    loadProducers();
    return () => { mounted = false; };
  }, [supabase]);

  // Load trending + editorial data
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch("/api/explore/trending");
        if (!res.ok || !mounted) return;
        const data = await res.json();
        if (mounted) {
          setTrending(data.trending ?? []);
          setFeaturedRegion(data.featured_region ?? null);
          setGrapeSpotlight(data.grape_spotlight ?? null);
        }
      } catch {
        // Trending is non-critical — page still works without it
      } finally {
        if (mounted) setEditorialLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  // Search logic (preserved from previous implementation)
  const search = useCallback(async (q: string) => {
    const trimmed = q.trim().toLowerCase();
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const found: SearchResult[] = [];

    try {
      const res = await fetch(`/api/grapes?q=${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const data = await res.json();
        const grapes = Array.isArray(data.grapes) ? data.grapes : (Array.isArray(data) ? data : []);
        for (const g of grapes.slice(0, 5)) {
          const name = typeof g === "string" ? g : g.name;
          if (name) found.push({ type: "grape", name, href: `/explore/grape/${toExploreSlug(name)}` });
        }
      }
    } catch { /* ignore */ }

    const matchedRegions = WINE_REGIONS.filter(r =>
      r.toLowerCase().includes(trimmed)
    ).slice(0, 5);
    for (const r of matchedRegions) {
      found.push({ type: "region", name: r, href: `/explore/region/${toExploreSlug(r)}` });
    }

    const matchedProducers = producers.filter(p =>
      p.toLowerCase().includes(trimmed)
    ).slice(0, 5);
    for (const p of matchedProducers) {
      found.push({ type: "producer", name: p, href: `/explore/producer/${toExploreSlug(p)}` });
    }

    setResults(found);
    setSearching(false);
  }, [producers]);

  const onQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {};
    for (const r of results) {
      if (!groups[r.type]) groups[r.type] = [];
      groups[r.type].push(r);
    }
    return groups;
  }, [results]);

  const typeLabels: Record<string, string> = { grape: "Grapes", region: "Regions", producer: "Producers" };
  const isSearching = query.trim().length > 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 pb-20 pt-8">
        {/* ── Header ─────────────────────────────────── */}
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--color-accent-secondary)]">
          Explore
        </p>
        <h1
          className="mt-2 text-3xl font-light leading-tight"
          style={{ fontFamily: "var(--font-serif)", color: "var(--color-text-primary)" }}
        >
          Learn, discover, drink better.
        </h1>

        {/* ── Search ─────────────────────────────────── */}
        <div className="mt-6">
          <div className="relative">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]"
              width="14" height="14" viewBox="0 0 20 20" fill="currentColor"
            >
              <circle cx="8.2" cy="8.2" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <line x1="12" y1="12" x2="16.6" y2="16.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search grapes, regions, producers..."
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-3 pl-10 pr-4 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] outline-none transition focus:border-[var(--color-border-strong)]"
            />
          </div>
        </div>

        {/* ── Search results ─────────────────────────── */}
        {isSearching && (
          <div className="mt-4">
            {searching ? (
              <p className="text-sm text-[var(--color-text-secondary)]">Searching...</p>
            ) : results.length === 0 ? (
              <p className="text-sm text-[var(--color-text-tertiary)]">No results found.</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedResults).map(([type, items]) => (
                  <div key={type}>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                      {typeLabels[type] ?? type}
                    </p>
                    <div className="space-y-1">
                      {items.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="block rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] transition hover:bg-[var(--color-surface-raised)]"
                        >
                          {item.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Discovery content (hidden while searching) ── */}
        {!isSearching && (
          <>
            {/* ── Category cards ───────────────────────── */}
            <div className="mt-8">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                  Browse
                </p>
                <button
                  type="button"
                  onClick={toggleCategories}
                  className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-text-tertiary)] transition hover:text-[var(--color-text-secondary)]"
                >
                  {categoriesCollapsed ? "Show" : "Hide"}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-3">
                {[
                  {
                    label: "Regions",
                    subtitle: `From Burgundy to Barossa`,
                    href: "#regions",
                    icon: (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <circle cx="10" cy="10" r="7" fill="none" stroke="var(--color-accent-secondary)" strokeWidth="0.8" opacity="0.6" />
                        <circle cx="10" cy="10" r="3.5" fill="none" stroke="var(--color-accent-secondary)" strokeWidth="0.6" opacity="0.4" />
                        <circle cx="10" cy="5" r="1" fill="var(--color-accent-secondary)" opacity="0.8" />
                        <circle cx="14" cy="12" r="0.8" fill="var(--color-accent-secondary)" opacity="0.6" />
                      </svg>
                    ),
                  },
                  {
                    label: "Grapes",
                    subtitle: "Pinot Noir to Riesling",
                    href: "#grapes",
                    icon: (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="var(--color-accent-secondary)">
                        <circle cx="10" cy="7" r="2.2" opacity="0.4" />
                        <circle cx="7.5" cy="10.5" r="2.2" opacity="0.35" />
                        <circle cx="12.5" cy="10.5" r="2.2" opacity="0.4" />
                        <circle cx="10" cy="13.5" r="2.2" opacity="0.3" />
                        <line x1="10" y1="4.8" x2="10" y2="3.5" stroke="var(--color-accent-secondary)" strokeWidth="0.6" opacity="0.5" />
                      </svg>
                    ),
                  },
                  {
                    label: "Producers",
                    subtitle: "The makers behind the wine",
                    href: "#producers",
                    icon: (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <rect x="7" y="3" width="6" height="10" rx="3" fill="var(--color-accent-secondary)" opacity="0.3" />
                        <rect x="8.5" y="13" width="3" height="4" rx="0.5" fill="var(--color-accent-secondary)" opacity="0.5" />
                        <line x1="6" y1="17" x2="14" y2="17" stroke="var(--color-accent-secondary)" strokeWidth="0.8" opacity="0.4" />
                      </svg>
                    ),
                  },
                ].map((cat) => (
                  <div
                    key={cat.label}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-gradient-to-b from-[var(--color-accent-primary)]/15 to-[var(--color-surface-primary)] p-4 text-center"
                  >
                    {cat.icon}
                    <p className="text-xs font-semibold text-[var(--color-text-primary)]">
                      {cat.label}
                    </p>
                    <p className="text-[10px] leading-tight text-[var(--color-text-tertiary)]">
                      {cat.subtitle}
                    </p>
                  </div>
                ))}
              </div>

              {/* Collapsible browse lists */}
              {!categoriesCollapsed && (
                <div className="mt-5 space-y-5">
                  <div id="grapes">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                      Popular Grapes
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {POPULAR_GRAPES.map((g) => (
                        <Link
                          key={g}
                          href={`/explore/grape/${toExploreSlug(g)}`}
                          className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
                        >
                          {g}
                        </Link>
                      ))}
                    </div>
                  </div>

                  <div id="regions">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                      Popular Regions
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {POPULAR_REGIONS.map((r) => (
                        <Link
                          key={r}
                          href={`/explore/region/${toExploreSlug(r)}`}
                          className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
                        >
                          {r}
                        </Link>
                      ))}
                    </div>
                  </div>

                  <div id="producers">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                      Your Producers
                    </p>
                    {producers.length === 0 ? (
                      <p className="text-xs text-[var(--color-text-tertiary)]">
                        Log wines with producers to see them here.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {producers.map((p) => (
                          <Link
                            key={p}
                            href={`/explore/producer/${toExploreSlug(p)}`}
                            className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
                          >
                            {p}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Trending ─────────────────────────────── */}
            <div className="mt-10">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                Trending
              </p>

              {editorialLoading ? (
                <div className="mt-3 space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-4 rounded-xl bg-[var(--color-surface-primary)] px-4 py-3.5 animate-pulse">
                      <div className="h-5 w-4 rounded bg-[var(--color-surface-raised)]" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 w-28 rounded bg-[var(--color-surface-raised)]" />
                        <div className="h-2.5 w-20 rounded bg-[var(--color-surface-raised)]" />
                      </div>
                      <div className="h-5 w-14 rounded-full bg-[var(--color-surface-raised)]" />
                    </div>
                  ))}
                </div>
              ) : trending && trending.length > 0 ? (
                <div className="mt-3 divide-y divide-[var(--color-border)]">
                  {trending.map((item) => (
                    <Link
                      key={`${item.type}-${item.slug}`}
                      href={item.href}
                      className="flex items-center gap-4 rounded-xl px-4 py-3.5 transition hover:bg-[var(--color-surface-primary)]"
                    >
                      <span
                        className="w-4 text-center text-base font-light text-[var(--color-text-tertiary)]"
                        style={{ fontFamily: "var(--font-serif)" }}
                      >
                        {item.rank}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                          {item.name}
                        </p>
                        <p className="text-[10px] text-[var(--color-text-tertiary)]">
                          {item.subtitle}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${TYPE_BADGE_STYLE[item.type] ?? ""}`}
                      >
                        {item.type}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : !editorialLoading ? (
                <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">
                  Nothing trending yet. Log wines to light this up.
                </p>
              ) : null}
            </div>

            {/* ── Featured Region ──────────────────────── */}
            {featuredRegion && (
              <div className="mt-10">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                  Featured Region
                </p>
                <Link
                  href={featuredRegion.href}
                  className="mt-3 block overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-accent-primary)]/20 to-[var(--color-surface-primary)] transition hover:border-[var(--color-border-strong)]"
                >
                  <div className="p-5">
                    <h3
                      className="text-xl font-light"
                      style={{ fontFamily: "var(--font-serif)", color: "var(--color-text-primary)" }}
                    >
                      {featuredRegion.display_name}
                    </h3>
                    <p
                      className="mt-1.5 text-xs leading-relaxed"
                      style={{ fontFamily: "var(--font-serif)", color: "var(--color-text-secondary)" }}
                    >
                      {featuredRegion.tagline}
                    </p>
                    {featuredRegion.characteristics.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {featuredRegion.characteristics.map((c) => (
                          <span
                            key={c}
                            className="rounded-full border border-[var(--color-border)] px-2.5 py-0.5 text-[10px] text-[var(--color-text-tertiary)]"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                    <span className="mt-4 inline-block text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-accent-secondary)]">
                      Explore &rarr;
                    </span>
                  </div>
                </Link>
              </div>
            )}

            {/* ── Grape Spotlight ──────────────────────── */}
            {grapeSpotlight && (
              <div className="mt-10">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                  Grape Spotlight
                </p>
                <Link
                  href={grapeSpotlight.href}
                  className="mt-3 block overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] transition hover:border-[var(--color-border-strong)]"
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3
                          className="text-xl font-light"
                          style={{ fontFamily: "var(--font-serif)", color: "var(--color-text-primary)" }}
                        >
                          {grapeSpotlight.display_name}
                        </h3>
                        <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                          {grapeSpotlight.tagline}
                        </p>
                      </div>
                      <div className="h-10 w-10 shrink-0 rounded-full bg-[var(--color-accent-secondary)]/15" />
                    </div>
                    {grapeSpotlight.characteristics.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {grapeSpotlight.characteristics.map((c) => (
                          <span
                            key={c}
                            className="rounded-full border border-[var(--color-border)] px-2.5 py-0.5 text-[10px] text-[var(--color-text-tertiary)]"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              </div>
            )}

            {/* ── New to wine? CTA ─────────────────────── */}
            <div className="mt-10">
              <Link
                href="/explore/grape/pinot-noir"
                className="flex items-center gap-4 rounded-2xl border border-[var(--color-accent-secondary)]/20 bg-[var(--color-accent-primary)]/10 p-5 transition hover:border-[var(--color-accent-secondary)]/40"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-primary)]/20">
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="var(--color-accent-secondary)">
                    <rect x="4" y="2" width="12" height="16" rx="2" opacity="0.3" />
                    <line x1="7" y1="6" x2="13" y2="6" stroke="var(--color-accent-secondary)" strokeWidth="1" opacity="0.5" />
                    <line x1="7" y1="9" x2="13" y2="9" stroke="var(--color-accent-secondary)" strokeWidth="1" opacity="0.4" />
                    <line x1="7" y1="12" x2="11" y2="12" stroke="var(--color-accent-secondary)" strokeWidth="1" opacity="0.3" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                    New to wine?
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Start with the basics — grapes, regions, and how to taste.
                  </p>
                </div>
                <span className="text-sm text-[var(--color-text-tertiary)]">&rarr;</span>
              </Link>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
