"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  WINE_TYPE_OPTIONS,
  STARTER_GRAPES,
  STARTER_REGIONS,
  WINE_REGIONS,
  COMMON_GRAPES,
  SENSORY_LOVE_OPTIONS,
  SENSORY_AVOID_OPTIONS,
  BUDGET_RESTAURANT_OPTIONS,
  BUDGET_RETAIL_OPTIONS,
  ADVENTUROUSNESS_MIN,
  ADVENTUROUSNESS_MAX,
  ADVENTUROUSNESS_DEFAULT,
  TASTE_SURVEY_STEP_COUNT,
  describeAdventurousness,
  emptyTasteSurveyDraft,
  draftToPayload,
  rowToDraft,
  type TasteSurveyDraft,
  type TasteSurveyRow,
} from "@shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

// ─── helpers ─────────────────────────────────────────────────
function toggleInArray(arr: string[], item: string): string[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

function searchGrapesLocal(query: string): string[] {
  const lowerQ = query.toLowerCase();
  return COMMON_GRAPES.filter((g) => g.toLowerCase().includes(lowerQ)).slice(0, 8);
}

async function searchGrapesApi(query: string): Promise<string[]> {
  try {
    const supabase = createSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return searchGrapesLocal(query);
    const res = await fetch(`/api/grapes?q=${encodeURIComponent(query)}&limit=8`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return searchGrapesLocal(query);
    const data = await res.json();
    const results = (data.grapes ?? []).map((g: { name: string }) => g.name);
    return results.length > 0 ? results : searchGrapesLocal(query);
  } catch {
    return searchGrapesLocal(query);
  }
}

function searchRegionsLocal(query: string): string[] {
  const lowerQ = query.toLowerCase();
  return WINE_REGIONS.filter((r) => r.toLowerCase().includes(lowerQ)).slice(0, 8);
}

// ─── Chip components ─────────────────────────────────────────
function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2.5 text-[13px] font-semibold transition-all cursor-pointer ${
        active
          ? "border-[var(--color-accent-primary)] bg-[var(--color-accent-rose)] text-[var(--color-accent-secondary)]"
          : "border-[var(--color-border)] bg-[var(--color-surface-tinted)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]"
      }`}
    >
      {label}
    </button>
  );
}

function ChipSelect({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (item: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {options.map((opt) => (
        <Chip
          key={opt}
          label={opt}
          active={selected.includes(opt)}
          onClick={() => onToggle(opt)}
        />
      ))}
    </div>
  );
}

function ChipSingleSelect({
  options,
  selected,
  onSelect,
}: {
  options: readonly string[];
  selected: string | null;
  onSelect: (v: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {options.map((opt) => (
        <Chip
          key={opt}
          label={opt}
          active={selected === opt}
          onClick={() => onSelect(selected === opt ? null : opt)}
        />
      ))}
    </div>
  );
}

// ─── Selected pill with remove ───────────────────────────────
function SelectedPill({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-accent-rose)] bg-[var(--color-accent-soft)] px-3 py-1.5 text-xs font-bold text-[var(--color-accent-secondary)]">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="text-[var(--color-accent-primary)] hover:text-[var(--color-accent-hover)] cursor-pointer"
      >
        x
      </button>
    </span>
  );
}

// ─── Search + Chip combo ─────────────────────────────────────
function SearchChipSelect({
  starterOptions,
  selected,
  onToggle,
  onAdd,
  placeholder,
  onSearch,
}: {
  starterOptions: readonly string[];
  selected: string[];
  onToggle: (item: string) => void;
  onAdd: (item: string) => void;
  placeholder: string;
  onSearch?: (query: string) => Promise<string[]> | string[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const applyResults = (matched: string[]) => {
      matched = matched.filter((item) => !selected.includes(item));
      if (matched.length === 0 && query.trim()) {
        setResults([query.trim()]);
      } else {
        setResults(matched.slice(0, 8));
      }
    };

    if (onSearch) {
      const result = onSearch(query);
      if (result instanceof Promise) {
        let cancelled = false;
        const timer = setTimeout(() => {
          result.then((matched) => { if (!cancelled) applyResults(matched); });
        }, 150);
        return () => { cancelled = true; clearTimeout(timer); };
      }
      applyResults(result);
      return;
    }

    const lowerQ = query.toLowerCase();
    const matched = [...starterOptions].filter(
      (item) => item.toLowerCase().includes(lowerQ)
    );
    applyResults(matched);
  }, [query, starterOptions, selected, onSearch]);

  return (
    <div className="flex flex-col gap-3">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((item) => (
            <SelectedPill
              key={item}
              label={item}
              onRemove={() => onToggle(item)}
            />
          ))}
        </div>
      )}

      <ChipSelect
        options={starterOptions}
        selected={selected}
        onToggle={onToggle}
      />

      <input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] outline-none focus:border-[var(--color-accent-secondary)]"
      />

      {results.length > 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] overflow-hidden">
          {results.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                onAdd(item);
                setQuery("");
                setResults([]);
              }}
              className="w-full text-left px-4 py-2.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] border-b border-[var(--color-border)] last:border-b-0 cursor-pointer"
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Step components ─────────────────────────────────────────

function StepWineTypes({
  draft,
  update,
}: {
  draft: TasteSurveyDraft;
  update: (p: Partial<TasteSurveyDraft>) => void;
}) {
  return (
    <>
      <StepHeader
        eyebrow="TASTE PROFILE"
        title="What do you typically drink?"
        subtitle="Select the types of wine you enjoy most often."
      />
      <ChipSelect
        options={WINE_TYPE_OPTIONS}
        selected={draft.wineTypes}
        onToggle={(item) =>
          update({ wineTypes: toggleInArray(draft.wineTypes, item) })
        }
      />
    </>
  );
}

function StepGrapes({
  draft,
  update,
}: {
  draft: TasteSurveyDraft;
  update: (p: Partial<TasteSurveyDraft>) => void;
}) {
  return (
    <>
      <StepHeader
        title="What are your favorite grapes?"
        subtitle="Pick all the varietals you tend to reach for."
      />
      <div className="flex flex-wrap gap-1.5">
        {["Cabernet Sauvignon", "Merlot", "Pinot Noir", "Grenache", "Syrah / Shiraz", "Chardonnay", "Sauvignon Blanc", "Riesling"].map((grape) => {
          const active = draft.varietals.includes(grape);
          return (
            <button
              key={grape}
              type="button"
              onClick={() =>
                active
                  ? update({ varietals: draft.varietals.filter((v) => v !== grape) })
                  : update({ varietals: [...draft.varietals, grape] })
              }
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition cursor-pointer ${
                active
                  ? "border-[var(--color-accent-primary)] bg-[var(--color-accent-rose)] text-[var(--color-accent-secondary)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-tinted)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]"
              }`}
            >
              {grape}
            </button>
          );
        })}
      </div>
      <SearchChipSelect
        starterOptions={[]}
        selected={draft.varietals}
        onToggle={(item) =>
          update({ varietals: toggleInArray(draft.varietals, item) })
        }
        onAdd={(item) => {
          if (!draft.varietals.includes(item))
            update({ varietals: [...draft.varietals, item] });
        }}
        placeholder="Search for more grapes..."
        onSearch={searchGrapesApi}
      />
    </>
  );
}

