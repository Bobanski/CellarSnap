"use client";

import { getMatchBandCopy } from "@/lib/algorithm/matchUi";
import type { MatchBand } from "@/server/algorithm/types";

export default function WineMatchScore({
  score,
  band,
  confidence,
  label = "match to your palate",
  size = "default",
}: {
  score: number;
  band: MatchBand;
  confidence?: number | null;
  label?: string;
  size?: "default" | "compact";
}) {
  const copy = getMatchBandCopy(band);
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const diameterClassName = size === "compact" ? "h-24 w-24" : "h-40 w-40";
  const valueClassName = size === "compact" ? "text-2xl" : "text-4xl";
  const captionClassName = size === "compact" ? "text-xs" : "text-sm";

  return (
    <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
      <div className="flex flex-col items-center gap-4 text-center">
        <div
          className={`relative flex ${diameterClassName} items-center justify-center rounded-full border border-white/10 bg-[#120d0c] shadow-[0_25px_60px_-35px_rgba(0,0,0,0.9)]`}
          style={{
            background: `conic-gradient(${copy.ringColor} 0deg ${clampedScore * 3.6}deg, rgba(255,255,255,0.09) ${clampedScore * 3.6}deg 360deg)`,
            boxShadow: `0 24px 60px -32px ${copy.glowColor}`,
          }}
        >
          <div className="flex h-[78%] w-[78%] flex-col items-center justify-center rounded-full bg-[var(--color-screen-bg)]">
            <span className={`font-semibold ${copy.scoreColorClassName} ${valueClassName}`}>
              {clampedScore}%
            </span>
            <span className="mt-1 text-[11px] uppercase tracking-[0.24em] text-zinc-500">
              Match
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${copy.chipClassName}`}>
            {copy.title}
          </span>
          <p className={`text-zinc-200 ${captionClassName}`}>{clampedScore}% {label}</p>
          {typeof confidence === "number" ? (
            <p className="text-xs text-zinc-500">
              Confidence {Math.round(confidence * 100)}%
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
