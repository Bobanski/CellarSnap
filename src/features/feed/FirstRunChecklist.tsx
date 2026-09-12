"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const SOMMELIER_VISITED_KEY = "cluster:visitedSommelier";

function CheckGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <polyline
        points="5 10.5 8.5 14 15 6.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChecklistCard({
  href,
  title,
  body,
  done,
  onNavigate,
}: {
  href: string;
  title: string;
  body: string;
  done: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`group flex items-start gap-3 rounded-2xl border p-4 transition ${
        done
          ? "border-[var(--color-border)] bg-[var(--color-surface-primary)]/20"
          : "border-[var(--color-border)] bg-[var(--color-surface-primary)]/40 hover:border-[var(--color-accent-secondary)]/40"
      }`}
    >
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
          done
            ? "border-[var(--color-natural)] bg-[var(--color-natural)]/20 text-[var(--color-natural-light)]"
            : "border-[var(--color-border-strong)] text-[var(--color-text-tertiary)] group-hover:text-[var(--color-accent-secondary)]"
        }`}
      >
        {done ? <CheckGlyph /> : null}
      </span>
      <span className="min-w-0">
        <span
          className={`block text-sm font-semibold ${
            done ? "text-[var(--color-text-secondary)] line-through decoration-[var(--color-border-strong)]" : "text-[var(--color-text-primary)]"
          }`}
        >
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-[var(--color-text-tertiary)]">
          {body}
        </span>
      </span>
    </Link>
  );
}

/**
 * Replaces the "No entries yet." dead end on the feed with a 3-card
 * first-run checklist in brand voice. Done-states are best-effort: entry
 * count and saved-scan count come from the user's own data; the Sommelier
 * card flips once the user has actually opened /sommelier (localStorage,
 * since chat history itself isn't persisted server-side yet).
 */
export default function FirstRunChecklist() {
  const [hasLoggedWine, setHasLoggedWine] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [hasVisitedSommelier, setHasVisitedSommelier] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(SOMMELIER_VISITED_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const response = await fetch("/api/entries?limit=1", { cache: "no-store" });
        if (!response.ok || !isMounted) return;
        const payload = await response.json().catch(() => ({}));
        const entries = Array.isArray(payload?.entries) ? payload.entries : [];
        const totalCount = typeof payload?.total_count === "number" ? payload.total_count : null;
        if (isMounted) setHasLoggedWine((totalCount ?? entries.length) > 0);
      } catch {
        // Best-effort — leave the checklist item unchecked on failure.
      }
    })();

    (async () => {
      try {
        const response = await fetch("/api/list-scan/scans", { cache: "no-store" });
        if (!response.ok || !isMounted) return;
        const payload = await response.json().catch(() => ({}));
        const scans = Array.isArray(payload?.scans) ? payload.scans : [];
        if (isMounted) setHasScanned(scans.length > 0);
      } catch {
        // Best-effort — leave the checklist item unchecked on failure.
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const markSommelierVisited = () => {
    setHasVisitedSommelier(true);
    try {
      window.localStorage.setItem(SOMMELIER_VISITED_KEY, "1");
    } catch {
      // Ignore storage failures.
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-5">
      <p
        className="text-[var(--color-text-primary)]"
        style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 400 }}
      >
        No logs yet &mdash; every bottle has a story.
      </p>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Start with one of these and your feed (and your palate) will fill in fast.
      </p>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
        <ChecklistCard
          href="/entries/new"
          title="Log your first wine"
          body="Snap the label or enter it by hand — takes about a minute."
          done={hasLoggedWine}
        />
        <ChecklistCard
          href="/list-scan"
          title="Scan a wine list"
          body="Point at any restaurant list, get picks matched to you."
          done={hasScanned}
        />
        <ChecklistCard
          href="/sommelier"
          title="Meet your pocket somm"
          body="Ask it anything — no wrong questions, ever."
          done={hasVisitedSommelier}
          onNavigate={markSommelierVisited}
        />
      </div>
    </div>
  );
}
