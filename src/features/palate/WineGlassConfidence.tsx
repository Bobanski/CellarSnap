"use client";

import { useEffect, useId, useState } from "react";

/**
 * WineGlassConfidence — a small, charming stand-in for the old bare
 * "profile confidence" number/progress-bar. A hand-drawn glass fills with
 * wine as `progress` (0-100) climbs toward "full confidence." Brand-styled
 * (Grenache fill, thin stroke), animates on mount so it reads as a little
 * pour rather than a static gauge.
 */

const BOWL_TOP = 14;
const BOWL_BOTTOM = 60;
const BOWL_HEIGHT = BOWL_BOTTOM - BOWL_TOP;

export default function WineGlassConfidence({
  progress,
  size = 44,
  className = "",
}: {
  /** 0-100, how full the glass should be. */
  progress: number;
  size?: number;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const clamped = Math.max(0, Math.min(100, progress));
  // Animate from empty to the true level on mount/entry — a little "pour."
  const [animatedLevel, setAnimatedLevel] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimatedLevel(clamped));
    return () => cancelAnimationFrame(frame);
  }, [clamped]);

  const fillFraction = animatedLevel / 100;
  const fillTop = BOWL_BOTTOM - fillFraction * BOWL_HEIGHT;

  return (
    <svg
      viewBox="0 0 64 100"
      width={size}
      height={(size * 100) / 64}
      role="img"
      aria-label={`Palate profile confidence: ${Math.round(clamped)}% full`}
      className={className}
      style={{ display: "block", overflow: "visible" }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .wg-${uid}-fill { transition: y 1400ms cubic-bezier(.2,.8,.2,1), height 1400ms cubic-bezier(.2,.8,.2,1); }
            @media (prefers-reduced-motion: reduce) {
              .wg-${uid}-fill { transition: none; }
            }
          `,
        }}
      />
      <defs>
        <linearGradient id={`${uid}-wine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C4607A" />
          <stop offset="100%" stopColor="#7B1D3A" />
        </linearGradient>
        {/* Closed bowl region (rim straight-line closure hidden beneath the rim ellipse) — used purely to clip the fill. */}
        <clipPath id={`${uid}-bowl-clip`}>
          <path d={`M14 ${BOWL_TOP} C14 40 22 54 32 58 C42 54 50 40 50 ${BOWL_TOP} Z`} />
        </clipPath>
      </defs>

      {/* Wine fill, clipped to the bowl */}
      <g clipPath={`url(#${uid}-bowl-clip)`}>
        <rect
          className={`wg-${uid}-fill`}
          x="12"
          y={fillTop}
          width="40"
          height={BOWL_BOTTOM - fillTop + 4}
          fill={`url(#${uid}-wine)`}
        />
        {/* Wine "surface" highlight for a touch of shine at the fill line. */}
        <rect
          className={`wg-${uid}-fill`}
          x="12"
          y={fillTop}
          width="40"
          height="2"
          fill="#F0B6C2"
          opacity={fillFraction > 0.02 ? 0.55 : 0}
        />
      </g>

      {/* Glass outline — bowl */}
      <path
        d={`M14 ${BOWL_TOP} C14 40 22 54 32 58 C42 54 50 40 50 ${BOWL_TOP}`}
        fill="none"
        stroke="#F5EDD6"
        strokeOpacity={0.7}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* Rim */}
      <ellipse cx="32" cy={BOWL_TOP} rx="18" ry="3" fill="none" stroke="#F5EDD6" strokeOpacity={0.7} strokeWidth={1.5} />
      {/* Stem */}
      <line x1="32" y1="58" x2="32" y2="92" stroke="#F5EDD6" strokeOpacity={0.7} strokeWidth={1.5} />
      {/* Foot */}
      <ellipse cx="32" cy="94" rx="13" ry="2.6" fill="none" stroke="#F5EDD6" strokeOpacity={0.7} strokeWidth={1.5} />
    </svg>
  );
}
