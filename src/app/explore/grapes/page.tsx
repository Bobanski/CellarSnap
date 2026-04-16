"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { toExploreSlug } from "@shared";
import AppShell from "@/components/AppShell";

const POPULAR_GRAPES = [
  "Pinot Noir", "Cabernet Sauvignon", "Chardonnay", "Sauvignon Blanc",
  "Syrah / Shiraz", "Nebbiolo", "Riesling", "Grenache",
  "Merlot", "Malbec", "Tempranillo", "Sangiovese",
];

const ALL_GRAPES = [
  ...POPULAR_GRAPES,
  "Gamay", "Mourvèdre", "Cabernet Franc", "Viognier", "Chenin Blanc",
  "Gewürztraminer", "Pinot Grigio", "Albariño", "Grüner Veltliner",
  "Barbera", "Dolcetto", "Nero d'Avola", "Primitivo", "Zinfandel",
  "Garnacha", "Monastrell", "Verdejo", "Torrontés", "Carménère",
  "Petite Sirah", "Tannat", "Pinotage", "Cinsault", "Carignan",
  "Marsanne", "Roussanne", "Vermentino", "Fiano", "Greco",
  "Aglianico", "Corvina", "Glera", "Muscat", "Sémillon",
];

type GrapeResult = { name: string; href: string };

export default function GrapesBrowsePage() {
  const [query, setQuery] = useState("");
  const [apiResults, setApiResults] = useState<GrapeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim().toLowerCase();
    if (!trimmed) {
      setApiResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const found: GrapeResult[] = [];

    try {
      const res = await fetch(`/api/grapes?q=${encodeURIComponent(trimmed)}&limit=12`);
      if (res.ok) {
        const data = await res.json();
        const grapes = Array.isArray(data.grapes) ? data.grapes : [];
        for (const g of grapes) {
          const name = typeof g === "string" ? g : g.name;
          if (name) found.push({ name, href: `/explore/grape/${toExploreSlug(name)}` });
        }
      }
    } catch { /* ignore */ }

    // Also filter the static list
    const staticMatches = ALL_GRAPES
      .filter((g) => g.toLowerCase().includes(trimmed))
      .filter((g) => !found.some((f) => f.name.toLowerCase() === g.toLowerCase()));
    for (const g of staticMatches.slice(0, 8)) {
      found.push({ name: g, href: `/explore/grape/${toExploreSlug(g)}` });
    }

    setApiResults(found);
    setSearching(false);
  }, []);

  const onQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  const isSearching = query.trim().length > 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 pb-20 pt-8">
        <Link
          href="/explore"
          className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-text-tertiary)] transition hover:text-[var(--color-text-secondary)]"
        >
          &larr; Explore
        </Link>

        <h1
          className="mt-4 text-3xl font-light leading-tight"
          style={{ fontFamily: "var(--font-serif)", color: "var(--color-text-primary)" }}
        >
          Grapes
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          From bold Cabernet to delicate Pinot — explore the varieties that shape every glass.
        </p>

        {/* Search */}
        <div className="mt-6 relative">
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
            placeholder="Search grapes..."
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-3 pl-10 pr-4 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] outline-none transition focus:border-[var(--color-border-strong)]"
          />
        </div>

        {/* Search results */}
        {isSearching && (
          <div className="mt-4">
            {searching ? (
              <p className="text-sm text-[var(--color-text-secondary)]">Searching...</p>
            ) : apiResults.length === 0 ? (
              <p className="text-sm text-[var(--color-text-tertiary)]">No grapes found.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {apiResults.map((g) => (
                  <Link
                    key={g.name}
                    href={g.href}
                    className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-secondary)]/40"
                  >
                    {g.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Popular grapes */}
        {!isSearching && (
          <>
            <div className="mt-8">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                Popular
              </p>
              <div className="flex flex-wrap gap-2">
                {POPULAR_GRAPES.map((g) => (
                  <Link
                    key={g}
                    href={`/explore/grape/${toExploreSlug(g)}`}
                    className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3.5 py-2 text-xs text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-secondary)]/40 hover:bg-[var(--color-accent-primary)]/10"
                  >
                    {g}
                  </Link>
                ))}
              </div>
            </div>

            <div className="mt-8">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                All Varieties
              </p>
              <div className="flex flex-wrap gap-2">
                {ALL_GRAPES.filter((g) => !POPULAR_GRAPES.includes(g)).map((g) => (
                  <Link
                    key={g}
                    href={`/explore/grape/${toExploreSlug(g)}`}
                    className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
                  >
                    {g}
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
