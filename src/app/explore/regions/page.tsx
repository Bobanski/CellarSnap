"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toExploreSlug, WINE_REGIONS } from "@shared";
import AppShell from "@/components/AppShell";

const POPULAR_REGIONS = [
  "Burgundy", "Bordeaux", "Napa Valley", "Tuscany",
  "Champagne", "Piedmont", "Rioja", "Barossa Valley",
  "Willamette Valley", "Mendoza", "Mosel", "Rhone Valley",
  "Sonoma", "Stellenbosch",
];

export default function RegionsBrowsePage() {
  const [query, setQuery] = useState("");

  const isSearching = query.trim().length > 0;

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];
    return WINE_REGIONS.filter((r) => r.toLowerCase().includes(trimmed));
  }, [query]);

  // Group non-popular regions by first letter for an A-Z browse
  const allRegions = useMemo(() => {
    const remaining = WINE_REGIONS.filter((r) => !POPULAR_REGIONS.includes(r)).sort();
    const groups = new Map<string, string[]>();
    for (const r of remaining) {
      const letter = r[0].toUpperCase();
      if (!groups.has(letter)) groups.set(letter, []);
      groups.get(letter)!.push(r);
    }
    return [...groups.entries()];
  }, []);

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
          Regions
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          From Burgundy to Barossa — the places that give wine its character.
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
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search regions..."
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-3 pl-10 pr-4 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] outline-none transition focus:border-[var(--color-border-strong)]"
          />
        </div>

        {/* Search results */}
        {isSearching && (
          <div className="mt-4">
            {filtered.length === 0 ? (
              <p className="text-sm text-[var(--color-text-tertiary)]">No regions found.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {filtered.map((r) => (
                  <Link
                    key={r}
                    href={`/explore/region/${toExploreSlug(r)}`}
                    className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-secondary)]/40"
                  >
                    {r}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Browse */}
        {!isSearching && (
          <>
            <div className="mt-8">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                Popular
              </p>
              <div className="flex flex-wrap gap-2">
                {POPULAR_REGIONS.map((r) => (
                  <Link
                    key={r}
                    href={`/explore/region/${toExploreSlug(r)}`}
                    className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3.5 py-2 text-xs text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-secondary)]/40 hover:bg-[var(--color-accent-primary)]/10"
                  >
                    {r}
                  </Link>
                ))}
              </div>
            </div>

            <div className="mt-8 space-y-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                All Regions
              </p>
              {allRegions.map(([letter, regions]) => (
                <div key={letter}>
                  <p
                    className="mb-2 text-sm font-light text-[var(--color-text-tertiary)]"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {letter}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {regions.map((r) => (
                      <Link
                        key={r}
                        href={`/explore/region/${toExploreSlug(r)}`}
                        className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
                      >
                        {r}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
