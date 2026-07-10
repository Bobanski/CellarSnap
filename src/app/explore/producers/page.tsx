"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toExploreSlug } from "@shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import AppShell from "@/components/AppShell";
import AppImage from "@/components/AppImage";

// ---------------------------------------------------------------------------
// Colors — matching profile page palette
// ---------------------------------------------------------------------------

const ROSE = "#C4607A";
const GRENACHE = "#7B1D3A";
const CHAMPAGNE = "#F5EDD6";
const FOG = "#A08878";
const BG_SECTION = "#220E14";

type Producer = { name: string; count: number };

// producer_modifiers.price_tier_numeric runs roughly 1 (Entry/mass-market)
// through 5 (Ultra-luxury). "Iconic Names" surfaces the trophy/cult tier;
// "Small Growers" is everything more attainable and human-scale, tier 1
// (mass-market-priced) included since the split here is about scale/renown,
// not the accessible-vs-aspirational curation used for recommendation
// surfaces elsewhere (see the [type]/[slug] route, which excludes tier 1
// entirely as "mass market").
const ICONIC_MIN_TIER = 4;
type TierView = "iconic" | "growers";
type TierProducer = { name: string; region: string | null; tier: number; tierLabel: string };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProducersBrowsePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [query, setQuery] = useState("");
  const [producers, setProducers] = useState<Producer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  // Cached wine_profiles hero images for the Most Logged list — cached-only
  // lookup, never triggers generation from this browse surface.
  const [producerThumbs, setProducerThumbs] = useState<Map<string, string>>(new Map());

  // "Iconic Names" vs "Small Growers" entry split (producer_modifiers tier)
  const [tierView, setTierView] = useState<TierView | null>(null);
  const [tierProducers, setTierProducers] = useState<TierProducer[]>([]);
  const [tierLoading, setTierLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) { setLoading(false); return; }
      const { data } = await supabase
        .from("wine_entries")
        .select("producer")
        .eq("user_id", user.id)
        .not("producer", "is", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (!mounted || !data) { setLoading(false); return; }
      const counts = new Map<string, number>();
      for (const row of data) {
        const p = (row.producer as string)?.trim();
        if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
      }
      if (mounted) {
        setProducers([...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })));
        setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [supabase]);

  // Cached hero images for the Most Logged strip.
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const names = producers.slice(0, 10).map((p) => p.name);
      if (names.length === 0) return;
      const { data } = await supabase
        .from("wine_profiles")
        .select("slug, hero_image_url")
        .eq("profile_type", "producer")
        .in("slug", names.map(toExploreSlug))
        .not("hero_image_url", "is", null);
      if (!mounted || !data) return;
      setProducerThumbs(new Map(data.map((r: { slug: string; hero_image_url: string }) => [r.slug, r.hero_image_url])));
    };
    load();
    return () => { mounted = false; };
  }, [supabase, producers]);

  // Load the curated producer_modifiers roster for whichever tier card is
  // selected. producer_modifiers is a public reference table (RLS allows
  // read for all authenticated users), so this queries it directly.
  const selectTierView = (view: TierView) => {
    if (tierView === view) { setTierView(null); return; }
    setTierView(view);
    setTierLoading(true);
    const query = supabase
      .from("producer_modifiers")
      .select("producer_name, region, price_tier_numeric, price_tier_label")
      .order("confidence", { ascending: false })
      .limit(120);
    const scoped = view === "iconic"
      ? query.gte("price_tier_numeric", ICONIC_MIN_TIER)
      : query.lt("price_tier_numeric", ICONIC_MIN_TIER);
    scoped.then((result: { data: Array<{ producer_name: string | null; region: string | null; price_tier_numeric: number | null; price_tier_label: string | null }> | null }) => {
      const { data } = result;
      const seen = new Set<string>();
      const rows: TierProducer[] = [];
      for (const row of data ?? []) {
        const name = (row.producer_name as string)?.trim();
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        rows.push({
          name,
          region: (row.region as string) ?? null,
          tier: (row.price_tier_numeric as number) ?? 0,
          tierLabel: (row.price_tier_label as string) ?? "",
        });
      }
      rows.sort((a, b) => a.name.localeCompare(b.name));
      setTierProducers(rows);
      setTierLoading(false);
    });
  };

  const isSearching = query.trim().length > 0;

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];
    return producers.filter((p) => p.name.toLowerCase().includes(trimmed));
  }, [query, producers]);

  const topProducers = producers.slice(0, 10);
  const restProducers = producers.slice(10);

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
          style={{ background: `linear-gradient(135deg, ${ROSE}20 0%, ${GRENACHE}15 60%, ${BG_SECTION} 100%)` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ background: `${ROSE}18` }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <rect x="8" y="3" width="8" height="13" rx="4" fill={ROSE} opacity="0.4" />
                <rect x="10" y="16" width="4" height="4" rx="0.6" fill={ROSE} opacity="0.55" />
                <line x1="7" y1="20" x2="17" y2="20" stroke={ROSE} strokeWidth="0.8" opacity="0.4" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-light leading-tight" style={{ fontFamily: "var(--font-serif)", color: CHAMPAGNE }}>
                Producers
              </h1>
              <p className="text-xs" style={{ color: FOG }}>
                The makers behind the wine.
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
            placeholder="Search your producers..."
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-3 pl-10 pr-4 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] outline-none transition focus:border-[var(--color-border-strong)]"
          />
        </div>

        {/* ── Search results ─────────────────────────── */}
        {isSearching && (
          <div className="mt-4">
            {filtered.length === 0 ? (
              <div className="rounded-2xl p-5 text-center" style={{ background: BG_SECTION, border: `1px solid ${ROSE}15` }}>
                <p className="text-sm" style={{ color: FOG }}>No producers found.</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {filtered.map((p) => (
                  <Link
                    key={p.name}
                    href={`/explore/producer/${toExploreSlug(p.name)}`}
                    className="flex items-center justify-between rounded-lg px-3 py-2.5 transition hover:bg-[var(--color-surface-raised)]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ROSE }} />
                      <span className="text-sm" style={{ color: CHAMPAGNE }}>{p.name}</span>
                    </div>
                    <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: `${ROSE}18`, color: ROSE }}>
                      {p.count}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Discovery content ──────────────────────── */}
        {!isSearching && (
          <>
            {/* ── Iconic Names vs Small Growers entry split ────── */}
            {/* Dani: producer page was underdeveloped — this splits the
                catalog by producer_modifiers price tier so a visitor with no
                logged producers yet still has a way in. */}
            <div className="mt-8 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => selectTierView("iconic")}
                className="flex flex-col items-start gap-1.5 rounded-2xl p-4 text-left transition hover:opacity-90"
                style={{
                  background: tierView === "iconic" ? `${ROSE}22` : `${ROSE}10`,
                  border: `1px solid ${tierView === "iconic" ? ROSE : `${ROSE}20`}`,
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2.5 L14.5 9 L21 9.8 L16.2 14.3 L17.6 21 L12 17.5 L6.4 21 L7.8 14.3 L3 9.8 L9.5 9 Z" fill={ROSE} opacity="0.55" />
                </svg>
                <p className="text-sm font-semibold" style={{ color: CHAMPAGNE }}>Iconic Names</p>
                <p className="text-[10px] leading-snug" style={{ color: FOG }}>The legends and cult labels worth knowing</p>
              </button>
              <button
                type="button"
                onClick={() => selectTierView("growers")}
                className="flex flex-col items-start gap-1.5 rounded-2xl p-4 text-left transition hover:opacity-90"
                style={{
                  background: tierView === "growers" ? `${GRENACHE}25` : `${GRENACHE}12`,
                  border: `1px solid ${tierView === "growers" ? GRENACHE : `${GRENACHE}20`}`,
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M12 3 C9 6 7 9.5 7 12.5 C7 15.5 9.2 18 12 18 C14.8 18 17 15.5 17 12.5 C17 9.5 15 6 12 3 Z" fill={GRENACHE} opacity="0.6" />
                  <line x1="12" y1="18" x2="12" y2="21" stroke={GRENACHE} strokeWidth="1" opacity="0.6" />
                </svg>
                <p className="text-sm font-semibold" style={{ color: CHAMPAGNE }}>Small Growers</p>
                <p className="text-[10px] leading-snug" style={{ color: FOG }}>Accessible, high-quality, human-scale</p>
              </button>
            </div>

            {tierView && (
              <div className="mt-4">
                {tierLoading ? (
                  <p className="text-xs" style={{ color: FOG }}>Loading…</p>
                ) : tierProducers.length === 0 ? (
                  <p className="text-xs" style={{ color: FOG }}>No producers found for this tier yet.</p>
                ) : (
                  <div className="space-y-0.5">
                    {tierProducers.map((p) => (
                      <Link
                        key={p.name}
                        href={`/explore/producer/${toExploreSlug(p.name)}`}
                        className="flex items-center justify-between rounded-lg px-3 py-2.5 transition hover:bg-[var(--color-surface-raised)]"
                      >
                        <div className="min-w-0">
                          <span className="text-sm" style={{ color: CHAMPAGNE }}>{p.name}</span>
                          {p.region && (
                            <span className="ml-2 text-[10px]" style={{ color: FOG }}>{p.region}</span>
                          )}
                        </div>
                        <span className="shrink-0 text-sm" style={{ color: FOG }}>&rarr;</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tierView ? null : loading ? (
              <div className="mt-8 space-y-2 animate-pulse">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl px-4 py-3.5" style={{ background: BG_SECTION }}>
                    <div className="h-3.5 w-32 rounded bg-[var(--color-surface-raised)]" />
                    <div className="h-3 w-14 rounded-full bg-[var(--color-surface-raised)]" />
                  </div>
                ))}
              </div>
            ) : producers.length === 0 ? (
              <div
                className="mt-8 rounded-2xl p-8 text-center"
                style={{ background: `linear-gradient(135deg, ${ROSE}10 0%, ${BG_SECTION} 100%)`, border: `1px solid ${ROSE}15` }}
              >
                <div
                  className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
                  style={{ background: `${ROSE}12` }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <rect x="8" y="3" width="8" height="13" rx="4" fill={ROSE} opacity="0.3" />
                    <rect x="10" y="16" width="4" height="4" rx="0.6" fill={ROSE} opacity="0.4" />
                    <line x1="7" y1="20" x2="17" y2="20" stroke={ROSE} strokeWidth="0.8" opacity="0.3" />
                  </svg>
                </div>
                <p className="text-lg font-light" style={{ fontFamily: "var(--font-serif)", color: CHAMPAGNE }}>
                  No producers yet.
                </p>
                <p className="mt-2 text-xs" style={{ color: FOG }}>
                  Log wines with producer names and they&apos;ll appear here — ranked by how often you reach for them.
                </p>
              </div>
            ) : (
              <>
                {/* ── Most Logged ─────────────────────────── */}
                <div className="mt-8 rounded-2xl p-5" style={{ background: BG_SECTION, border: `1px solid ${ROSE}12` }}>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: ROSE }}>
                    Most Logged
                  </p>
                  <div className="space-y-0.5">
                    {topProducers.map((p, i) => {
                      const thumb = producerThumbs.get(toExploreSlug(p.name));
                      return (
                        <Link
                          key={p.name}
                          href={`/explore/producer/${toExploreSlug(p.name)}`}
                          className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-[var(--color-surface-raised)]"
                        >
                          <span className="w-5 text-center text-sm font-light" style={{ fontFamily: "var(--font-serif)", color: FOG }}>
                            {i + 1}
                          </span>
                          {/* Cached-only thumbnail — falls back to a plain dot when no image has been generated yet. */}
                          <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full" style={{ background: `${ROSE}25` }}>
                            {thumb && <AppImage src={thumb} alt="" className="h-full w-full object-cover" />}
                          </div>
                          <span className="min-w-0 flex-1 text-sm" style={{ color: CHAMPAGNE }}>
                            {p.name}
                          </span>
                          <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px]" style={{ background: `${ROSE}18`, color: ROSE }}>
                            {p.count} {p.count === 1 ? "entry" : "entries"}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>

                {/* ── All Producers ───────────────────────── */}
                {restProducers.length > 0 && (
                  <div className="mt-8">
                    <button type="button" onClick={() => setShowAll(!showAll)} className="flex w-full items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: FOG }}>All Producers</p>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.15em] transition hover:opacity-80" style={{ color: ROSE }}>
                        {showAll ? "Hide" : `Show ${restProducers.length} more`}
                      </span>
                    </button>
                    {showAll && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {restProducers.map((p) => (
                          <Link
                            key={p.name}
                            href={`/explore/producer/${toExploreSlug(p.name)}`}
                            className="rounded-full px-3 py-1.5 text-xs transition hover:opacity-80"
                            style={{ background: `${ROSE}10`, color: FOG, border: `1px solid ${ROSE}15` }}
                          >
                            {p.name}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
