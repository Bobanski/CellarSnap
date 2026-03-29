"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toExploreSlug, WINE_REGIONS } from "@shared";
import AppShell from "@/components/AppShell";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

// ─── Constants ─────────────────────────────────────────────

const STARTER_GRAPES = [
  "Pinot Noir",
  "Cabernet Sauvignon",
  "Chardonnay",
  "Sauvignon Blanc",
  "Syrah/Shiraz",
  "Nebbiolo",
  "Riesling",
  "Grenache",
  "Merlot",
  "Malbec",
  "Tempranillo",
  "Sangiovese",
];

const POPULAR_REGIONS = [
  "France",
  "Italy",
  "California",
  "Spain",
  "Bordeaux",
  "Burgundy",
  "Napa Valley",
  "Rhône Valley",
  "Tuscany",
  "Piedmont",
  "Oregon",
  "Barossa Valley",
  "Champagne",
  "Rioja",
];

// ─── Types ─────────────────────────────────────────────────

type SearchResult = {
  type: "grape" | "region" | "producer";
  name: string;
  slug: string;
};

type ForYouCard = {
  type: "grape" | "region";
  name: string;
  slug: string;
  tagline: string;
};

type PalateData = {
  topGrapes: { name: string; count: number }[];
  regionStats: { region: string; count: number; avgRating: number }[];
  gated: boolean;
};

// ─── Search hook ───────────────────────────────────────────

function useExploreSearch() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setResults([]);
        setSearching(false);
        return;
      }

      setSearching(true);
      const lower = trimmed.toLowerCase();

      // Search grapes, regions, and producers in parallel
      const grapePromise = fetch(
        `/api/grapes?q=${encodeURIComponent(trimmed)}&limit=6`
      ).then((r) => r.json().catch(() => ({ grapes: [] }))) as Promise<{
        grapes?: { id: string; name: string }[];
      }>;

      const producerPromise = (async (): Promise<string[]> => {
        const { data } = await supabase
          .from("wine_entries")
          .select("producer")
          .not("producer", "is", null)
          .ilike("producer", `%${trimmed}%`)
          .limit(20);
        const rows = (data ?? []) as { producer: string | null }[];
        return Array.from(
          new Set(
            rows
              .map((r) => r.producer?.trim())
              .filter((v): v is string => Boolean(v))
          )
        ).slice(0, 6);
      })();

      const [grapeRes, producerRes] = await Promise.all([
        grapePromise,
        producerPromise,
      ]);

      const regionMatches = (WINE_REGIONS as readonly string[]).filter((r) =>
        r.toLowerCase().includes(lower)
      ).slice(0, 6);

      const merged: SearchResult[] = [];

      (grapeRes.grapes ?? []).forEach(
        (g) => {
          merged.push({
            type: "grape",
            name: g.name,
            slug: toExploreSlug(g.name),
          });
        }
      );

      regionMatches.forEach((r) => {
        merged.push({
          type: "region",
          name: r,
          slug: toExploreSlug(r),
        });
      });

      producerRes.forEach((p) => {
        merged.push({
          type: "producer",
          name: p,
          slug: toExploreSlug(p),
        });
      });

      setResults(merged);
      setSearching(false);
    },
    [supabase]
  );

  const onQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void search(value), 300);
    },
    [search]
  );

  return { query, onQueryChange, results, searching };
}

// ─── For You data hook ─────────────────────────────────────

function useForYou() {
  const [cards, setCards] = useState<ForYouCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/palate");
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data: PalateData = await res.json();

        if (cancelled) return;

        if (data.gated || (!data.topGrapes?.length && !data.regionStats?.length)) {
          setHasData(false);
          setLoading(false);
          return;
        }

        setHasData(true);
        const forYou: ForYouCard[] = [];

        data.topGrapes?.slice(0, 2).forEach((g) => {
          forYou.push({
            type: "grape",
            name: g.name,
            slug: toExploreSlug(g.name),
            tagline: `Logged ${g.count} times`,
          });
        });

        data.regionStats?.slice(0, 2).forEach((r) => {
          forYou.push({
            type: "region",
            name: r.region,
            slug: toExploreSlug(r.region),
            tagline: `Avg rating: ${r.avgRating}`,
          });
        });

        setCards(forYou.slice(0, 4));
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { cards, loading, hasData };
}

// ─── User producers hook ───────────────────────────────────

function useTopProducers() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [producers, setProducers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("wine_entries")
        .select("producer")
        .eq("user_id", user.id)
        .not("producer", "is", null)
        .limit(200);

      if (cancelled) return;

      if (!data || data.length === 0) {
        setLoading(false);
        return;
      }

      // Count occurrences
      const counts = new Map<string, number>();
      data.forEach((row: { producer: string | null }) => {
        const p = row.producer?.trim();
        if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
      });

      const sorted = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([name]) => name);

      setProducers(sorted);
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return { producers, loading };
}

// ─── Section toggle ────────────────────────────────────────

function BrowseSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-3"
      >
        <span
          className="text-[9px] font-bold uppercase tracking-[2px]"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {title}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            color: "var(--color-text-tertiary)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open ? <div className="pb-4">{children}</div> : null}
    </div>
  );
}

// ─── Chip component ────────────────────────────────────────

function Chip({
  label,
  href,
}: {
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="inline-block rounded-full border border-[var(--color-border)] bg-[var(--color-surface-tinted)] px-4 py-2 text-sm transition hover:border-[var(--color-accent-primary)] hover:text-[var(--color-accent-secondary)]"
      style={{ color: "var(--color-text-primary)" }}
    >
      {label}
    </Link>
  );
}

// ─── Type badge ────────────────────────────────────────────

