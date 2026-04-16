"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toExploreSlug } from "@shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import AppShell from "@/components/AppShell";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const POPULAR_GRAPES = [
  "Pinot Noir", "Cabernet Sauvignon", "Chardonnay", "Sauvignon Blanc",
  "Syrah / Shiraz", "Nebbiolo", "Riesling", "Grenache",
  "Merlot", "Malbec", "Tempranillo", "Sangiovese",
];

const MORE_GRAPES = [
  "Gamay", "Mourvèdre", "Cabernet Franc", "Viognier", "Chenin Blanc",
  "Gewürztraminer", "Pinot Grigio", "Albariño", "Grüner Veltliner",
  "Barbera", "Dolcetto", "Nero d'Avola", "Primitivo", "Zinfandel",
  "Garnacha", "Monastrell", "Verdejo", "Torrontés", "Carménère",
  "Petite Sirah", "Tannat", "Pinotage", "Cinsault", "Carignan",
  "Marsanne", "Roussanne", "Vermentino", "Fiano", "Greco",
  "Aglianico", "Corvina", "Glera", "Muscat", "Sémillon",
];

type GrapeResult = { name: string; href: string };

type UserGrape = { name: string; count: number };

type SpotlightData = {
  display_name: string;
  tagline: string;
  slug: string;
  href: string;
};

