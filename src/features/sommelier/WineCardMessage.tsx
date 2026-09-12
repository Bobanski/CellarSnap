"use client";

import ScoreBadge from "@/components/ui/ScoreBadge";
import type { IdentifiedWine, IdentifyBottleMatch } from "@/lib/sommelier/identifyBottleApi";

export type WineCardStatus = "identifying" | "identified" | "unreadable" | "failed";

export type WineCardData = {
  status: WineCardStatus;
  wine?: IdentifiedWine;
  match?: IdentifyBottleMatch | null;
  /** Local object URL for the just-attached photo thumbnail. */
  previewUrl?: string | null;
};

function formatSubtitle(wine: IdentifiedWine): string {
  return [wine.producer, wine.vintage].filter(Boolean).join(" · ");
}

export default function WineCardMessage({ card }: { card: WineCardData }) {
  const identifiedWine = card.status === "identified" ? card.wine : undefined;

  return (
    <div
      className="flex items-center gap-3"
      style={{
        padding: "10px 13px",
        fontSize: "11px",
        lineHeight: 1.65,
        maxWidth: "88%",
        borderRadius: "14px 14px 3px 14px",
        background: "var(--color-accent-primary)",
        color: "var(--color-text-on-accent)",
      }}
    >
      {card.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL, not a remote/optimizable asset
        <img
          src={card.previewUrl}
          alt="Photographed bottle"
          className="h-11 w-11 flex-shrink-0 rounded-lg object-cover"
        />
      ) : null}

      <div className="min-w-0 flex-1">
        {card.status === "identifying" ? (
          <p className="font-medium">Identifying this bottle...</p>
        ) : card.status === "unreadable" ? (
          <p className="font-medium">Couldn&apos;t read this label</p>
        ) : card.status === "failed" ? (
          <p className="font-medium">Couldn&apos;t identify this bottle</p>
        ) : identifiedWine ? (
          <>
            <p className="truncate font-semibold">{identifiedWine.name ?? "Unknown wine"}</p>
            {formatSubtitle(identifiedWine) ? (
              <p className="truncate opacity-80">{formatSubtitle(identifiedWine)}</p>
            ) : null}
          </>
        ) : null}
      </div>

      {card.status === "identified" && card.match ? (
        <ScoreBadge value={card.match.score} kind="match" size="sm" />
      ) : null}
    </div>
  );
}
