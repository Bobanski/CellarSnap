"use client";

/**
 * ScoreBadge — the ONE score/match presentation (design-audit spec C).
 *
 * Replaces the three competing score treatments found in the audit (gold
 * feed "Pts", rose entries-list chip, green landing match ring) with a
 * single component:
 *   - Cormorant `numeric` token, cream on --color-accent-soft, radius-8.
 *   - Fixed min-width so missing scores reserve space — an em-dash
 *     placeholder, never a ragged gap.
 *   - Color encodes TIER, not category: >=95 earns a subtle gold hairline
 *     ring (the only ordinary-score gold allowed); everything else is
 *     cream/rose. Never a full-gold fill for an ordinary score.
 *   - Optional count-up reveal animation (motion spec H).
 *
 * Two `kind`s share the same visual system:
 *   - "rating"  — the private 1-100 input value ("92" / "92 pts").
 *   - "match"   — the palate match-% ("92% match").
 */

import { useEffect, useRef, useState } from "react";

export type ScoreBadgeKind = "rating" | "match";
export type ScoreBadgeSize = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<ScoreBadgeSize, { box: string; text: string; caption: string }> = {
  sm: { box: "min-w-[2.25rem] px-2 py-0.5", text: "text-sm", caption: "text-[9px]" },
  md: { box: "min-w-[3rem] px-2.5 py-1", text: "text-base", caption: "text-[10px]" },
  lg: { box: "min-w-[4.5rem] px-4 py-2", text: "text-3xl", caption: "text-xs" },
};

function useCountUp(target: number | null, active: boolean) {
  // Only tracks the in-progress animated value. When not animating, the
  // caller falls back to `target` directly at render time — no setState
  // needed for that path, so the effect never sets state synchronously.
  const [animatedValue, setAnimatedValue] = useState(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === null || !active) {
      return;
    }
    const start = performance.now();
    const duration = 600;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      // ease-out-ish, matches --motion-ease-standard's intent
      const eased = 1 - (1 - progress) * (1 - progress);
      setAnimatedValue(Math.round((target as number) * eased));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [target, active]);

  if (target === null) return 0;
  if (!active) return target;
  return animatedValue;
}

export default function ScoreBadge({
  value,
  kind = "rating",
  size = "md",
  animate = false,
  label,
  className = "",
}: {
  /** 0-100, or null/undefined to render the em-dash placeholder. */
  value: number | null | undefined;
  kind?: ScoreBadgeKind;
  size?: ScoreBadgeSize;
  /** Count the number up from 0 on mount (score-reveal moment). */
  animate?: boolean;
  /** Override the default suffix ("pts" / "match"). Pass "" to suppress it. */
  label?: string;
  className?: string;
}) {
  const hasValue = typeof value === "number" && !Number.isNaN(value);
  const clamped = hasValue ? Math.max(0, Math.min(100, Math.round(value))) : null;
  const displayed = useCountUp(clamped, animate && hasValue);
  const isElite = hasValue && clamped! >= 95;
  const sizeClasses = SIZE_CLASSES[size];
  const suffix = label ?? (kind === "match" ? "% match" : "");

  return (
    <span
      className={`inline-flex items-baseline justify-center gap-1 rounded-lg border ${sizeClasses.box} ${
        isElite
          ? "border-[var(--color-accent-gold)]/50 bg-[var(--color-accent-soft)]"
          : "border-transparent bg-[var(--color-accent-soft)]"
      } ${animate && hasValue ? "animate-score-count-up" : ""} ${className}`.trim()}
      title={hasValue ? `${kind === "match" ? "Match" : "Rating"} ${clamped} out of 100` : "No score yet"}
    >
      {hasValue ? (
        <>
          <span
            className={`text-numeric ${sizeClasses.text} ${
              isElite ? "text-[var(--color-accent-gold)]" : "text-[var(--color-text-on-accent)]"
            }`}
          >
            {displayed}
          </span>
          {suffix ? (
            <span className={`${sizeClasses.caption} font-sans font-medium uppercase tracking-[0.08em] text-[var(--color-text-secondary)]`}>
              {suffix}
            </span>
          ) : null}
        </>
      ) : (
        <span className={`text-numeric ${sizeClasses.text} text-[var(--color-text-tertiary)]`}>
          &mdash;
        </span>
      )}
    </span>
  );
}
