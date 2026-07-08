"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { toExploreSlug, WINE_REGIONS } from "@shared";
import AppShell from "@/components/AppShell";
import { Chip } from "@/components/ui/Button";

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
  type: "region" | "grape";
  slug: string;
  href: string;
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

  // Load user's producers for search
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
      if (mounted) setProducers([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([n]) => n));
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
      } catch { /* non-critical */ }
      finally { if (mounted) setEditorialLoading(false); }
    };
    load();
    return () => { mounted = false; };
  }, []);

  // Search logic
  const search = useCallback(async (q: string) => {
    const trimmed = q.trim().toLowerCase();
    if (!trimmed) { setResults([]); setSearching(false); return; }
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

    for (const r of WINE_REGIONS.filter(r => r.toLowerCase().includes(trimmed)).slice(0, 5)) {
      found.push({ type: "region", name: r, href: `/explore/region/${toExploreSlug(r)}` });
    }
    for (const p of producers.filter(p => p.toLowerCase().includes(trimmed)).slice(0, 5)) {
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
      <div className="mx-auto max-w-2xl px-4 pt-8 pb-[var(--app-bottom-nav-height)]">
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
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-accent-secondary)]">
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
            <div className="mt-8 grid grid-cols-3 gap-3">
              {[
                {
                  label: "Regions",
                  subtitle: "From Burgundy to Barossa",
                  href: "/explore/regions",
                  icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="9" stroke="var(--color-accent-secondary)" strokeWidth="0.8" opacity="0.5" />
                      <circle cx="12" cy="12" r="4.5" stroke="var(--color-accent-secondary)" strokeWidth="0.6" opacity="0.3" />
                      <circle cx="12" cy="5" r="1.2" fill="var(--color-accent-secondary)" opacity="0.8" />
                      <circle cx="17" cy="14" r="1" fill="var(--color-accent-secondary)" opacity="0.6" />
                      <circle cx="7" cy="16" r="0.8" fill="var(--color-accent-secondary)" opacity="0.4" />
                    </svg>
                  ),
                },
                {
                  label: "Grapes",
                  subtitle: "Pinot Noir to Riesling",
                  href: "/explore/grapes",
                  icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--color-accent-secondary)">
                      <circle cx="12" cy="8" r="2.6" opacity="0.45" />
                      <circle cx="9" cy="12.5" r="2.6" opacity="0.35" />
                      <circle cx="15" cy="12.5" r="2.6" opacity="0.45" />
                      <circle cx="12" cy="16.5" r="2.6" opacity="0.3" />
                      <line x1="12" y1="5.4" x2="12" y2="3.5" stroke="var(--color-accent-secondary)" strokeWidth="0.7" opacity="0.6" />
                      <path d="M12 3.5 Q14.5 2.5 15.5 3.5" stroke="var(--color-accent-secondary)" strokeWidth="0.5" fill="none" opacity="0.4" />
                    </svg>
                  ),
                },
                {
                  label: "Producers",
                  subtitle: "The makers behind the wine",
                  href: "/explore/producers",
                  icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <rect x="8" y="3" width="8" height="13" rx="4" fill="var(--color-accent-secondary)" opacity="0.35" />
                      <rect x="10" y="16" width="4" height="4" rx="0.6" fill="var(--color-accent-secondary)" opacity="0.5" />
                      <line x1="7" y1="20" x2="17" y2="20" stroke="var(--color-accent-secondary)" strokeWidth="0.8" opacity="0.4" />
                    </svg>
                  ),
                },
              ].map((cat) => (
                <Link
                  key={cat.label}
                  href={cat.href}
                  className="flex flex-col items-center gap-2.5 rounded-2xl border border-[var(--color-accent-secondary)]/12 p-5 text-center transition hover:border-[var(--color-accent-secondary)]/30"
                  style={{
                    background: "linear-gradient(to bottom, rgba(123,29,58,0.18) 0%, var(--color-surface-primary) 100%)",
                  }}
                >
                  <div className="flex h-10 w-10 items-center justify-center">
                    {cat.icon}
                  </div>
                  <p className="text-xs font-semibold text-[var(--color-text-primary)]">
                    {cat.label}
                  </p>
                  <p className="text-[10px] leading-tight text-[var(--color-text-tertiary)]">
                    {cat.subtitle}
                  </p>
                </Link>
              ))}
            </div>

            {/* ── Trending ─────────────────────────────── */}
            <div className="mt-10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-accent-secondary)]">
                Trending
              </p>

              {editorialLoading ? (
                <div className="mt-3 space-y-1">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-4 rounded-xl px-4 py-3.5 animate-pulse">
                      <div className="h-5 w-4 rounded bg-[var(--color-surface-raised)]" />
                      <div className="flex-1">
                        <div className="h-3.5 w-28 rounded bg-[var(--color-surface-raised)]" />
                      </div>
                      <div className="h-5 w-16 rounded-full bg-[var(--color-surface-raised)]" />
                    </div>
                  ))}
                </div>
              ) : trending && trending.length > 0 ? (
                <div className="mt-3 divide-y divide-[var(--color-border)]">
                  {trending.map((item) => (
                    <Link
                      key={`${item.type}-${item.slug}`}
                      href={item.href}
                      className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-[var(--color-surface-primary)]/60"
                    >
                      <span
                        className="w-5 text-center text-lg font-light text-[var(--color-text-tertiary)]"
                        style={{ fontFamily: "var(--font-serif)" }}
                      >
                        {item.rank}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                          {item.name}
                        </p>
                      </div>
                      {/* Design-audit spec D: taxonomy chips are neutral by
                          default — gold/rose per-category coloring removed
                          (gold is reserved for premium/Réserve moments). */}
                      <Chip
                        variant="tag"
                        tone="neutral"
                        className="shrink-0 text-[10px] uppercase tracking-[0.1em]"
                      >
                        {item.type}
                      </Chip>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">
                  Nothing trending yet. Log wines to light this up.
                </p>
              )}
            </div>

            {/* ── Featured Region ──────────────────────── */}
            {featuredRegion && (
              <div className="mt-10">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-accent-secondary)]">
                  Featured Region
                </p>
                <Link
                  href={featuredRegion.href}
                  className="mt-3 block overflow-hidden rounded-2xl border border-[var(--color-accent-secondary)]/12 transition hover:border-[var(--color-accent-secondary)]/30"
                  style={{
                    background: "linear-gradient(135deg, rgba(123,29,58,0.25) 0%, rgba(74,48,96,0.15) 50%, var(--color-surface-primary) 100%)",
                  }}
                >
                  <div className="p-6">
                    <h3
                      className="text-2xl font-light"
                      style={{ fontFamily: "var(--font-serif)", color: "var(--color-text-primary)" }}
                    >
                      {featuredRegion.display_name}
                    </h3>
                    <p
                      className="mt-2 text-xs leading-relaxed"
                      style={{ fontFamily: "var(--font-serif)", color: "var(--color-text-secondary)" }}
                    >
                      {featuredRegion.tagline}
                    </p>
                    {featuredRegion.characteristics.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1.5">
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
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-accent-secondary)]">
                  Grape Spotlight
                </p>
                <Link
                  href={grapeSpotlight.href}
                  className="mt-3 block overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] transition hover:border-[var(--color-border-strong)]"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h3
                          className="text-2xl font-light"
                          style={{ fontFamily: "var(--font-serif)", color: "var(--color-text-primary)" }}
                        >
                          {grapeSpotlight.display_name}
                        </h3>
                        <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                          {grapeSpotlight.tagline}
                        </p>
                      </div>
                      <div className="h-12 w-12 shrink-0 rounded-full bg-[var(--color-accent-secondary)]/12" />
                    </div>
                    {grapeSpotlight.characteristics.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1.5">
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
                className="flex items-center gap-4 rounded-2xl border border-[var(--color-accent-secondary)]/15 p-5 transition hover:border-[var(--color-accent-secondary)]/30"
                style={{
                  background: "linear-gradient(135deg, rgba(123,29,58,0.12) 0%, var(--color-surface-primary) 100%)",
                }}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-primary)]/15">
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
