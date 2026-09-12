"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { toExploreSlug, WINE_REGIONS } from "@shared";
import AppShell from "@/components/AppShell";
import AppImage from "@/components/AppImage";
import ProducerMark from "@/components/ProducerMark";

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
  hero_image_url?: string | null;
};

type FeaturedCard = {
  slug: string;
  display_name: string;
  tagline: string;
  hero_image_url: string | null;
  characteristics: string[];
  href: string;
};

type ExploreNextSuggestion = {
  key: string;
  name: string;
  type: "region" | "grape";
  href: string;
  why: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Per-type accent family — mirrors the accents the detail pages
// (explore/[type]/[slug]) already use (RegionPage=Grenache, VarietalPage=
// Nebbiolo, ProducerPage=Rose), so the home cards and trending row prime the
// visitor for which kind of page they're about to enter. GRAPE_ACCENT is a
// lightened variant of raw Nebbiolo (#4A3060) — the raw tone reads fine at
// large fill areas (radar charts) on the detail page but is too dark to read
// as a small icon/glyph against these dark surfaces.
const REGION_ACCENT = "#7B1D3A"; // Grenache — backgrounds/borders/large icons
const GRAPE_ACCENT = "#9B7EC2"; // Nebbiolo, lightened — safe at every scale
const PRODUCER_ACCENT = "#C4607A"; // Rose — safe at every scale (proven by the browse-page headers)
// Grenache reads fine as a background wash or a large (32px) graphic mark,
// but is too dark for small icons/text (the browse-page headers never use
// raw Grenache as a glyph color either — only as a container tint). This is
// the small-scale-safe variant, analogous to GRAPE_ACCENT for Nebbiolo.
const REGION_ACCENT_TEXT = "#D98A73";

const TYPE_ACCENT: Record<"region" | "grape", string> = {
  region: REGION_ACCENT_TEXT,
  grape: GRAPE_ACCENT,
};

// Small heuristic association tables for the "Explore next" module — no LLM
// call, just a curated map from a top affinity to a complementary page so the
// suggestion is a genuine "next step" rather than re-linking a page the
// visitor already knows well.
const GRAPE_TO_REGION: Record<string, string> = {
  "nebbiolo": "Barbaresco",
  "sangiovese": "Chianti Classico",
  "pinot noir": "Willamette Valley",
  "chardonnay": "Chablis",
  "syrah": "Northern Rhone",
  "shiraz": "Barossa Valley",
  "grenache": "Priorat",
  "garnacha": "Priorat",
  "riesling": "Mosel",
  "cabernet sauvignon": "Napa Valley",
  "merlot": "Pomerol",
  "malbec": "Mendoza",
  "tempranillo": "Ribera del Duero",
  "sauvignon blanc": "Marlborough",
  "chenin blanc": "Vouvray",
  "gamay": "Beaujolais",
  "zinfandel": "Sonoma",
  "albarino": "Rias Baixas",
  "gruner veltliner": "Wachau",
  "viognier": "Condrieu",
  "mourvedre": "Bandol",
  "primitivo": "Puglia",
  "carmenere": "Colchagua Valley",
  "pinotage": "Stellenbosch",
};

const REGION_TO_GRAPE: Record<string, string> = {
  "barbaresco": "Nebbiolo",
  "barolo": "Nebbiolo",
  "chianti classico": "Sangiovese",
  "willamette valley": "Pinot Noir",
  "burgundy": "Pinot Noir",
  "chablis": "Chardonnay",
  "northern rhone": "Syrah",
  "rhone valley": "Grenache",
  "barossa valley": "Shiraz / Syrah",
  "priorat": "Grenache",
  "mosel": "Riesling",
  "napa valley": "Cabernet Sauvignon",
  "bordeaux": "Cabernet Sauvignon",
  "pomerol": "Merlot",
  "mendoza": "Malbec",
  "ribera del duero": "Tempranillo",
  "rioja": "Tempranillo",
  "marlborough": "Sauvignon Blanc",
  "vouvray": "Chenin Blanc",
  "beaujolais": "Gamay",
  "sonoma": "Zinfandel",
  "rias baixas": "Albarino",
  "wachau": "Gruner Veltliner",
  "condrieu": "Viognier",
  "bandol": "Mourvedre",
  "champagne": "Chardonnay",
  "piedmont": "Nebbiolo",
  "tuscany": "Sangiovese",
  "stellenbosch": "Pinotage",
};

// Curated beginner path (feedback item: "New to wine?" no longer hard-routes
// to a single grape) — a small, approachable spread across styles, in brand
// voice, zero jargon.
const START_HERE: Array<{ name: string; type: "grape"; blurb: string }> = [
  { name: "Pinot Noir", type: "grape", blurb: "Light, silky red that goes with almost anything. The easiest place to fall for reds." },
  { name: "Sauvignon Blanc", type: "grape", blurb: "Zippy and citrusy — never overstays its welcome. An instant crowd-pleaser." },
  { name: "Riesling", type: "grape", blurb: "Don't let the reputation fool you — most are crisp, not sweet. Worth a second look." },
  { name: "Grenache", type: "grape", blurb: "Warm, juicy, and easygoing. Basically a red wine hug." },
  { name: "Prosecco", type: "grape", blurb: "Bubbles without the fuss or the price tag. Perfect for a Tuesday." },
];

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

  // "Explore next" — palate-aware suggestions
  const [exploreNext, setExploreNext] = useState<ExploreNextSuggestion[]>([]);

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

  // "Explore next" — derive 2-3 suggestions from the user's top categorical
  // affinities (regions/grapes) already computed by GET /api/palate. Simple
  // heuristic, no LLM call: pick the top grape + top region by log count and
  // point to a complementary page via a small curated association map,
  // falling back to the affinity's own page when no mapping exists.
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch("/api/palate");
        if (!res.ok || !mounted) return;
        const data = await res.json();
        const suggestions: ExploreNextSuggestion[] = [];
        const seen = new Set<string>();

        const topGrape = Array.isArray(data.topGrapes) ? data.topGrapes[0] : null;
        if (topGrape?.name) {
          const mapped = GRAPE_TO_REGION[topGrape.name.toLowerCase().trim()];
          const key = `region:${(mapped ?? topGrape.name).toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            suggestions.push(mapped
              ? {
                  key,
                  name: mapped,
                  type: "region",
                  href: `/explore/region/${toExploreSlug(mapped)}`,
                  why: `You keep coming back to ${topGrape.name} — meet ${mapped}.`,
                }
              : {
                  key,
                  name: topGrape.name,
                  type: "grape",
                  href: `/explore/grape/${toExploreSlug(topGrape.name)}`,
                  why: `${topGrape.count} bottles of ${topGrape.name} and counting — go deeper on what makes it tick.`,
                });
          }
        }

        const topRegion = Array.isArray(data.regionStats) ? data.regionStats[0] : null;
        if (topRegion?.region) {
          const mapped = REGION_TO_GRAPE[topRegion.region.toLowerCase().trim()];
          const key = `grape:${(mapped ?? topRegion.region).toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            const whyBase = topRegion.delta > 0.5
              ? `You rate ${topRegion.region} wines higher than your average`
              : `You keep reaching for ${topRegion.region}`;
            suggestions.push(mapped
              ? {
                  key,
                  name: mapped,
                  type: "grape",
                  href: `/explore/grape/${toExploreSlug(mapped)}`,
                  why: `${whyBase} — get to know ${mapped}, the grape behind it.`,
                }
              : {
                  key,
                  name: topRegion.region,
                  type: "region",
                  href: `/explore/region/${toExploreSlug(topRegion.region)}`,
                  why: `${whyBase}. Worth a closer look.`,
                });
          }
        }

        const secondGrape = Array.isArray(data.topGrapes) ? data.topGrapes[1] : null;
        if (secondGrape?.name && suggestions.length < 3) {
          const mapped = GRAPE_TO_REGION[secondGrape.name.toLowerCase().trim()];
          const key = `region:${(mapped ?? secondGrape.name).toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            suggestions.push(mapped
              ? {
                  key,
                  name: mapped,
                  type: "region",
                  href: `/explore/region/${toExploreSlug(mapped)}`,
                  why: `${secondGrape.name} is a regular for you — meet ${mapped}.`,
                }
              : {
                  key,
                  name: secondGrape.name,
                  type: "grape",
                  href: `/explore/grape/${toExploreSlug(secondGrape.name)}`,
                  why: `Another one you reach for often — worth the deep dive.`,
                });
          }
        }

        if (mounted) setExploreNext(suggestions.slice(0, 3));
      } catch { /* non-critical — module just doesn't render */ }
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
                          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] transition hover:bg-[var(--color-surface-raised)]"
                        >
                          {item.type === "producer" ? (
                            <ProducerMark name={item.name} size={20} className="shrink-0" />
                          ) : null}
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
            {/* Icons sized up from 24px (Dani: too small to register at a
                glance) and each card carries its own accent family — mirrors
                the Grenache/Nebbiolo/Rose accents the detail pages already
                use per type, so the card primes which kind of page you're
                about to enter. */}
            <div className="mt-8 grid grid-cols-3 gap-3">
              {[
                {
                  label: "Regions",
                  subtitle: "From Burgundy to Barossa",
                  href: "/explore/regions",
                  accent: REGION_ACCENT,
                  icon: (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="9" stroke={REGION_ACCENT} strokeWidth="0.8" opacity="0.6" />
                      <circle cx="12" cy="12" r="4.5" stroke={REGION_ACCENT} strokeWidth="0.6" opacity="0.4" />
                      <circle cx="12" cy="5" r="1.3" fill={REGION_ACCENT} opacity="0.9" />
                      <circle cx="17" cy="14" r="1.1" fill={REGION_ACCENT} opacity="0.7" />
                      <circle cx="7" cy="16" r="0.9" fill={REGION_ACCENT} opacity="0.5" />
                    </svg>
                  ),
                },
                {
                  label: "Grapes",
                  subtitle: "Pinot Noir to Riesling",
                  href: "/explore/grapes",
                  accent: GRAPE_ACCENT,
                  icon: (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill={GRAPE_ACCENT}>
                      <circle cx="12" cy="8" r="2.6" opacity="0.55" />
                      <circle cx="9" cy="12.5" r="2.6" opacity="0.45" />
                      <circle cx="15" cy="12.5" r="2.6" opacity="0.55" />
                      <circle cx="12" cy="16.5" r="2.6" opacity="0.4" />
                      <line x1="12" y1="5.4" x2="12" y2="3.5" stroke={GRAPE_ACCENT} strokeWidth="0.7" opacity="0.7" />
                      <path d="M12 3.5 Q14.5 2.5 15.5 3.5" stroke={GRAPE_ACCENT} strokeWidth="0.5" fill="none" opacity="0.5" />
                    </svg>
                  ),
                },
                {
                  label: "Producers",
                  subtitle: "The makers behind the wine",
                  href: "/explore/producers",
                  accent: PRODUCER_ACCENT,
                  icon: (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                      <rect x="8" y="3" width="8" height="13" rx="4" fill={PRODUCER_ACCENT} opacity="0.45" />
                      <rect x="10" y="16" width="4" height="4" rx="0.6" fill={PRODUCER_ACCENT} opacity="0.6" />
                      <line x1="7" y1="20" x2="17" y2="20" stroke={PRODUCER_ACCENT} strokeWidth="0.8" opacity="0.5" />
                    </svg>
                  ),
                },
              ].map((cat) => (
                <Link
                  key={cat.label}
                  href={cat.href}
                  className="flex flex-col items-center gap-2.5 rounded-2xl border p-5 text-center transition hover:opacity-90"
                  style={{
                    borderColor: `${cat.accent}20`,
                    background: `linear-gradient(to bottom, ${cat.accent}30 0%, var(--color-surface-primary) 100%)`,
                  }}
                >
                  <div className="flex h-14 w-14 items-center justify-center">
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
                  {trending.map((item) => {
                    const accent = TYPE_ACCENT[item.type];
                    return (
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
                        {/* Clean accent-colored type glyph — not an AI
                            thumbnail (Dani: trending rows should read as
                            icons, not pictures; AI-generated imagery is
                            reserved for the of-the-week heroes and the
                            detail-page hero below). */}
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full"
                          style={{ background: `${accent}22`, border: `1px solid ${accent}40` }}
                        >
                          {item.type === "region" ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="9" stroke={accent} strokeWidth="1" opacity="0.7" />
                              <circle cx="12" cy="12" r="4.5" stroke={accent} strokeWidth="0.8" opacity="0.5" />
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill={accent}>
                              <circle cx="12" cy="8" r="2.6" opacity="0.65" />
                              <circle cx="9" cy="12.5" r="2.6" opacity="0.5" />
                              <circle cx="15" cy="12.5" r="2.6" opacity="0.65" />
                              <circle cx="12" cy="16.5" r="2.6" opacity="0.45" />
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                            {item.name}
                          </p>
                        </div>
                        {/* Per-type accent tag — reversed locally from the
                            shared Chip's neutral-only default (design-audit
                            spec D) for this feedback batch: type coloring on
                            trending rows is the whole point of priming which
                            page you're entering. Kept out of the shared
                            Button.tsx primitive so the app-wide "no
                            per-taxonomy-color chips" rule is untouched. */}
                        <span
                          className="shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]"
                          style={{ background: `${accent}18`, borderColor: `${accent}30`, color: accent }}
                        >
                          {item.type}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">
                  Nothing trending yet. Log wines to light this up.
                </p>
              )}
            </div>

            {/* ── Featured Region ──────────────────────── */}
            {/* Rotation is now weekly (deterministic by ISO week — see
                /api/explore/trending), so this is effectively "Region of the
                Week" even though the label here was always generic. */}
            {featuredRegion && (
              <div className="mt-10">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-accent-secondary)]">
                  Region of the Week
                </p>
                <Link
                  href={featuredRegion.href}
                  className="relative mt-3 block overflow-hidden rounded-2xl border border-[var(--color-accent-secondary)]/12 transition hover:border-[var(--color-accent-secondary)]/30"
                  style={{
                    background: featuredRegion.hero_image_url
                      ? undefined
                      : "linear-gradient(135deg, rgba(123,29,58,0.25) 0%, rgba(74,48,96,0.15) 50%, var(--color-surface-primary) 100%)",
                  }}
                >
                  {/* Cached hero image (never generated from this surface —
                      cached-only, icon-free gradient fallback above when
                      absent) surfaced cheaply as a thumbnail background. */}
                  {featuredRegion.hero_image_url && (
                    <>
                      <AppImage
                        src={featuredRegion.hero_image_url}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      <div
                        className="absolute inset-0"
                        style={{ background: "linear-gradient(180deg, rgba(20,8,12,0.35) 0%, rgba(20,8,12,0.88) 100%)" }}
                      />
                    </>
                  )}
                  <div className="relative p-6">
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
            {/* Also weekly now (same rotation as the region above). */}
            {grapeSpotlight && (
              <div className="mt-10">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-accent-secondary)]">
                  Grape of the Week
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
                      {/* Cached-only thumbnail — icon fallback, never triggers generation. */}
                      <div
                        className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[var(--color-accent-secondary)]/12"
                      >
                        {grapeSpotlight.hero_image_url && (
                          <AppImage
                            src={grapeSpotlight.hero_image_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
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

            {/* ── Explore next ─────────────────────────── */}
            {/* Palate-aware, no LLM call — derived from GET /api/palate's
                already-computed top grape/region affinities via a small
                curated association map (see GRAPE_TO_REGION /
                REGION_TO_GRAPE above). */}
            {exploreNext.length > 0 && (
              <div className="mt-10">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-accent-secondary)]">
                  Explore Next
                </p>
                <div className="mt-3 space-y-2">
                  {exploreNext.map((s) => {
                    const accent = TYPE_ACCENT[s.type];
                    return (
                      <Link
                        key={s.key}
                        href={s.href}
                        className="flex items-center gap-3 rounded-xl border p-4 transition hover:opacity-90"
                        style={{ borderColor: `${accent}25`, background: `${accent}0d` }}
                      >
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                          style={{ background: `${accent}20` }}
                        >
                          {s.type === "region" ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="9" stroke={accent} strokeWidth="1" opacity="0.7" />
                              <circle cx="12" cy="12" r="4.5" stroke={accent} strokeWidth="0.8" opacity="0.5" />
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill={accent}>
                              <circle cx="12" cy="8" r="2.6" opacity="0.65" />
                              <circle cx="9" cy="12.5" r="2.6" opacity="0.5" />
                              <circle cx="15" cy="12.5" r="2.6" opacity="0.65" />
                              <circle cx="12" cy="16.5" r="2.6" opacity="0.45" />
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                            {s.name}
                          </p>
                          <p className="text-[11px] leading-snug text-[var(--color-text-secondary)]">
                            {s.why}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm text-[var(--color-text-tertiary)]">&rarr;</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── New to wine? Start here strip ────────── */}
            {/* No longer hard-routes to a single grape — a small curated
                beginner path across styles, each with a friendly one-liner
                in brand voice. */}
            <div className="mt-10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-accent-secondary)]">
                New to Wine? Start Here
              </p>
              <div className="mt-3 -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
                {START_HERE.map((w) => (
                  <Link
                    key={w.name}
                    href={`/explore/${w.type}/${toExploreSlug(w.name)}`}
                    className="flex w-[168px] shrink-0 flex-col gap-2 rounded-2xl border p-4 transition hover:opacity-90"
                    style={{
                      borderColor: `${GRAPE_ACCENT}25`,
                      background: `linear-gradient(135deg, ${GRAPE_ACCENT}18 0%, var(--color-surface-primary) 100%)`,
                    }}
                  >
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                      {w.name}
                    </p>
                    <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                      {w.blurb}
                    </p>
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
