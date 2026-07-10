"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toExploreSlug, WINE_REGIONS } from "@shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import AppShell from "@/components/AppShell";
import AppImage from "@/components/AppImage";

// ---------------------------------------------------------------------------
// Colors — matching profile page palette
// ---------------------------------------------------------------------------

const GRENACHE = "#7B1D3A";
const ROSE = "#C4607A";
const CHAMPAGNE = "#F5EDD6";
const FOG = "#A08878";
const NEBBIOLO = "#4A3060";
const BG_SECTION = "#220E14";

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
  href: string;
  characteristics: string[];
  hero_image_url: string | null;
};

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
  // Cached wine_profiles hero images for the Popular Regions grid —
  // cached-only lookup, never triggers generation from this browse surface.
  const [regionThumbs, setRegionThumbs] = useState<Map<string, string>>(new Map());

  const isSearching = query.trim().length > 0;

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];
    return WINE_REGIONS.filter((r) => r.toLowerCase().includes(trimmed));
  }, [query]);

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
        setUserRegions([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })));
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
            href: data.featured_region.href,
            characteristics: data.featured_region.characteristics ?? [],
            hero_image_url: data.featured_region.hero_image_url ?? null,
          });
        }
      } catch { /* non-critical */ }
    };
    load();
    return () => { mounted = false; };
  }, []);

  // Load cached hero images for the Popular Regions grid — cached-only, no
  // generation triggered from this browse surface.
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase
        .from("wine_profiles")
        .select("slug, hero_image_url")
        .eq("profile_type", "region")
        .in("slug", POPULAR_REGIONS.map(toExploreSlug))
        .not("hero_image_url", "is", null);
      if (!mounted || !data) return;
      setRegionThumbs(new Map(data.map((r: { slug: string; hero_image_url: string }) => [r.slug, r.hero_image_url])));
    };
    load();
    return () => { mounted = false; };
  }, [supabase]);

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 pt-8 pb-[var(--app-bottom-nav-height)]">
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
          style={{ background: `linear-gradient(135deg, ${GRENACHE}35 0%, ${NEBBIOLO}18 60%, ${BG_SECTION} 100%)` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ background: `${GRENACHE}25` }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke={ROSE} strokeWidth="0.8" opacity="0.5" />
                <circle cx="12" cy="12" r="4.5" stroke={ROSE} strokeWidth="0.6" opacity="0.3" />
                <circle cx="12" cy="5" r="1.4" fill={ROSE} opacity="0.8" />
                <circle cx="17" cy="14" r="1.1" fill={ROSE} opacity="0.6" />
                <circle cx="7" cy="16" r="0.9" fill={ROSE} opacity="0.4" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-light leading-tight" style={{ fontFamily: "var(--font-serif)", color: CHAMPAGNE }}>
                Regions
              </h1>
              <p className="text-xs" style={{ color: FOG }}>
                The places that give wine its character.
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
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search regions..."
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-3 pl-10 pr-4 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] outline-none transition focus:border-[var(--color-border-strong)]"
          />
        </div>

        {/* ── Search results ─────────────────────────── */}
        {isSearching && (
          <div className="mt-4">
            {filtered.length === 0 ? (
              <div className="rounded-2xl p-5 text-center" style={{ background: BG_SECTION, border: `1px solid ${GRENACHE}20` }}>
                <p className="text-sm" style={{ color: FOG }}>No regions found.</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {filtered.map((r) => (
                  <Link key={r} href={`/explore/region/${toExploreSlug(r)}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition hover:bg-[var(--color-surface-raised)]" style={{ color: CHAMPAGNE }}>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: GRENACHE }} />
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
            {/* ── Spotlight ────────────────────────────── */}
            {spotlight && (
              <div className="mt-8">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: FOG }}>
                  Region of the Week
                </p>
                <Link
                  href={spotlight.href}
                  className="relative mt-3 block overflow-hidden rounded-2xl transition hover:opacity-95"
                  style={{
                    background: spotlight.hero_image_url
                      ? undefined
                      : `linear-gradient(135deg, ${GRENACHE}40 0%, ${NEBBIOLO}20 50%, ${BG_SECTION} 100%)`,
                    border: `1px solid ${GRENACHE}30`,
                  }}
                >
                  {/* Cached-only thumbnail — icon/gradient fallback above when absent. */}
                  {spotlight.hero_image_url && (
                    <>
                      <AppImage src={spotlight.hero_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${BG_SECTION}55 0%, ${BG_SECTION}e8 100%)` }} />
                    </>
                  )}
                  <div className="relative p-6">
                    <h3 className="text-xl font-light" style={{ fontFamily: "var(--font-serif)", color: CHAMPAGNE }}>
                      {spotlight.display_name}
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed" style={{ fontFamily: "var(--font-serif)", color: FOG }}>
                      {spotlight.tagline}
                    </p>
                    {spotlight.characteristics.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {spotlight.characteristics.map((c) => (
                          <span key={c} className="rounded-full px-2.5 py-0.5 text-[10px]" style={{ background: `${GRENACHE}25`, color: ROSE, border: `1px solid ${GRENACHE}30` }}>
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

            {/* ── Your Top Regions ─────────────────────── */}
            {userRegionsLoaded && userRegions.length > 0 && (
              <div className="mt-8 rounded-2xl p-5" style={{ background: BG_SECTION, border: `1px solid ${GRENACHE}18` }}>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: ROSE }}>
                  Your Top Regions
                </p>
                <div className="space-y-0.5">
                  {userRegions.map((r, i) => (
                    <Link
                      key={r.name}
                      href={`/explore/region/${toExploreSlug(r.name)}`}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-[var(--color-surface-raised)]"
                    >
                      <span className="w-4 text-center text-xs font-light" style={{ fontFamily: "var(--font-serif)", color: FOG }}>{i + 1}</span>
                      <span className="flex-1 text-sm" style={{ color: CHAMPAGNE }}>{r.name}</span>
                      <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: `${GRENACHE}25`, color: ROSE }}>
                        {r.count}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* ── Popular ──────────────────────────────── */}
            <div className="mt-8">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: FOG }}>
                Popular Regions
              </p>
              <div className="grid grid-cols-2 gap-2">
                {POPULAR_REGIONS.map((r) => {
                  const userEntry = userRegions.find((ur) => ur.name.toLowerCase() === r.toLowerCase());
                  const thumb = regionThumbs.get(toExploreSlug(r));
                  return (
                    <Link
                      key={r}
                      href={`/explore/region/${toExploreSlug(r)}`}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-3 transition hover:opacity-90"
                      style={{ background: `${GRENACHE}12`, border: `1px solid ${GRENACHE}18` }}
                    >
                      {/* Cached-only thumbnail — falls back to a plain dot when no image has been generated yet. */}
                      <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full" style={{ background: `${GRENACHE}30` }}>
                        {thumb && <AppImage src={thumb} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium" style={{ color: CHAMPAGNE }}>{r}</span>
                      {userEntry ? (
                        <span className="shrink-0 text-[10px]" style={{ color: FOG }}>{userEntry.count}</span>
                      ) : (
                        <span className="shrink-0 text-[10px]" style={{ color: `${FOG}80` }}>&rarr;</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* ── All Regions A-Z ───────────────────────── */}
            <div className="mt-8">
              <button type="button" onClick={() => setShowAllRegions(!showAllRegions)} className="flex w-full items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: FOG }}>All Regions</p>
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] transition hover:opacity-80" style={{ color: ROSE }}>
                  {showAllRegions ? "Hide" : `Show ${WINE_REGIONS.length - POPULAR_REGIONS.length} more`}
                </span>
              </button>
              {showAllRegions && (
                <div className="mt-4 space-y-5">
                  {remainingRegions.map(([letter, regions]) => (
                    <div key={letter}>
                      <p className="mb-2 text-base font-light" style={{ fontFamily: "var(--font-serif)", color: `${ROSE}80` }}>
                        {letter}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {regions.map((r) => (
                          <Link
                            key={r}
                            href={`/explore/region/${toExploreSlug(r)}`}
                            className="rounded-full px-3 py-1.5 text-xs transition hover:opacity-80"
                            style={{ background: `${GRENACHE}10`, color: FOG, border: `1px solid ${GRENACHE}15` }}
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