// Nebbiolo-inspired accent for grape pages
const ACCENT = "var(--color-accent-purple)";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GrapesBrowsePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [query, setQuery] = useState("");
  const [apiResults, setApiResults] = useState<GrapeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [userGrapes, setUserGrapes] = useState<UserGrape[]>([]);
  const [userGrapesLoaded, setUserGrapesLoaded] = useState(false);
  const [spotlight, setSpotlight] = useState<SpotlightData | null>(null);
  const [showAllGrapes, setShowAllGrapes] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load user's top grapes
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) { setUserGrapesLoaded(true); return; }

      const { data } = await supabase
        .from("entry_primary_grapes")
        .select("grape_varieties(name)")
        .order("created_at", { ascending: false })
        .limit(500);

      if (!mounted || !data) { setUserGrapesLoaded(true); return; }

      const counts = new Map<string, number>();
      for (const row of data) {
        const variety = row.grape_varieties as unknown as { name: string } | null;
        const name = variety?.name?.trim();
        if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
      }

      if (mounted) {
        setUserGrapes(
          [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name, count]) => ({ name, count }))
        );
        setUserGrapesLoaded(true);
      }
    };
    load();
    return () => { mounted = false; };
  }, [supabase]);

  // Load grape spotlight from wine_profiles
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch("/api/explore/trending");
        if (!res.ok || !mounted) return;
        const data = await res.json();
        if (mounted && data.grape_spotlight) {
          setSpotlight({
            display_name: data.grape_spotlight.display_name,
            tagline: data.grape_spotlight.tagline,
            slug: data.grape_spotlight.slug,
            href: data.grape_spotlight.href,
          });
        }
      } catch { /* non-critical */ }
    };
    load();
    return () => { mounted = false; };
  }, []);

  // Search
  const search = useCallback(async (q: string) => {
    const trimmed = q.trim().toLowerCase();
    if (!trimmed) { setApiResults([]); setSearching(false); return; }
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

    const allStatic = [...POPULAR_GRAPES, ...MORE_GRAPES];
    const staticMatches = allStatic
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
        {/* ── Back + Header ─────────────────────────── */}
        <Link
          href="/explore"
          className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-text-tertiary)] transition hover:text-[var(--color-text-secondary)]"
        >
          &larr; Explore
        </Link>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${ACCENT} 15%, transparent)` }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill={ACCENT}>
              <circle cx="12" cy="8" r="2.6" opacity="0.45" />
              <circle cx="9" cy="12.5" r="2.6" opacity="0.35" />
              <circle cx="15" cy="12.5" r="2.6" opacity="0.45" />
              <circle cx="12" cy="16.5" r="2.6" opacity="0.3" />
              <line x1="12" y1="5.4" x2="12" y2="3.5" stroke={ACCENT} strokeWidth="0.7" opacity="0.6" />
              <path d="M12 3.5 Q14.5 2.5 15.5 3.5" stroke={ACCENT} strokeWidth="0.5" fill="none" opacity="0.4" />
            </svg>
          </div>
          <div>
            <h1
              className="text-2xl font-light leading-tight"
              style={{ fontFamily: "var(--font-serif)", color: "var(--color-text-primary)" }}
            >
              Grapes
            </h1>
            <p className="text-xs text-[var(--color-text-secondary)]">
              The varieties that shape every glass.
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
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search grapes..."
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-3 pl-10 pr-4 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] outline-none transition focus:border-[var(--color-border-strong)]"
          />
        </div>

        {/* ── Search results ─────────────────────────── */}
        {isSearching && (
          <div className="mt-4">
            {searching ? (
              <p className="text-sm text-[var(--color-text-secondary)]">Searching...</p>
            ) : apiResults.length === 0 ? (
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] p-5 text-center">
                <p className="text-sm text-[var(--color-text-tertiary)]">No grapes found. Try a different spelling or alias.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {apiResults.map((g) => (
                  <Link
                    key={g.name}
                    href={g.href}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[var(--color-text-primary)] transition hover:bg-[var(--color-surface-raised)]"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ACCENT, opacity: 0.6 }} />
                    {g.name}
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
                  Grape of the Day
                </p>
                <Link
                  href={spotlight.href}
                  className="mt-3 block overflow-hidden rounded-2xl border border-[var(--color-border)] transition hover:border-[var(--color-border-strong)]"
                  style={{
                    background: `linear-gradient(135deg, color-mix(in srgb, ${ACCENT} 20%, transparent) 0%, var(--color-surface-primary) 100%)`,
                  }}
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h3
                          className="text-xl font-light"
                          style={{ fontFamily: "var(--font-serif)", color: "var(--color-text-primary)" }}
                        >
                          {spotlight.display_name}
                        </h3>
                        <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                          {spotlight.tagline}
                        </p>
                      </div>
                      <div className="h-10 w-10 shrink-0 rounded-full" style={{ background: `color-mix(in srgb, ${ACCENT} 15%, transparent)` }} />
                    </div>
                    <span className="mt-3 inline-block text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: ACCENT }}>
                      Explore &rarr;
                    </span>
                  </div>
                </Link>
              </div>
            )}

            {/* Your Top Grapes */}
            {userGrapesLoaded && userGrapes.length > 0 && (
              <div className="mt-8">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                  Your Top Grapes
                </p>
                <div className="space-y-1">
                  {userGrapes.map((g) => (
                    <Link
                      key={g.name}
                      href={`/explore/grape/${toExploreSlug(g.name)}`}
                      className="flex items-center justify-between rounded-lg px-3 py-2.5 transition hover:bg-[var(--color-surface-raised)]"
                    >
                      <span className="text-sm text-[var(--color-text-primary)]">{g.name}</span>
                      <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-text-tertiary)]">
                        {g.count} {g.count === 1 ? "entry" : "entries"}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Popular */}
            <div className="mt-8">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                Popular Grapes
              </p>
              <div className="grid grid-cols-2 gap-2">
                {POPULAR_GRAPES.map((g) => {
                  const userEntry = userGrapes.find((ug) => ug.name.toLowerCase() === g.toLowerCase());
                  return (
                    <Link
                      key={g}
                      href={`/explore/grape/${toExploreSlug(g)}`}
                      className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] px-3.5 py-3 transition hover:border-[var(--color-border-strong)]"
                    >
                      <span className="text-xs font-medium text-[var(--color-text-primary)]">{g}</span>
                      {userEntry && (
                        <span className="text-[10px] text-[var(--color-text-tertiary)]">{userEntry.count}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* All Varieties */}
            <div className="mt-8">
              <button
                type="button"
                onClick={() => setShowAllGrapes(!showAllGrapes)}
                className="flex w-full items-center justify-between"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                  All Varieties
                </p>
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-text-tertiary)] transition hover:text-[var(--color-text-secondary)]">
                  {showAllGrapes ? "Hide" : `Show ${MORE_GRAPES.length} more`}
                </span>
              </button>
              {showAllGrapes && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {MORE_GRAPES.map((g) => (
                    <Link
                      key={g}
                      href={`/explore/grape/${toExploreSlug(g)}`}
                      className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
                    >
                      {g}
                    </Link>
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