function StepRegions({
  draft,
  update,
}: {
  draft: TasteSurveyDraft;
  update: (p: Partial<TasteSurveyDraft>) => void;
}) {
  return (
    <>
      <StepHeader
        title="Regions"
        subtitle="Where does your favorite wine come from?"
      />
      <SearchChipSelect
        starterOptions={STARTER_REGIONS}
        selected={draft.regions}
        onToggle={(item) =>
          update({ regions: toggleInArray(draft.regions, item) })
        }
        onAdd={(item) => {
          if (!draft.regions.includes(item))
            update({ regions: [...draft.regions, item] });
        }}
        placeholder="Search countries or regions..."
        onSearch={async (q) => searchRegionsLocal(q)}
      />
    </>
  );
}

function StepLoves({
  draft,
  update,
}: {
  draft: TasteSurveyDraft;
  update: (p: Partial<TasteSurveyDraft>) => void;
}) {
  return (
    <>
      <StepHeader
        title="What styles of wine do you love most?"
        subtitle="Tap the styles that speak to you."
      />
      <ChipSelect
        options={SENSORY_LOVE_OPTIONS}
        selected={draft.sensoryLoves}
        onToggle={(item) =>
          update({ sensoryLoves: toggleInArray(draft.sensoryLoves, item) })
        }
      />
    </>
  );
}

