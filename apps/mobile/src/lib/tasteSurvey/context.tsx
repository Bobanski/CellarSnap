import { createContext, useContext, useCallback, useRef, useState, type ReactNode } from "react";
import {
  emptyTasteSurveyDraft,
  draftToPayload,
  rowToDraft,
  TASTE_SURVEY_STEP_COUNT,
  type TasteSurveyDraft,
  type TasteSurveyRow,
} from "@cellarsnap/shared";
import { submitTasteSurvey } from "@/src/lib/api/tasteSurvey";

type TasteSurveyContextValue = {
  step: number;
  draft: TasteSurveyDraft;
  errorMessage: string | null;
  isSubmitting: boolean;
  setStep: (n: number) => void;
  goNext: () => void;
  goBack: () => void;
  updateDraft: (patch: Partial<TasteSurveyDraft>) => void;
  submit: () => Promise<boolean>;
  prefill: (row: TasteSurveyRow) => void;
  canGoNext: boolean;
  canGoBack: boolean;
  progress: number;
};

const TasteSurveyContext = createContext<TasteSurveyContextValue | null>(null);

export function useTasteSurvey() {
  const ctx = useContext(TasteSurveyContext);
  if (!ctx) throw new Error("useTasteSurvey must be used inside TasteSurveyProvider");
  return ctx;
}

export function TasteSurveyProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<TasteSurveyDraft>(emptyTasteSurveyDraft);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitGuardRef = useRef(false);

  const updateDraft = useCallback((patch: Partial<TasteSurveyDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const goNext = useCallback(() => {
    setStep((s) => Math.min(s + 1, TASTE_SURVEY_STEP_COUNT));
  }, []);

  const goBack = useCallback(() => {
    setStep((s) => Math.max(s - 1, 1));
  }, []);

  const prefill = useCallback((row: TasteSurveyRow) => {
    setDraft(rowToDraft(row));
  }, []);

  const submit = useCallback(async (): Promise<boolean> => {
    if (submitGuardRef.current) return false;
    submitGuardRef.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await submitTasteSurvey(draftToPayload(draft));
      if (!result.ok) {
        setErrorMessage(result.errorMessage);
        return false;
      }
      return true;
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
      return false;
    } finally {
      setIsSubmitting(false);
      submitGuardRef.current = false;
    }
  }, [draft]);

  return (
    <TasteSurveyContext.Provider
      value={{
        step,
        draft,
        errorMessage,
        isSubmitting,
        setStep,
        goNext,
        goBack,
        updateDraft,
        submit,
        prefill,
        canGoNext: step < TASTE_SURVEY_STEP_COUNT,
        canGoBack: step > 1,
        progress: step / TASTE_SURVEY_STEP_COUNT,
      }}
    >
      {children}
    </TasteSurveyContext.Provider>
  );
}
