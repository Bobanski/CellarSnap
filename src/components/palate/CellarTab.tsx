"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import AppImage from "@/components/AppImage";

const GRENACHE = "#7B1D3A";
const ROSE = "#C4607A";
const CHAMPAGNE = "#F5EDD6";
const FOG = "#A08878";
const VIOGNIER = "#C9A84C";

type CellarWine = {
  id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  label_image_url: string | null;
  cellar_quantity: number;
};

export function CellarTab() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [wines, setWines] = useState<CellarWine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) { setLoading(false); return; }

      const { data } = await supabase
        .from("wine_entries")
        .select("id, wine_name, producer, vintage, label_image_url, cellar_quantity")
        .eq("user_id", user.id)
        .eq("entry_status", "cellaring")
        .gt("cellar_quantity", 0)
        .order("created_at", { ascending: false })
        .limit(20);

      if (mounted) {
        setWines((data as CellarWine[]) ?? []);
        setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [supabase]);

  const totalBottles = wines.reduce((sum, w) => sum + (w.cellar_quantity ?? 0), 0);

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl p-3" style={{ background: "#220E14" }}>
            <div className="h-12 w-12 shrink-0 rounded-lg bg-[var(--color-surface-raised)]" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-32 rounded bg-[var(--color-surface-raised)]" />
              <div className="h-2.5 w-20 rounded bg-[var(--color-surface-raised)]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (wines.length === 0) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{ background: `linear-gradient(135deg, ${GRENACHE}10 0%, #220E14 100%)`, border: `1px solid ${GRENACHE}15` }}
      >
        <p className="text-lg font-light" style={{ fontFamily: "var(--font-serif)", color: CHAMPAGNE }}>
          Your cellar is empty.
        </p>
        <p className="mt-2 text-xs" style={{ color: FOG }}>
          Start cellaring wines to track what you have on hand.
        </p>
        <Link
          href="/entries/new"
          className="mt-4 inline-block rounded-full px-4 py-2 text-xs font-semibold transition hover:opacity-90"
          style={{ background: GRENACHE, color: CHAMPAGNE }}
        >
          Log a wine
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs" style={{ color: FOG }}>
          <span style={{ color: CHAMPAGNE, fontWeight: 600 }}>{totalBottles}</span> bottle{totalBottles !== 1 ? "s" : ""} across{" "}
          <span style={{ color: CHAMPAGNE, fontWeight: 600 }}>{wines.length}</span> wine{wines.length !== 1 ? "s" : ""}
        </p>
        <Link
          href="/entries?tab=cellaring"
          className="text-[10px] font-semibold uppercase tracking-[0.15em] transition hover:opacity-80"
          style={{ color: ROSE }}
        >
          View full cellar &rarr;
        </Link>
      </div>

      <div className="space-y-1.5">
        {wines.map((wine) => (
          <Link
            key={wine.id}
            href={`/entries/${wine.id}`}
            className="flex items-center gap-3 rounded-xl p-3 transition hover:bg-[var(--color-surface-raised)]"
            style={{ border: `1px solid ${GRENACHE}12` }}
          >
            {wine.label_image_url ? (
              <AppImage
                src={wine.label_image_url}
                alt=""
                className="h-12 w-12 shrink-0 rounded-lg object-cover"
                width={48}
                height={48}
              />
            ) : (
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-sm"
                style={{ background: `${GRENACHE}15`, color: FOG }}
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill={FOG}>
                  <rect x="7" y="2" width="6" height="10" rx="3" opacity="0.4" />
                  <rect x="8.5" y="12" width="3" height="4" rx="0.5" opacity="0.5" />
                  <line x1="6" y1="16" x2="14" y2="16" stroke={FOG} strokeWidth="0.8" opacity="0.4" />
                </svg>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm" style={{ color: CHAMPAGNE }}>
                {wine.wine_name ?? "Unknown wine"}
              </p>
              <p className="truncate text-[10px]" style={{ color: FOG }}>
                {[wine.producer, wine.vintage].filter(Boolean).join(" · ")}
              </p>
            </div>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: `${GRENACHE}20`, color: ROSE }}
            >
              {wine.cellar_quantity}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
