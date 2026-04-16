"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toExploreSlug } from "@shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import AppShell from "@/components/AppShell";

export default function ProducersBrowsePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [query, setQuery] = useState("");
  const [producers, setProducers] = useState<Array<{ name: string; count: number }>>([]);
  const [loading, setLoading] = useState(true);

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
      const sorted = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }));
      if (mounted) {
        setProducers(sorted);
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

  const topProducers = producers.slice(0, 12);
  const restProducers = producers.slice(12);

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
          Producers
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          The makers behind the wine — explore the producers you&apos;ve been drinking.
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
            placeholder="Search your producers..."
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-3 pl-10 pr-4 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] outline-none transition focus:border-[var(--color-border-strong)]"
          />
        </div>

        {/* Search results */}
        {isSearching && (
          <div className="mt-4">
            {filtered.length === 0 ? (
              <p className="text-sm text-[var(--color-text-tertiary)]">No producers found.</p>
            ) : (
              <div className="space-y-1">
                {filtered.map((p) => (
                  <Link
                    key={p.name}
                    href={`/explore/producer/${toExploreSlug(p.name)}`}
                    className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-[var(--color-text-primary)] transition hover:bg-[var(--color-surface-raised)]"
                  >
                    <span>{p.name}</span>
                    <span className="text-[10px] text-[var(--color-text-tertiary)]">
                      {p.count} {p.count === 1 ? "entry" : "entries"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Browse */}
        {!isSearching && (
          <>
            {loading ? (
              <div className="mt-8 space-y-2 animate-pulse">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-[var(--color-surface-primary)] px-3 py-3">
                    <div className="h-3.5 w-32 rounded bg-[var(--color-surface-raised)]" />
                    <div className="h-3 w-12 rounded bg-[var(--color-surface-raised)]" />
                  </div>
                ))}
              </div>
            ) : producers.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] p-6 text-center">
                <p className="text-sm text-[var(--color-text-secondary)]">
                  No producers yet. Log wines with producer names to build your list.
                </p>
              </div>
            ) : (
              <>
                <div className="mt-8">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                    Most Logged
                  </p>
                  <div className="space-y-1">
                    {topProducers.map((p) => (
                      <Link
                        key={p.name}
                        href={`/explore/producer/${toExploreSlug(p.name)}`}
                        className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-[var(--color-text-primary)] transition hover:bg-[var(--color-surface-raised)]"
                      >
                        <span>{p.name}</span>
                        <span className="text-[10px] text-[var(--color-text-tertiary)]">
                          {p.count} {p.count === 1 ? "entry" : "entries"}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>

                {restProducers.length > 0 && (
                  <div className="mt-6">
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                      All Producers
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {restProducers.map((p) => (
                        <Link
                          key={p.name}
                          href={`/explore/producer/${toExploreSlug(p.name)}`}
                          className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
                        >
                          {p.name}
                        </Link>
                      ))}
                    </div>
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
