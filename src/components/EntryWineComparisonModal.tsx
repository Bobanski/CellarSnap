"use client";

import { formatConsumedDate } from "@/lib/formatDate";
import { useOverlayPresentation } from "@/lib/ui/overlayPresentation";
import type {
  ComparisonResponse,
  SurveyComparisonCandidate,
  SurveyEntryCard,
} from "@/components/EntryPostSaveSurveyModal";
import AppImage from "@/components/AppImage";

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
  useOverlayPresentation(isOpen, {
    lockScroll: false,
    snapToTop: false,
  });

  if (!isOpen || !entry || !candidate) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 px-3 py-3 sm:px-4 sm:py-4">
      <div className="fixed inset-0 bg-black/75" aria-hidden />
      <div className="relative flex min-h-[calc(100svh-0.75rem)] items-center justify-center">
        <div className="relative w-full max-w-3xl max-h-[calc(100svh-0.75rem)] overflow-y-auto overscroll-contain rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] p-4 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] [scrollbar-gutter:stable] [touch-action:pan-y] [-webkit-overflow-scrolling:touch] sm:max-h-[calc(100svh-1.5rem)] sm:p-8">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-2xl font-semibold text-[var(--color-text-primary)]">
              Which of these wines did you enjoy more?
            </h2>
            <button
              type="button"
              className="shrink-0 rounded-full border border-[var(--color-border-strong)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-secondary)] transition hover:border-[var(--color-accent-gold)]/60 hover:text-[var(--color-accent-gold)] disabled:opacity-50"
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
              className="group overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-left transition hover:border-[var(--color-accent-gold)]/60 disabled:cursor-not-allowed disabled:opacity-70"
              aria-label="Select the wine you just logged"
            >
              <div className="h-32 w-full bg-black/40 sm:h-40">
                {newWineImageUrl ? (
                  <AppImage
                    src={newWineImageUrl}
                    alt="Wine you just logged"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-[var(--color-text-tertiary)]">
                    No photo
                  </div>
                )}
              </div>
              <div className="space-y-1 border-t border-[var(--color-border)] p-3 sm:p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-accent-gold)]/70">
                  Wine you just logged
                </p>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {formatWineTitle(entry)}
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)]">{formatWineMeta(entry)}</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onSelect("less")}
              disabled={isSubmitting}
              className="group overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-left transition hover:border-[var(--color-accent-gold)]/60 disabled:cursor-not-allowed disabled:opacity-70"
              aria-label="Select the previous wine"
            >
              <div className="h-32 w-full bg-black/40 sm:h-40">
                {candidate.label_image_url ? (
                  <AppImage
                    src={candidate.label_image_url}
                    alt="Previous wine for comparison"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-[var(--color-text-tertiary)]">
                    No photo
                  </div>
                )}
              </div>
              <div className="space-y-1 border-t border-[var(--color-border)] p-3 sm:p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                  Previous wine
                </p>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {formatWineTitle(candidate)}
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)]">{formatWineMeta(candidate)}</p>
                <p className="text-xs text-[var(--color-text-tertiary)]">
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