const TYPE_BADGE_LABELS: Record<string, string> = {
  grape: "Grape",
  region: "Region",
  producer: "Producer",
};

function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{
        backgroundColor: "var(--color-surface-hover)",
        color: "var(--color-text-tertiary)",
      }}
    >
      {TYPE_BADGE_LABELS[type] ?? type}
    </span>
  );
}

// ─── Main page ─────────────────────────────────────────────

export default function ExplorePage() {
  const { query, onQueryChange, results, searching } = useExploreSearch();
  const { cards, loading: forYouLoading, hasData } = useForYou();
  const { producers, loading: producersLoading } = useTopProducers();

  const showSearch = query.trim().length >= 2;

  // Group search results by type
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {};
    results.forEach((r) => {
      if (!groups[r.type]) groups[r.type] = [];
      groups[r.type].push(r);
    });
    return groups;
  }, [results]);

  return (
    <AppShell>
      <div
        className="mx-auto w-full px-5 pb-16 pt-6"
        style={{ maxWidth: 800 }}
      >
        {/* Header */}
        <div className="mb-8">
          <p
            className="mb-2 text-[9px] font-bold uppercase tracking-[2px]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Explore
          </p>
          <h1
            className="mb-2 text-2xl font-light"
            style={{
              fontFamily: "var(--font-serif)",
              color: "var(--color-text-primary)",
            }}
          >
            Discover wines matched to your taste.
          </h1>
          <p
            className="text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Browse grapes, regions, and producers — or let your palate lead the
            way.
          </p>
        </div>

        {/* Search bar */}
        <div className="relative mb-8">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search grapes, regions, producers..."
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] py-3 pl-10 pr-4 text-sm outline-none transition placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)]"
              style={{ color: "var(--color-text-primary)" }}
            />
          </div>

          {/* Search results dropdown */}
          {showSearch ? (
            <div
              className="absolute left-0 right-0 top-full z-10 mt-2 overflow-hidden rounded-2xl border border-[var(--color-border)] shadow-lg"
              style={{ backgroundColor: "var(--color-surface-raised)" }}
            >
              {searching ? (
                <div
                  className="px-4 py-6 text-center text-sm"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Searching...
                </div>
              ) : results.length === 0 ? (
                <div
                  className="px-4 py-6 text-center text-sm"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  No results for &ldquo;{query.trim()}&rdquo;
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto py-2">
                  {(["grape", "region", "producer"] as const).map((type) =>
                    groupedResults[type]?.length ? (
                      <div key={type}>
                        <p
                          className="px-4 pb-1 pt-3 text-[9px] font-bold uppercase tracking-[2px]"
                          style={{ color: "var(--color-text-tertiary)" }}
                        >
                          {type === "grape"
                            ? "Grapes"
                            : type === "region"
                              ? "Regions"
                              : "Producers"}
                        </p>
                        {groupedResults[type].map((r) => (
                          <Link
                            key={`${r.type}-${r.slug}`}
                            href={`/explore/${r.type}/${r.slug}`}
                            className="block px-4 py-2 text-sm transition hover:bg-[var(--color-surface-hover)]"
                            style={{ color: "var(--color-text-primary)" }}
                          >
                            {r.name}
                          </Link>
                        ))}
                      </div>
                    ) : null
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* For You section */}
        <div className="mb-8">
          <p
            className="mb-3 text-[9px] font-bold uppercase tracking-[2px]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Based on your palate
          </p>

          {forYouLoading ? (
            <div
              className="rounded-2xl border border-[var(--color-border)] px-4 py-8 text-center text-sm"
              style={{
                backgroundColor: "var(--color-surface-tinted)",
                color: "var(--color-text-tertiary)",
              }}
            >
              Loading...
            </div>
          ) : !hasData ? (
            <div
              className="rounded-2xl border border-[var(--color-border)] px-4 py-8 text-center text-sm"
              style={{
                backgroundColor: "var(--color-surface-tinted)",
                color: "var(--color-text-secondary)",
              }}
            >
              Log a few wines to unlock personalized recommendations
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {cards.map((card) => (
                <Link
                  key={`${card.type}-${card.slug}`}
                  href={`/explore/${card.type}/${card.slug}`}
                  className="group rounded-2xl border border-[var(--color-border)] p-4 transition hover:border-[var(--color-accent-primary)]"
                  style={{ backgroundColor: "var(--color-surface-tinted)" }}
                >
                  <TypeBadge type={card.type} />
                  <p
                    className="mt-2 text-base font-semibold"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {card.name}
                  </p>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {card.tagline}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Browse by Category */}
        <div className="space-y-2">
          <BrowseSection title="Grapes">
            <div className="flex flex-wrap gap-2">
              {STARTER_GRAPES.map((g) => (
                <Chip
                  key={g}
                  label={g}
                  href={`/explore/grape/${toExploreSlug(g)}`}
                />
              ))}
            </div>
          </BrowseSection>

          <BrowseSection title="Regions">
            <div className="flex flex-wrap gap-2">
              {POPULAR_REGIONS.map((r) => (
                <Chip
                  key={r}
                  label={r}
                  href={`/explore/region/${toExploreSlug(r)}`}
                />
              ))}
            </div>
          </BrowseSection>

          <BrowseSection title="Producers">
            {producersLoading ? (
              <p
                className="py-4 text-sm"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Loading...
              </p>
            ) : producers.length === 0 ? (
              <p
                className="py-4 text-sm"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Your top producers will appear here as you log wines.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {producers.map((p) => (
                  <Chip
                    key={p}
                    label={p}
                    href={`/explore/producer/${toExploreSlug(p)}`}
                  />
                ))}
              </div>
            )}
          </BrowseSection>
        </div>
      </div>
    </AppShell>
  );
}
