"use client";

import { getMatchBandCopy } from "@/lib/algorithm/matchUi";
import type { MatchBand } from "@/server/algorithm/types";

export default function MatchBadge({
  score,
  band,
  compact = false,
}: {
  score: number;
  band: MatchBand;
  compact?: boolean;
}) {
  const copy = getMatchBandCopy(band);

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 font-semibold shadow-[0_12px_30px_-24px_rgba(0,0,0,0.9)] ${
        compact ? "text-[11px]" : "text-xs"
      } ${copy.chipClassName}`}
      title={copy.pillLabel}
    >
      {Math.max(0, Math.min(100, Math.round(score)))}%
    </span>
  );
}
