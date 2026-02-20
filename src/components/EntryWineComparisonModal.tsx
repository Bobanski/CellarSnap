"use client";

import { formatConsumedDate } from "@/lib/formatDate";
import type {
  ComparisonResponse,
  SurveyComparisonCandidate,
  SurveyEntryCard,
} from "@/components/EntryPostSaveSurveyModal";

type EntryWineComparisonModalProps = {
  isOpen: boolean;
  entry: SurveyEntryCard | null;
  candidate: SurveyComparisonCandidate | null;
  newWineImageUrl: string | null;
  errorMessage: string | null;
  isSubmitting: boolean;
  onSelect: (response: ComparisonResponse) => void;
  onSkip: () => void;
};

function formatWineTitle(wine: {
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
}) {
  return wine.wine_name?.trim() || "Untitled wine";
}

function formatWineMeta(wine: {
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
}) {
  if (wine.producer && wine.vintage) {
    return `${wine.producer} · ${wine.vintage}`;
  }
  if (wine.producer) {
    return wine.producer;
  }
  if (wine.vintage) {
    return wine.vintage;
  }
  return "No producer or vintage";
}

export default function EntryWineComparisonModal({
  isOpen,
  entry,
  candidate,
  newWineImageUrl,
  errorMessage,
  isSubmitting,
  onSelect,
  onSkip,
}: EntryWineComparisonModalProps) {
  if (!isOpen || !entry || !candidate) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
      <div className="fixed inset-0 bg-black/75" aria-hidden />
      <div className="relative flex min-h-full items-start justify-center sm:items-center">
        <div className="relative h-[calc(100dvh-0.75rem)] w-full max-w-3xl overflow-y-auto overscroll-contain rounded-3xl border border-white/10 bg-[#14100f] p-4 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] [scrollbar-gutter:stable] [touch-action:pan-y] [-webkit-overflow-scrolling:touch] sm:h-auto sm:max-h-[calc(100dvh-1.5rem)] sm:p-8">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-2xl font-semibold text-zinc-50">
              Which of these wines did you enjoy more?
            </h2>
            <button
              type="button"
              className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300 transition hover:border-amber-300/60 hover:text-amber-200 disabled:opacity-50"
              onClick={onSkip}
              disabled={isSubmitting}
            >
              Skip
            </button>
          </div>

          {errorMessage ? (
            <p className="mt-5 text-sm text-rose-300 sm:mt-6">{errorMessage}</p>
          ) : null}

          <div className="mt-5 grid gap-3 sm:mt-6 sm:gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => onSelect("more")}
              disabled={isSubmitting}
              className="group overflow-hidden rounded-2xl border border-white/10 bg-black/30 text-left transition hover:border-amber-300/60 disabled:cursor-not-allowed disabled:opacity-70"
              aria-label="Select the wine you just logged"
            >
              <div className="h-32 w-full bg-black/40 sm:h-40">
                {newWineImageUrl ? (
                  <img
                    src={newWineImageUrl}
                    alt="Wine you just logged"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                    No photo
                  </div>
                )}
              </div>
              <div className="space-y-1 border-t border-white/10 p-3 sm:p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-amber-300/70">
                  Wine you just logged
                </p>
                <p className="text-sm font-semibold text-zinc-50">
                  {formatWineTitle(entry)}
                </p>
                <p className="text-xs text-zinc-400">{formatWineMeta(entry)}</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onSelect("less")}
              disabled={isSubmitting}
              className="group overflow-hidden rounded-2xl border border-white/10 bg-black/30 text-left transition hover:border-amber-300/60 disabled:cursor-not-allowed disabled:opacity-70"
              aria-label="Select the previous wine"
            >
              <div className="h-32 w-full bg-black/40 sm:h-40">
                {candidate.label_image_url ? (
                  <img
                    src={candidate.label_image_url}
                    alt="Previous wine for comparison"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                    No photo
                  </div>
                )}
              </div>
              <div className="space-y-1 border-t border-white/10 p-3 sm:p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                  Previous wine
                </p>
                <p className="text-sm font-semibold text-zinc-50">
                  {formatWineTitle(candidate)}
                </p>
                <p className="text-xs text-zinc-400">{formatWineMeta(candidate)}</p>
                <p className="text-xs text-zinc-500">
                  Logged {formatConsumedDate(candidate.consumed_at)}
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
