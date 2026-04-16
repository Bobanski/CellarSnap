"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toExploreSlug } from "@shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import AppShell from "@/components/AppShell";

// ---------------------------------------------------------------------------
// Colors — matching profile page palette
// ---------------------------------------------------------------------------

const ROSE = "#C4607A";
const GRENACHE = "#7B1D3A";
const CHAMPAGNE = "#F5EDD6";
const FOG = "#A08878";
const VIOGNIER = "#C9A84C";
const NEBBIOLO = "#4A3060";
const BG_SECTION = "#220E14";

type Producer = { name: string; count: number };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProducersBrowsePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [query, setQuery] = useState("");
  const [producers, setProducers] = useState<Producer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

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
            {loading ? (
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
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: VIOGNIER }}>
                    Most Logged
                  </p>
                  <div className="space-y-0.5">
                    {topProducers.map((p, i) => (
                      <Link
                        key={p.name}
                        href={`/explore/producer/${toExploreSlug(p.name)}`}
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-[var(--color-surface-raised)]"
                      >
                        <span className="w-5 text-center text-sm font-light" style={{ fontFamily: "var(--font-serif)", color: FOG }}>
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1 text-sm" style={{ color: CHAMPAGNE }}>
                          {p.name}
                        </span>
                        <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px]" style={{ background: `${ROSE}18`, color: ROSE }}>
                          {p.count} {p.count === 1 ? "entry" : "entries"}
                        </span>
                      </Link>
                    ))}
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
