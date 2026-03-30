"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { toExploreSlug, WINE_REGIONS } from "@shared";
import AppShell from "@/components/AppShell";

type SearchResult = {
  type: "grape" | "region" | "producer";
  name: string;
  href: string;
};

type PalateEntry = {
  name: string;
  type: "grape" | "region";
};

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

export default function ExplorePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [palateEntries, setPalateEntries] = useState<PalateEntry[]>([]);
  const [palateLoaded, setPalateLoaded] = useState(false);
  const [producers, setProducers] = useState<string[]>([]);
  const [grapesOpen, setGrapesOpen] = useState(true);
  const [regionsOpen, setRegionsOpen] = useState(true);
  const [producersOpen, setProducersOpen] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load palate data for "For You"
  useEffect(() => {
    let mounted = true;
    const loadPalate = async () => {
      try {
        const res = await fetch("/api/palate", { cache: "no-store" });
        if (!res.ok || !mounted) return;
        const data = await res.json();
        const entries: PalateEntry[] = [];
        if (data.top_grapes && Array.isArray(data.top_grapes)) {
          for (const g of data.top_grapes) {
            if (typeof g.name === "string") entries.push({ name: g.name, type: "grape" });
          }
        }
        if (data.top_regions && Array.isArray(data.top_regions)) {
          for (const r of data.top_regions) {
            if (typeof r.name === "string") entries.push({ name: r.name, type: "region" });
          }
        }
        if (mounted) {
          setPalateEntries(entries);
          setPalateLoaded(true);
        }
      } catch {
        if (mounted) setPalateLoaded(true);
      }
    };
    loadPalate();
    return () => { mounted = false; };
  }, []);

  // Load user's most-logged producers
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

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim().toLowerCase();
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const found: SearchResult[] = [];

    // Search grapes via API
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

    // Search regions locally
    const matchedRegions = WINE_REGIONS.filter(r =>
      r.toLowerCase().includes(trimmed)
    ).slice(0, 5);
    for (const r of matchedRegions) {
      found.push({ type: "region", name: r, href: `/explore/region/${toExploreSlug(r)}` });
    }

    // Search producers from user entries
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

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 pb-20 pt-8">
        {/* Header */}
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--color-text-tertiary)]">
          EXPLORE
        </p>
        <h1
          className="mt-2 text-3xl font-light leading-tight"
          style={{ fontFamily: "var(--font-serif)", color: "var(--color-text-primary)" }}
        >
          Discover wines matched to your taste.
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Browse grapes, regions, and producers — or search for something specific.
        </p>

        {/* Search */}
        <div className="mt-6">
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search grapes, regions, producers..."
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] outline-none transition focus:border-[var(--color-border-strong)]"
          />
        </div>

        {/* Search results */}
        {query.trim() && (
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

        {/* For You */}
        {!query.trim() && palateLoaded && (
          <div className="mt-8">
            <h2
              className="text-lg font-light"
              style={{ fontFamily: "var(--font-serif)", color: "var(--color-text-primary)" }}
            >
              For You
            </h2>
            {palateEntries.length < 8 ? (
              <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">
                Log more wines to unlock personalized recommendations. Your palate profile builds as you explore.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {palateEntries.slice(0, 12).map((entry) => (
                  <Link
                    key={`${entry.type}-${entry.name}`}
                    href={`/explore/${entry.type}/${toExploreSlug(entry.name)}`}
                    className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
                  >
                    {entry.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Browse by Category */}
        {!query.trim() && (
          <div className="mt-10 space-y-6">
            <h2
              className="text-lg font-light"
              style={{ fontFamily: "var(--font-serif)", color: "var(--color-text-primary)" }}
            >
              Browse by Category
            </h2>

            {/* Grapes */}
            <div>
              <button
                type="button"
                onClick={() => setGrapesOpen(!grapesOpen)}
                className="flex w-full items-center justify-between py-1 text-left"
              >
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                  Grapes
                </span>
                <span className="text-[var(--color-text-tertiary)]">{grapesOpen ? "\u2212" : "+"}</span>
              </button>
              {grapesOpen && (
                <div className="mt-2 flex flex-wrap gap-2">
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
              )}
            </div>

            {/* Regions */}
            <div>
              <button
                type="button"
                onClick={() => setRegionsOpen(!regionsOpen)}
                className="flex w-full items-center justify-between py-1 text-left"
              >
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                  Regions
                </span>
                <span className="text-[var(--color-text-tertiary)]">{regionsOpen ? "\u2212" : "+"}</span>
              </button>
              {regionsOpen && (
                <div className="mt-2 flex flex-wrap gap-2">
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
              )}
            </div>

            {/* Producers */}
            <div>
              <button
                type="button"
                onClick={() => setProducersOpen(!producersOpen)}
                className="flex w-full items-center justify-between py-1 text-left"
              >
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                  Producers
                </span>
                <span className="text-[var(--color-text-tertiary)]">{producersOpen ? "\u2212" : "+"}</span>
              </button>
              {producersOpen && (
                producers.length === 0 ? (
                  <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">
                    Log wines with producers to see them here.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
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
                )
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
