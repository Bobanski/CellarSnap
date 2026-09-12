"use client";

import Link from "next/link";

/**
 * ListScanCta — a compact, always-on prompt to scan a wine list, stacked
 * with PalateGlimpse at the top of the feed (feedback, round 2: "Maybe
 * replace it with the Palate on Feed? Or just put both on top of each
 * other" — this implements the stack). Deliberately matches PalateGlimpse's
 * one-line height/visual language (same row shape, same icon-slot size,
 * same truncating single line of text) so the two rows read as siblings,
 * not competing banners.
 *
 * Unlike PalateGlimpse, this is NOT dismissible — List Scan is a core
 * action, not an ambient insight — but it stays quiet: no color shouting,
 * no badge/pulse, just a plain row identical in weight to the glimpse below
 * it.
 */
export default function ListScanCta({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/list-scan"
      className={`group flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/15 px-3 py-2 transition hover:border-[var(--color-accent-secondary)]/40 ${className}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-secondary)]/12">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[var(--color-accent-secondary)]"
          aria-hidden
        >
          <path d="M4 8V6a2 2 0 0 1 2-2h2" />
          <path d="M16 4h2a2 2 0 0 1 2 2v2" />
          <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
          <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
          <line x1="4" y1="12" x2="20" y2="12" />
        </svg>
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] leading-tight text-[var(--color-text-secondary)]">
        <span
          className="text-[var(--color-text-primary)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Scanning a wine list tonight?
        </span>
        {" "}&middot; Get picks matched to you
      </span>
      <span
        className="shrink-0 text-[var(--color-text-tertiary)] transition group-hover:translate-x-0.5 group-hover:text-[var(--color-accent-secondary)]"
        aria-hidden
      >
        →
      </span>
    </Link>
  );
}
