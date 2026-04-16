"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import AppImage from "@/components/AppImage";

const GRENACHE = "#7B1D3A";
const ROSE = "#C4607A";
const CHAMPAGNE = "#F0ECE4";
const FOG = "#8A8078";

type LibraryEntry = {
  id: string;
  wine_name: string | null;
  label_image_url: string | null;
};

export function LibraryTab() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadEntries = async (afterCursor?: string | null) => {
    const isInitial = !afterCursor;
    if (isInitial) setLoading(true); else setLoadingMore(true);

    try {
      const params = new URLSearchParams({ limit: "60", sort: "consumed_at" });
      if (afterCursor) params.set("cursor", afterCursor);
      const res = await fetch(`/api/entries?${params}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const newEntries = (data.entries ?? []) as LibraryEntry[];
      setEntries((prev) => isInitial ? newEntries : [...prev, ...newEntries]);
      setCursor(data.next_cursor ?? null);
      setHasMore(Boolean(data.next_cursor));
    } catch { /* ignore */ }
    finally {
      if (isInitial) setLoading(false); else setLoadingMore(false);
    }
  };

  useEffect(() => { loadEntries(); }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 animate-pulse">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-lg bg-[var(--color-surface-raised)]" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{ background: `linear-gradient(135deg, ${GRENACHE}10 0%, #0F0810 100%)`, border: `1px solid ${GRENACHE}15` }}
      >
        <p className="text-lg font-light" style={{ fontFamily: "var(--font-serif)", color: CHAMPAGNE }}>
          No wines logged yet.
        </p>
        <p className="mt-2 text-xs" style={{ color: FOG }}>
          Your wine library will appear here as you log entries.
        </p>
        <Link
          href="/entries/new"
          className="mt-4 inline-block rounded-full px-4 py-2 text-xs font-semibold transition hover:opacity-90"
          style={{ background: GRENACHE, color: CHAMPAGNE }}
        >
          Log your first wine
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs" style={{ color: FOG }}>
          <span style={{ color: CHAMPAGNE, fontWeight: 600 }}>{entries.length}{hasMore ? "+" : ""}</span> wines logged
        </p>
        <Link
          href="/entries"
          className="text-[10px] font-semibold uppercase tracking-[0.15em] transition hover:opacity-80"
          style={{ color: ROSE }}
        >
          Full library &rarr;
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5">
        {entries.map((entry) => (
          <Link
            key={entry.id}
            href={`/entries/${entry.id}?from=profile`}
            className="group relative aspect-square overflow-hidden rounded-lg transition"
            style={{ background: `${GRENACHE}12` }}
          >
            {entry.label_image_url ? (
              <AppImage
                src={entry.label_image_url}
                alt={entry.wine_name ?? ""}
                className="h-full w-full object-cover transition group-hover:scale-105"
                width={200}
                height={200}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 20 20" fill={FOG} opacity="0.4">
                  <rect x="7" y="2" width="6" height="10" rx="3" />
                  <rect x="8.5" y="12" width="3" height="4" rx="0.5" />
                  <line x1="6" y1="16" x2="14" y2="16" stroke={FOG} strokeWidth="0.8" />
                </svg>
              </div>
            )}
          </Link>
        ))}
      </div>

      {hasMore && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => loadEntries(cursor)}
            disabled={loadingMore}
            className="rounded-full px-5 py-2 text-xs font-semibold transition hover:opacity-90 disabled:opacity-50"
            style={{ background: `${GRENACHE}20`, color: ROSE, border: `1px solid ${GRENACHE}25` }}
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
