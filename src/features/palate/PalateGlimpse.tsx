"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TasteMap, { type TasteMapAxis } from "@/features/palate/TasteMap";

/**
 * PalateGlimpse — a compact returning-user moment: a mini TasteMap beside one
 * line of the somm's narrative. Designed to be dropped onto the home / feed
 * surface (Wave 3). Self-contained: it fetches its own data and renders nothing
 * until it has enough signal, so it can be placed unconditionally.
 *
 * Callers may pass `axes` / `line` to bypass fetching (e.g. for previews).
 */

type PalateGlimpseProps = {
  axes?: TasteMapAxis[];
  line?: string;
  topStyle?: string | null;
  href?: string;
  className?: string;
};

type PalateResponse = {
  gated: boolean;
  topStyle: string | null;
  tasteMap: TasteMapAxis[];
  insights: string[];
};

function firstSentence(text: string) {
  const match = text.match(/^[^.!?]*[.!?]/);
  return (match ? match[0] : text).trim();
}

export default function PalateGlimpse({
  axes,
  line,
  topStyle,
  href = "/palate",
  className = "",
}: PalateGlimpseProps) {
  const [fetchedAxes, setFetchedAxes] = useState<TasteMapAxis[] | null>(axes ?? null);
  const [fetchedLine, setFetchedLine] = useState<string | null>(line ?? null);
  const [fetchedStyle, setFetchedStyle] = useState<string | null>(topStyle ?? null);
  const [ready, setReady] = useState(Boolean(axes));

  useEffect(() => {
    if (axes) return; // caller supplied data
    let cancelled = false;
    async function load() {
      try {
        const [palateRes, sommRes] = await Promise.all([
          fetch("/api/palate"),
          fetch("/api/palate/distill").catch(() => null),
        ]);
        if (!palateRes.ok) return;
        const palate = (await palateRes.json()) as PalateResponse;
        if (cancelled || palate.gated || !palate.tasteMap?.length) return;
        setFetchedAxes(palate.tasteMap);
        setFetchedStyle(palate.topStyle);

        let narrativeLine: string | null =
          palate.insights && palate.insights.length > 0 ? palate.insights[0] : null;
        if (sommRes && sommRes.ok) {
          const sJson = (await sommRes.json()) as {
            profile: { narrative?: string } | null;
          };
          if (sJson.profile?.narrative) {
            narrativeLine = firstSentence(sJson.profile.narrative);
          }
        }
        if (!cancelled) {
          setFetchedLine(narrativeLine);
          setReady(true);
        }
      } catch {
        // Silently stay hidden — this is an ambient surface.
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [axes]);

  if (!ready || !fetchedAxes || fetchedAxes.length === 0) return null;

  const headline = fetchedStyle ? `Your palate leans ${fetchedStyle.toLowerCase()}` : "Your palate";

  return (
    <Link
      href={href}
      className={`group flex items-center gap-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/15 p-4 transition hover:border-[var(--color-accent-secondary)]/40 ${className}`}
    >
      <div className="shrink-0">
        <TasteMap
          axes={fetchedAxes}
          variant="card"
          size={104}
          showLegend={false}
          showAxisLabels={false}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-accent-secondary)]">
          Your palate
        </p>
        <p
          className="mt-1 text-[17px] leading-tight text-[var(--color-text-primary)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {headline}
        </p>
        {fetchedLine ? (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-[var(--color-text-secondary)]">
            {fetchedLine}
          </p>
        ) : null}
      </div>
      <span
        className="shrink-0 self-center text-[var(--color-text-tertiary)] transition group-hover:translate-x-0.5 group-hover:text-[var(--color-accent-secondary)]"
        aria-hidden
      >
        →
      </span>
    </Link>
  );
}
