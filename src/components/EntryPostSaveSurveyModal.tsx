"use client";

import { useState } from "react";

export type ComparisonResponse = "more" | "less" | "same_or_not_sure";
export type HowWasItResponse =
  | "awful"
  | "bad"
  | "okay"
  | "good"
  | "exceptional";
export type ExpectationsResponse =
  | "below_expectations"
  | "met_expectations"
  | "above_expectations";
export type DrinkAgainResponse = "yes" | "no";

export type SurveyEntryCard = {
  id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
};

export type SurveyComparisonCandidate = SurveyEntryCard & {
  consumed_at: string;
  label_image_url: string | null;
};

export type PostSaveSurveySubmission = {
  how_was_it: HowWasItResponse;
  expectations: ExpectationsResponse;
  drink_again: DrinkAgainResponse;
};

const HOW_WAS_IT_OPTIONS: { value: HowWasItResponse; label: string }[] = [
  { value: "awful", label: "Awful" },
  { value: "bad", label: "Bad" },
  { value: "okay", label: "Okay" },
  { value: "good", label: "Good" },
  { value: "exceptional", label: "Exceptional" },
];

const EXPECTATIONS_OPTIONS: { value: ExpectationsResponse; label: string }[] = [
  { value: "below_expectations", label: "Below expectations" },
  { value: "met_expectations", label: "Met expectations" },
  { value: "above_expectations", label: "Above expectations" },
];

const DRINK_AGAIN_OPTIONS: { value: DrinkAgainResponse; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

type EntryPostSaveSurveyModalProps = {
  isOpen: boolean;
  entry: SurveyEntryCard | null;
  errorMessage: string | null;
  isSubmitting: boolean;
  submitLabel?: string;
  onSubmit: (submission: PostSaveSurveySubmission) => void;
};

export default function EntryPostSaveSurveyModal({
  isOpen,
  entry,
  errorMessage,
  isSubmitting,
  submitLabel = "Save feedback",
  onSubmit,
}: EntryPostSaveSurveyModalProps) {
  const [howWasIt, setHowWasIt] = useState<HowWasItResponse | "">("");
  const [expectations, setExpectations] = useState<ExpectationsResponse | "">("");
  const [drinkAgain, setDrinkAgain] = useState<DrinkAgainResponse | "">("");

  if (!isOpen || !entry) {
    return null;
  }

  const canSubmit = Boolean(howWasIt && expectations && drinkAgain);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
      <div className="fixed inset-0 bg-black/75" aria-hidden />
      <div className="relative flex min-h-full items-start justify-center sm:items-center">
        <div className="relative h-[calc(100dvh-0.75rem)] w-full max-w-3xl overflow-y-auto overscroll-contain rounded-3xl border border-white/10 bg-[#14100f] p-4 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] [scrollbar-gutter:stable] [touch-action:pan-y] [-webkit-overflow-scrolling:touch] sm:h-auto sm:max-h-[calc(100dvh-1.5rem)] sm:p-8">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-300/80">
              Required survey
            </p>
            <h2 className="text-2xl font-semibold text-zinc-50">Quick check-in</h2>
          </div>

          <div className="mt-5 space-y-4 sm:mt-6">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">How was it?</span>
              <select
                value={howWasIt}
                onChange={(event) =>
                  setHowWasIt(event.target.value as HowWasItResponse | "")
                }
                className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-amber-300/60"
              >
                <option value="">Select one</option>
                {HOW_WAS_IT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">
                How did it compare to your expectations?
              </span>
              <select
                value={expectations}
                onChange={(event) =>
                  setExpectations(event.target.value as ExpectationsResponse | "")
                }
                className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-amber-300/60"
              >
                <option value="">Select one</option>
                {EXPECTATIONS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">
                Would you drink it again?
              </span>
              <select
                value={drinkAgain}
                onChange={(event) =>
                  setDrinkAgain(event.target.value as DrinkAgainResponse | "")
                }
                className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-amber-300/60"
              >
                <option value="">Select one</option>
                {DRINK_AGAIN_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {errorMessage ? (
            <p className="mt-4 text-sm text-rose-300">{errorMessage}</p>
          ) : null}

          <div className="mt-6 flex items-center justify-end">
            <button
              type="button"
              onClick={() =>
                onSubmit({
                  how_was_it: howWasIt as HowWasItResponse,
                  expectations: expectations as ExpectationsResponse,
                  drink_again: drinkAgain as DrinkAgainResponse,
                })
              }
              disabled={!canSubmit || isSubmitting}
              className="rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Saving..." : submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
