"use client";

/**
 * EmptyState — one pattern for every empty/error surface (design-audit
 * spec E). Replaces the generic image-placeholder icons and flat
 * "No new alerts yet." text with: brand motif + warm serif line + body +
 * optional CTA.
 *
 * The default icon reuses the grape-cluster geometry from the badge
 * system's "cluster" shape (src/features/badges/BadgeIcon.tsx), rendered
 * as a translucent line-art silhouette so it reads as "this concept has
 * no data yet" rather than a locked badge.
 */

import type { ReactNode } from "react";

export function GrapeClusterMotif({ size = 56, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="40" cy="28" r="7" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
      <circle cx="30" cy="40" r="7" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <circle cx="50" cy="40" r="7" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
      <circle cx="40" cy="52" r="7" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      <line x1="40" y1="21" x2="40" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <path d="M40 17 Q47 14 50 17" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

export default function EmptyState({
  icon,
  title,
  body,
  cta,
  className = "",
}: {
  /** Defaults to the grape-cluster motif. Pass a different node for a bespoke moment. */
  icon?: ReactNode;
  /** Warm, on-voice serif line — not "No X yet." database copy. */
  title: string;
  body?: string;
  cta?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/20 px-6 py-10 text-center ${className}`.trim()}
    >
      <span className="text-[var(--color-accent-secondary)]">
        {icon ?? <GrapeClusterMotif />}
      </span>
      <p
        className="max-w-xs text-[var(--color-text-primary)]"
        style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 400, lineHeight: 1.3 }}
      >
        {title}
      </p>
      {body ? (
        <p className="max-w-xs text-sm leading-relaxed text-[var(--color-text-secondary)]">
          {body}
        </p>
      ) : null}
      {cta ? <div className="mt-2">{cta}</div> : null}
    </div>
  );
}