function StepAvoids({
  draft,
  update,
}: {
  draft: TasteSurveyDraft;
  update: (p: Partial<TasteSurveyDraft>) => void;
}) {
  return (
    <>
      <StepHeader
        title="And what styles of wine do you tend to avoid?"
        subtitle="The styles that never quite work for you."
      />
      <ChipSelect
        options={SENSORY_AVOID_OPTIONS}
        selected={draft.sensoryAvoids}
        onToggle={(item) =>
          update({ sensoryAvoids: toggleInArray(draft.sensoryAvoids, item) })
        }
      />
    </>
  );
}

function StepDetails({
  draft,
  update,
}: {
  draft: TasteSurveyDraft;
  update: (p: Partial<TasteSurveyDraft>) => void;
}) {
  return (
    <>
      <StepHeader
        title="A few more details"
        subtitle="This helps us fine-tune recommendations."
      />

      <SectionLabel>Restaurant bottle budget</SectionLabel>
      <ChipSingleSelect
        options={BUDGET_RESTAURANT_OPTIONS}
        selected={draft.budgetRestaurant}
        onSelect={(v) => update({ budgetRestaurant: v })}
      />

      <SectionLabel>Retail bottle budget</SectionLabel>
      <ChipSingleSelect
        options={BUDGET_RETAIL_OPTIONS}
        selected={draft.budgetRetail}
        onSelect={(v) => update({ budgetRetail: v })}
      />

      <SectionLabel>How adventurous are you?</SectionLabel>
      <div className="flex flex-col gap-3">
        <input
          type="range"
          min={ADVENTUROUSNESS_MIN}
          max={ADVENTUROUSNESS_MAX}
          step={1}
          value={draft.adventurousness}
          onChange={(e) =>
            update({ adventurousness: Number(e.target.value) })
          }
          className="w-full accent-[var(--color-accent-secondary)]"
        />
        <div className="flex justify-between text-[13px] font-bold text-[var(--color-text-secondary)]">
          <span>I know what I like</span>
          <span>Always exploring</span>
        </div>
      </div>
    </>
  );
}

function StepReview({
  draft,
  update,
}: {
  draft: TasteSurveyDraft;
  update: (p: Partial<TasteSurveyDraft>) => void;
}) {
  const summaryRows = [
    { label: "Types", value: draft.wineTypes.join(", ") },
    { label: "Go-to Grapes", value: draft.varietals.join(", ") },
    { label: "Regions", value: draft.regions.join(", ") },
    { label: "You Love", value: draft.sensoryLoves.join(", ") },
    { label: "You Avoid", value: draft.sensoryAvoids.join(", ") },
    {
      label: "Budget",
      value: [
        draft.budgetRestaurant
          ? `${draft.budgetRestaurant} (restaurant)`
          : null,
        draft.budgetRetail ? `${draft.budgetRetail} (retail)` : null,
      ]
        .filter(Boolean)
        .join(", "),
    },
    { label: "Adventurousness", value: describeAdventurousness(draft.adventurousness) },
  ];

  return (
    <>
      <StepHeader
        eyebrow="REVIEW & CONFIRM"
        title="Your taste profile"
        subtitle="Here's your taste profile for now. You can always come back and edit this later."
      />

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-tinted)] p-5 space-y-4">
        {summaryRows.map((row) => (
          <div key={row.label}>
            <p className="text-[9px] font-bold tracking-[2px] uppercase text-[var(--color-text-tertiary)]">
              {row.label}
            </p>
            {row.value ? (
              <p className="text-sm text-[var(--color-text-primary)] leading-5">
                {row.value}
              </p>
            ) : (
              <p className="text-[13px] italic text-[var(--color-text-tertiary)]">
                Skipped
              </p>
            )}
          </div>
        ))}
      </div>

      <SectionLabel>Anything else?</SectionLabel>
      <textarea
        placeholder="e.g., I prefer natural wines, or I'm allergic to sulfites"
        value={draft.freeText}
        onChange={(e) => update({ freeText: e.target.value })}
        rows={3}
        className="w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] outline-none focus:border-[var(--color-accent-secondary)] resize-none"
      />
    </>
  );
}

// ─── Shared sub-components ───────────────────────────────────

function StepHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="space-y-1.5">
      {eyebrow && (
        <p className="text-[9px] font-bold tracking-[3px] uppercase text-[var(--color-accent-secondary)]">
          {eyebrow}
        </p>
      )}
      <h1
        className="text-[30px] leading-[36px] font-light text-[var(--color-text-primary)]"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {title}
      </h1>
      <p className="text-sm leading-5 text-[var(--color-text-secondary)]">
        {subtitle}
      </p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px] font-bold uppercase tracking-[0.8px] text-[var(--color-text-primary)] mt-3">
      {children}
    </p>
  );
}

