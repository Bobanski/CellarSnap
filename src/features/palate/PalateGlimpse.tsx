"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import TasteMap, { type TasteMapAxis } from "@/features/palate/TasteMap";

/**
 * PalateGlimpse — a compact returning-user moment: a mini TasteMap beside one
 * line of the somm's narrative. Designed to be dropped onto the home / feed
 * surface (Wave 3). Self-contained: it fetches its own data and renders nothing
 * until it has enough signal, so it can be placed unconditionally.
 *
 * Deliberately compact and dismissible (feedback: the palate reads slowly —
 * it doesn't need to be front-and-center on every feed visit). Renders as a
 * single-line row with a tiny map + one line of text. An explicit X hides it;
 * that choice is remembered in localStorage and only cleared when the somm's
 * narrative actually changes (a new `updated_at`), so a fresh read always
 * resurfaces it once.
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

type DistillResponse = {
  profile: { narrative?: string } | null;
  updated_at?: string;
};

function firstSentence(text: string) {
  const match = text.match(/^[^.!?]*[.!?]/);
  return (match ? match[0] : text).trim();
}

function dismissalStorageKey(userId: string | null) {
  return `cellarsnap:palate_glimpse_dismissed:${userId ?? "anon"}`;
}

export default function PalateGlimpse({
  axes,
  line,
  topStyle,
  href = "/palate",
  className = "",
}: PalateGlimpseProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [fetchedAxes, setFetchedAxes] = useState<TasteMapAxis[] | null>(axes ?? null);
  const [fetchedLine, setFetchedLine] = useState<string | null>(line ?? null);
  const [fetchedStyle, setFetchedStyle] = useState<string | null>(topStyle ?? null);
  const [ready, setReady] = useState(Boolean(axes));
  // The narrative "version" — its updated_at when we have a distilled somm
  // narrative, otherwise a stable stand-in derived from the content itself.
  // Dismissal is keyed to this so a genuinely new read reopens the glimpse.
  const [narrativeVersion, setNarrativeVersion] = useState<string | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerLoaded, setViewerLoaded] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string | null | undefined>(
    undefined
  );

  useEffect(() => {
    let isMounted = true;
    const loadViewer = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (isMounted) setViewerUserId(data.user?.id ?? null);
      } catch {
        if (isMounted) setViewerUserId(null);
      } finally {
        if (isMounted) setViewerLoaded(true);
      }
    };
    loadViewer();
    return () => {
      isMounted = false;
    };
  }, [supabase]);

  // Load the remembered dismissal once we know who's viewing (or that no one
  // is signed in / it's an anon preview) so we don't flash the full row.
  useEffect(() => {
    if (!viewerLoaded) return;
    try {
      const stored = localStorage.getItem(dismissalStorageKey(viewerUserId));
      setDismissedVersion(stored);
    } catch {
      setDismissedVersion(null);
    }
  }, [viewerLoaded, viewerUserId]);

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
        let version: string | null = null;
        if (sommRes && sommRes.ok) {
          const sJson = (await sommRes.json()) as DistillResponse;
          if (sJson.profile?.narrative) {
            narrativeLine = firstSentence(sJson.profile.narrative);
          }
          version = sJson.updated_at ?? null;
        }
        // No distilled narrative (not configured / not yet run) — fall back to
        // the insight text itself as the "version" so a changed insight still
        // resurfaces a previously-dismissed glimpse.
        if (!version) {
          version = narrativeLine ?? palate.topStyle ?? "static";
        }

        if (!cancelled) {
          setFetchedLine(narrativeLine);
          setNarrativeVersion(version);
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

  const dismiss = () => {
    const version = narrativeVersion ?? "static";
    setDismissedVersion(version);
    try {
      localStorage.setItem(dismissalStorageKey(viewerUserId), version);
    } catch {
      // Ignore storage failures (private mode, etc).
    }
  };

  if (!ready || !fetchedAxes || fetchedAxes.length === 0) return null;
  // Still resolving the stored dismissal — avoid a flash of content that may
  // immediately need to disappear.
  if (dismissedVersion === undefined) return null;
  if (dismissedVersion !== null && dismissedVersion === (narrativeVersion ?? "static")) {
    return null;
  }

  const headline = fetchedStyle ? `Your palate leans ${fetchedStyle.toLowerCase()}` : "Your palate";

  return (
    <div
      className={`group flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/15 px-3 py-2 transition hover:border-[var(--color-accent-secondary)]/40 ${className}`}
    >
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="shrink-0">
          <TasteMap
            axes={fetchedAxes}
            variant="card"
            size={40}
            showLegend={false}
            showAxisLabels={false}
          />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] leading-tight text-[var(--color-text-secondary)]">
          <span
            className="text-[var(--color-text-primary)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {headline}
          </span>
          {fetchedLine ? <> &middot; {fetchedLine}</> : null}
        </span>
        <span
          className="shrink-0 text-[var(--color-text-tertiary)] transition group-hover:translate-x-0.5 group-hover:text-[var(--color-accent-secondary)]"
          aria-hidden
        >
          →
        </span>
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Hide palate glimpse"
        className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-primary)]"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
