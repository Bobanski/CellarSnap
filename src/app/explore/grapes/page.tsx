"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toExploreSlug } from "@shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import AppShell from "@/components/AppShell";

// ---------------------------------------------------------------------------
// Colors — matching profile page palette
// ---------------------------------------------------------------------------

const NEBBIOLO = "#4A3060";
const ROSE = "#AC4760"; // Rose, deepened for AA text contrast on Champagne Daylight (matches --color-accent-secondary)
const CHAMPAGNE = "#F5EDD6";
const TERROIR = "#2C1A0E";
const FOG = "#6E645A"; // Fog #8A8078, darkened for AA text contrast on Champagne Daylight
const BG_SECTION = "#4A0E1F"; // Barolo — kept dark for hero/highlight moments per brand guide

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
  href: string;
  characteristics: string[];
};

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
        setUserGrapes([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })));
        setUserGrapesLoaded(true);
      }
    };
    load();
    return () => { mounted = false; };
  }, [supabase]);

  // Load grape spotlight
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
            href: data.grape_spotlight.href,
            characteristics: data.grape_spotlight.characteristics ?? [],
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
        for (const g of (Array.isArray(data.grapes) ? data.grapes : [])) {
          const name = typeof g === "string" ? g : g.name;
          if (name) found.push({ name, href: `/explore/grape/${toExploreSlug(name)}` });
        }
      }
    } catch { /* ignore */ }
    const allStatic = [...POPULAR_GRAPES, ...MORE_GRAPES];
    for (const g of allStatic.filter((g) => g.toLowerCase().includes(trimmed) && !found.some((f) => f.name.toLowerCase() === g.toLowerCase())).slice(0, 8)) {
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
        {/* ── Back ───────────────────────────────────── */}
        <Link
          href="/explore"
          className="text-[10px] font-semibold uppercase tracking-[0.15em] transition hover:opacity-80"
          style={{ color: ROSE }}
        >
          &larr; Explore
        </Link>

        {/* ── Hero header ────────────────────────────── */}
        <div
          className="mt-4 rounded-2xl p-6"
          style={{ background: `linear-gradient(135deg, ${NEBBIOLO}30 0%, ${BG_SECTION} 100%)` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ background: `${NEBBIOLO}25` }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill={ROSE}>
                <circle cx="12" cy="8" r="2.6" opacity="0.5" />
                <circle cx="9" cy="12.5" r="2.6" opacity="0.4" />
                <circle cx="15" cy="12.5" r="2.6" opacity="0.5" />
                <circle cx="12" cy="16.5" r="2.6" opacity="0.35" />
                <line x1="12" y1="5.4" x2="12" y2="3.5" stroke={ROSE} strokeWidth="0.7" opacity="0.6" />
                <path d="M12 3.5 Q14.5 2.5 15.5 3.5" stroke={ROSE} strokeWidth="0.5" fill="none" opacity="0.4" />
              </svg>
            </div>
            <div>
              <h1
                className="text-2xl font-light leading-tight"
                style={{ fontFamily: "var(--font-serif)", color: CHAMPAGNE }}
              >
                Grapes
              </h1>
              <p className="text-xs" style={{ color: FOG }}>
                The varieties that shape every glass.
              </p>
            </div>
          </div>
        </div>

        {/* ── Search ─────────────────────────────────── */}
        <div className="mt-6 relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 20 20" fill="none">
            <circle cx="8.2" cy="8.2" r="5.4" stroke={FOG} strokeWidth="1.4" />
            <line x1="12" y1="12" x2="16.6" y2="16.6" stroke={FOG} strokeWidth="1.6" strokeLinecap="round" />
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
              <p className="text-sm" style={{ color: FOG }}>Searching...</p>
            ) : apiResults.length === 0 ? (
              <div className="rounded-2xl border border-[var(--color-border)] p-5 text-center" style={{ background: "#FFFFFF" }}>
                <p className="text-sm" style={{ color: FOG }}>No grapes found. Try a different spelling or alias.</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {apiResults.map((g) => (
                  <Link key={g.name} href={g.href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition hover:bg-[var(--color-surface-raised)]" style={{ color: TERROIR }}>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: NEBBIOLO }} />
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
            {/* ── Spotlight ────────────────────────────── */}
            {spotlight && (
              <div className="mt-8">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: FOG }}>
                  Grape of the Day
                </p>
                <Link
                  href={spotlight.href}
                  className="mt-3 block overflow-hidden rounded-2xl transition hover:opacity-95"
                  style={{
                    background: `linear-gradient(135deg, ${NEBBIOLO}40 0%, ${ROSE}18 60%, ${BG_SECTION} 100%)`,
                    border: `1px solid ${NEBBIOLO}35`,
                  }}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-xl font-light" style={{ fontFamily: "var(--font-serif)", color: CHAMPAGNE }}>
                          {spotlight.display_name}
                        </h3>
                        <p className="mt-2 text-xs leading-relaxed" style={{ fontFamily: "var(--font-serif)", color: FOG }}>
                          {spotlight.tagline}
                        </p>
                      </div>
                      <div className="h-11 w-11 shrink-0 rounded-full" style={{ background: `${NEBBIOLO}30`, border: `1px solid ${NEBBIOLO}40` }} />
                    </div>
                    {spotlight.characteristics.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {spotlight.characteristics.map((c) => (
                          <span key={c} className="rounded-full px-2.5 py-0.5 text-[10px]" style={{ background: `${NEBBIOLO}25`, color: ROSE, border: `1px solid ${NEBBIOLO}30` }}>
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                    <span className="mt-4 inline-block text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: ROSE }}>
                      Explore &rarr;
                    </span>
                  </div>
                </Link>
              </div>
            )}

            {/* ── Your Top Grapes ──────────────────────── */}
            {userGrapesLoaded && userGrapes.length > 0 && (
              <div className="mt-8 rounded-2xl p-5" style={{ background: "#FFFFFF", border: `1px solid ${NEBBIOLO}18` }}>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: ROSE }}>
                  Your Top Grapes
                </p>
                <div className="space-y-0.5">
                  {userGrapes.map((g, i) => (
                    <Link
                      key={g.name}
                      href={`/explore/grape/${toExploreSlug(g.name)}`}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-[var(--color-surface-raised)]"
                    >
                      <span className="w-4 text-center text-xs font-light" style={{ fontFamily: "var(--font-serif)", color: FOG }}>{i + 1}</span>
                      <span className="flex-1 text-sm" style={{ color: TERROIR }}>{g.name}</span>
                      <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: `${NEBBIOLO}25`, color: ROSE }}>
                        {g.count}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* ── Popular ──────────────────────────────── */}
            <div className="mt-8">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: FOG }}>
                Popular Grapes
              </p>
              <div className="grid grid-cols-2 gap-2">
                {POPULAR_GRAPES.map((g) => {
                  const userEntry = userGrapes.find((ug) => ug.name.toLowerCase() === g.toLowerCase());
                  return (
                    <Link
                      key={g}
                      href={`/explore/grape/${toExploreSlug(g)}`}
                      className="flex items-center justify-between rounded-xl px-4 py-3 transition hover:opacity-90"
                      style={{ background: `${NEBBIOLO}15`, border: `1px solid ${NEBBIOLO}20` }}
                    >
                      <span className="text-xs font-medium" style={{ color: TERROIR }}>{g}</span>
                      {userEntry ? (
                        <span className="text-[10px]" style={{ color: FOG }}>{userEntry.count}</span>
                      ) : (
                        <span className="text-[10px]" style={{ color: `${FOG}80` }}>&rarr;</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* ── All Varieties ─────────────────────────── */}
            <div className="mt-8">
              <button type="button" onClick={() => setShowAllGrapes(!showAllGrapes)} className="flex w-full items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: FOG }}>All Varieties</p>
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] transition hover:opacity-80" style={{ color: ROSE }}>
                  {showAllGrapes ? "Hide" : `Show ${MORE_GRAPES.length} more`}
                </span>
              </button>
              {showAllGrapes && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {MORE_GRAPES.map((g) => (
                    <Link
                      key={g}
                      href={`/explore/grape/${toExploreSlug(g)}`}
                      className="rounded-full px-3 py-1.5 text-xs transition hover:opacity-80"
                      style={{ background: `${NEBBIOLO}12`, color: FOG, border: `1px solid ${NEBBIOLO}18` }}
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