// ─── Main page ───────────────────────────────────────────────

export default function TasteSurveyPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<TasteSurveyDraft>(emptyTasteSurveyDraft);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const submitGuardRef = useRef(false);

  const update = useCallback((patch: Partial<TasteSurveyDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const isLastStep = step === TASTE_SURVEY_STEP_COUNT;
  const canGoBack = step > 1;
  const isValid = step === 1 ? draft.wineTypes.length > 0 : true;
  const progress = (step / TASTE_SURVEY_STEP_COUNT) * 100;

  // Load existing survey
  useEffect(() => {
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          router.replace("/login");
          return;
        }
        const res = await fetch("/api/taste-survey", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const payload = await res.json();
          if (payload.survey) {
            setDraft(rowToDraft(payload.survey));
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const handleSubmit = async () => {
    if (submitGuardRef.current || isSubmitting) return;
    submitGuardRef.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setErrorMessage("Session expired. Please sign in again.");
        return;
      }

      const res = await fetch("/api/taste-survey", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draftToPayload(draft)),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setErrorMessage(payload?.error ?? "Unable to save. Please try again.");
        return;
      }

      router.replace("/");
    } catch {
      setErrorMessage("Unable to reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
      submitGuardRef.current = false;
    }
  };

  const handleNext = () => {
    if (isLastStep) {
      void handleSubmit();
    } else {
      setStep((s) => Math.min(s + 1, TASTE_SURVEY_STEP_COUNT));
    }
  };

  const handleBack = () => {
    setStep((s) => Math.max(s - 1, 1));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--color-screen-bg)]">
        <div className="w-6 h-6 border-2 border-[var(--color-accent-secondary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-screen-bg)] flex justify-center">
      <div className="w-full max-w-lg px-5 py-8 flex flex-col gap-5">
        {/* Skip survey */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => router.replace("/")}
            className="text-xs font-semibold text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] cursor-pointer"
          >
            Skip survey for now
          </button>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="h-[3px] rounded-full bg-[var(--color-surface-raised)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--color-accent-secondary)] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[11px] font-semibold tracking-[1px] uppercase text-[var(--color-text-tertiary)]">
            Step {step} of {TASTE_SURVEY_STEP_COUNT}
          </p>
        </div>

        {/* Step content */}
        <div className="flex flex-col gap-5">
          {step === 1 && <StepWineTypes draft={draft} update={update} />}
          {step === 2 && <StepGrapes draft={draft} update={update} />}
          {step === 3 && <StepRegions draft={draft} update={update} />}
          {step === 4 && <StepLoves draft={draft} update={update} />}
          {step === 5 && <StepAvoids draft={draft} update={update} />}
          {step === 6 && <StepDetails draft={draft} update={update} />}
          {step === 7 && <StepReview draft={draft} update={update} />}
        </div>

        {/* Error */}
        {errorMessage && (
          <p className="text-center text-[13px] text-[var(--color-error)]">
            {errorMessage}
          </p>
        )}

        {/* Navigation */}
        <div className="flex gap-3 mt-2">
          {canGoBack && (
            <button
              type="button"
              onClick={handleBack}
              className="flex-1 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-tinted)] py-3.5 text-sm font-bold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            disabled={!isValid || isSubmitting}
            className={`flex-[2] rounded-xl py-3.5 text-sm font-bold transition-colors cursor-pointer ${
              isValid && !isSubmitting
                ? "bg-[var(--color-accent-primary)] text-[var(--color-text-on-accent)] hover:bg-[var(--color-accent-hover)]"
                : "bg-[var(--color-accent-primary)] text-[var(--color-text-on-accent)] opacity-50 cursor-not-allowed"
            }`}
          >
            {isSubmitting ? (
              <span className="inline-block w-4 h-4 border-2 border-[var(--color-screen-bg)] border-t-transparent rounded-full animate-spin" />
            ) : isLastStep ? (
              "Save my profile"
            ) : (
              "Next"
            )}
          </button>
        </div>

        {/* Skip to next step — centered below navigation */}
        {!isLastStep && (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(s + 1, TASTE_SURVEY_STEP_COUNT))}
            className="self-center rounded-full border border-[var(--color-border)] px-5 py-2 text-[13px] font-semibold text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)] cursor-pointer transition"
          >
            Skip to next step
          </button>
        )}
      </div>
    </div>
  );
}
