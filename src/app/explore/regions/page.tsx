"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toExploreSlug, WINE_REGIONS } from "@shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import AppShell from "@/components/AppShell";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const POPULAR_REGIONS = [
  "Burgundy", "Bordeaux", "Napa Valley", "Tuscany",
  "Champagne", "Piedmont", "Rioja", "Barossa Valley",
  "Willamette Valley", "Mendoza", "Mosel", "Rhone Valley",
  "Sonoma", "Stellenbosch",
];

type UserRegion = { name: string; count: number };

type SpotlightData = {
  display_name: string;
  tagline: string;
  slug: string;
  href: string;
  characteristics: string[];
};

// Grenache-inspired accent for region pages
const ACCENT = "var(--color-accent-primary)";
const ACCENT_LIGHT = "var(--color-accent-secondary)";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RegionsBrowsePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [query, setQuery] = useState("");
  const [userRegions, setUserRegions] = useState<UserRegion[]>([]);
  const [userRegionsLoaded, setUserRegionsLoaded] = useState(false);
  const [spotlight, setSpotlight] = useState<SpotlightData | null>(null);
  const [showAllRegions, setShowAllRegions] = useState(false);

  const isSearching = query.trim().length > 0;

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];
    return WINE_REGIONS.filter((r) => r.toLowerCase().includes(trimmed));
  }, [query]);

  // Remaining regions grouped by letter
  const remainingRegions = useMemo(() => {
    const remaining = WINE_REGIONS.filter((r) => !POPULAR_REGIONS.includes(r)).sort();
    const groups = new Map<string, string[]>();
    for (const r of remaining) {
      const letter = r[0].toUpperCase();
      if (!groups.has(letter)) groups.set(letter, []);
      groups.get(letter)!.push(r);
    }
    return [...groups.entries()];
  }, []);

  // Load user's top regions
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) { setUserRegionsLoaded(true); return; }

      const { data } = await supabase
        .from("wine_entries")
        .select("canonical_region")
        .eq("user_id", user.id)
        .not("canonical_region", "is", null)
        .order("created_at", { ascending: false })
        .limit(500);

      if (!mounted || !data) { setUserRegionsLoaded(true); return; }

      const counts = new Map<string, number>();
      for (const row of data) {
        const r = (row.canonical_region as string)?.trim();
        if (r) counts.set(r, (counts.get(r) ?? 0) + 1);
      }

      if (mounted) {
        setUserRegions(
          [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name, count]) => ({ name, count }))
        );
        setUserRegionsLoaded(true);
      }
    };
    load();
    return () => { mounted = false; };
  }, [supabase]);

  // Load region spotlight
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch("/api/explore/trending");
        if (!res.ok || !mounted) return;
        const data = await res.json();
        if (mounted && data.featured_region) {
          setSpotlight({
            display_name: data.featured_region.display_name,
            tagline: data.featured_region.tagline,
            slug: data.featured_region.slug,
            href: data.featured_region.href,
            characteristics: data.featured_region.characteristics ?? [],
          });
        }
      } catch { /* non-critical */ }
    };
    load();
    return () => { mounted = false; };
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 pb-20 pt-8">
        {/* ── Back + Header ─────────────────────────── */}
        <Link
          href="/explore"
          className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-text-tertiary)] transition hover:text-[var(--color-text-secondary)]"
        >
          &larr; Explore
        </Link>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${ACCENT} 15%, transparent)` }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke={ACCENT_LIGHT} strokeWidth="0.8" opacity="0.5" />
              <circle cx="12" cy="12" r="4.5" stroke={ACCENT_LIGHT} strokeWidth="0.6" opacity="0.3" />
              <circle cx="12" cy="5" r="1.2" fill={ACCENT_LIGHT} opacity="0.8" />
              <circle cx="17" cy="14" r="1" fill={ACCENT_LIGHT} opacity="0.6" />
              <circle cx="7" cy="16" r="0.8" fill={ACCENT_LIGHT} opacity="0.4" />
            </svg>
          </div>
          <div>
            <h1
              className="text-2xl font-light leading-tight"
              style={{ fontFamily: "var(--font-serif)", color: "var(--color-text-primary)" }}
            >
              Regions
            </h1>
            <p className="text-xs text-[var(--color-text-secondary)]">
              The places that give wine its character.
            </p>
          </div>
        </div>

        {/* ── Search ─────────────────────────────────── */}
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

        {/* ── Search results ─────────────────────────── */}
        {isSearching && (
          <div className="mt-4">
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] p-5 text-center">
                <p className="text-sm text-[var(--color-text-tertiary)]">No regions found.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.map((r) => (
                  <Link
                    key={r}
                    href={`/explore/region/${toExploreSlug(r)}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[var(--color-text-primary)] transition hover:bg-[var(--color-surface-raised)]"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ACCENT_LIGHT, opacity: 0.6 }} />
                    {r}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Discovery content ──────────────────────── */}
        {!isSearching && (
          <>
            {/* Spotlight */}
            {spotlight && (
              <div className="mt-8">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                  Region of the Day
                </p>
                <Link
                  href={spotlight.href}
                  className="mt-3 block overflow-hidden rounded-2xl border border-[var(--color-accent-secondary)]/12 transition hover:border-[var(--color-accent-secondary)]/30"
                  style={{
                    background: "linear-gradient(135deg, rgba(123,29,58,0.25) 0%, rgba(74,48,96,0.15) 50%, var(--color-surface-primary) 100%)",
                  }}
                >
                  <div className="p-5">
                    <h3
                      className="text-xl font-light"
                      style={{ fontFamily: "var(--font-serif)", color: "var(--color-text-primary)" }}
                    >
                      {spotlight.display_name}
                    </h3>
                    <p
                      className="mt-1.5 text-xs leading-relaxed"
                      style={{ fontFamily: "var(--font-serif)", color: "var(--color-text-secondary)" }}
                    >
                      {spotlight.tagline}
                    </p>
                    {spotlight.characteristics.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {spotlight.characteristics.map((c) => (
                          <span key={c} className="rounded-full border border-[var(--color-border)] px-2.5 py-0.5 text-[10px] text-[var(--color-text-tertiary)]">
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                    <span className="mt-3 inline-block text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-accent-secondary)]">
                      Explore &rarr;
                    </span>
                  </div>
                </Link>
              </div>
            )}

            {/* Your Top Regions */}
            {userRegionsLoaded && userRegions.length > 0 && (
              <div className="mt-8">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                  Your Top Regions
                </p>
                <div className="space-y-1">
                  {userRegions.map((r) => (
                    <Link
                      key={r.name}
                      href={`/explore/region/${toExploreSlug(r.name)}`}
                      className="flex items-center justify-between rounded-lg px-3 py-2.5 transition hover:bg-[var(--color-surface-raised)]"
                    >
                      <span className="text-sm text-[var(--color-text-primary)]">{r.name}</span>
                      <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-text-tertiary)]">
                        {r.count} {r.count === 1 ? "entry" : "entries"}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Popular */}
            <div className="mt-8">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                Popular Regions
              </p>
              <div className="grid grid-cols-2 gap-2">
                {POPULAR_REGIONS.map((r) => {
                  const userEntry = userRegions.find((ur) => ur.name.toLowerCase() === r.toLowerCase());
                  return (
                    <Link
                      key={r}
                      href={`/explore/region/${toExploreSlug(r)}`}
                      className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] px-3.5 py-3 transition hover:border-[var(--color-border-strong)]"
                    >
                      <span className="text-xs font-medium text-[var(--color-text-primary)]">{r}</span>
                      {userEntry && (
                        <span className="text-[10px] text-[var(--color-text-tertiary)]">{userEntry.count}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* All Regions A-Z */}
            <div className="mt-8">
              <button
                type="button"
                onClick={() => setShowAllRegions(!showAllRegions)}
                className="flex w-full items-center justify-between"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                  All Regions
                </p>
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-text-tertiary)] transition hover:text-[var(--color-text-secondary)]">
                  {showAllRegions ? "Hide" : `Show ${WINE_REGIONS.length - POPULAR_REGIONS.length} more`}
                </span>
              </button>
              {showAllRegions && (
                <div className="mt-4 space-y-4">
                  {remainingRegions.map(([letter, regions]) => (
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
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
