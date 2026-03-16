import { useState } from "react";
import { resolvePostSaveSurveyTransition } from "@cellarsnap/shared";
import {
  persistPostSaveComparisonResponse,
  persistPostSaveSurveyAnswers,
} from "@/src/lib/entryFlow/postSaveSurvey";

export type ComparisonResponse = "more" | "less" | "same_or_not_sure";
export type SurveyHowWasItResponse =
  | "awful"
  | "bad"
  | "okay"
  | "good"
  | "exceptional";
export type SurveyExpectationsResponse =
  | "below_expectations"
  | "met_expectations"
  | "above_expectations";
export type SurveyDrinkAgainResponse = "yes" | "no";

export type SurveyComparisonCandidate = {
  id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  consumed_at: string;
  label_image_url: string | null;
};

export type PendingPostSaveSurvey = {
  entryId: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  new_wine_image_url: string | null;
  candidate: SurveyComparisonCandidate | null;
};

type PostSaveSurveyAnswers = {
  how_was_it: SurveyHowWasItResponse;
  expectations: SurveyExpectationsResponse;
  drink_again: SurveyDrinkAgainResponse;
};

export function usePostSaveSurveyFlow({
  userId,
  onComplete,
}: {
  userId: string | null | undefined;
  onComplete: () => void;
}) {
  const [pendingPostSaveSurvey, setPendingPostSaveSurvey] =
    useState<PendingPostSaveSurvey | null>(null);
  const [surveyHowWasIt, setSurveyHowWasIt] = useState<
    SurveyHowWasItResponse | ""
  >("");
  const [surveyExpectations, setSurveyExpectations] = useState<
    SurveyExpectationsResponse | ""
  >("");
  const [surveyDrinkAgain, setSurveyDrinkAgain] = useState<
    SurveyDrinkAgainResponse | ""
  >("");
  const [postSaveSurveyStep, setPostSaveSurveyStep] = useState<
    "survey" | "comparison"
  >("survey");
  const [savedSurveyAnswers, setSavedSurveyAnswers] =
    useState<PostSaveSurveyAnswers | null>(null);
  const [surveyErrorMessage, setSurveyErrorMessage] = useState<string | null>(null);
  const [isSubmittingSurvey, setIsSubmittingSurvey] = useState(false);

  const resetSurveyDraft = () => {
    setSurveyHowWasIt("");
    setSurveyExpectations("");
    setSurveyDrinkAgain("");
    setSavedSurveyAnswers(null);
    setPostSaveSurveyStep("survey");
    setSurveyErrorMessage(null);
    setIsSubmittingSurvey(false);
  };

  const completePostSaveFlow = () => {
    setPendingPostSaveSurvey(null);
    resetSurveyDraft();
    onComplete();
  };

  const beginPostSaveSurvey = (payload: PendingPostSaveSurvey) => {
    resetSurveyDraft();
    setPendingPostSaveSurvey(payload);
  };

  const skipPostSaveComparison = () => {
    if (!pendingPostSaveSurvey) {
      return;
    }
    completePostSaveFlow();
  };

  const submitPostSaveSurvey = async () => {
    if (!userId || !pendingPostSaveSurvey || isSubmittingSurvey) {
      return;
    }

    if (!surveyHowWasIt || !surveyExpectations || !surveyDrinkAgain) {
      setSurveyErrorMessage("Please answer all 3 required questions.");
      return;
    }

    setSurveyErrorMessage(null);
    setIsSubmittingSurvey(true);

    try {
      const answers: PostSaveSurveyAnswers = {
        how_was_it: surveyHowWasIt,
        expectations: surveyExpectations,
        drink_again: surveyDrinkAgain,
      };

      const surveyResult = await persistPostSaveSurveyAnswers({
        entryId: pendingPostSaveSurvey.entryId,
        userId,
        answers,
      });

      if (!surveyResult.ok) {
        setSurveyErrorMessage(
          surveyResult.errorMessage ?? "Unable to save survey response."
        );
        setIsSubmittingSurvey(false);
        return;
      }

      const transition = resolvePostSaveSurveyTransition(
        Boolean(pendingPostSaveSurvey.candidate)
      );
      if (transition.nextStep === "comparison") {
        setSavedSurveyAnswers(answers);
        setPostSaveSurveyStep(transition.nextStep);
        setIsSubmittingSurvey(false);
        return;
      }

      setIsSubmittingSurvey(false);
      completePostSaveFlow();
    } catch {
      setSurveyErrorMessage("Unable to save survey. Check your connection and try again.");
      setIsSubmittingSurvey(false);
    }
  };

  const submitPostSaveComparison = async (response: ComparisonResponse) => {
    if (
      !userId ||
      !pendingPostSaveSurvey ||
      !pendingPostSaveSurvey.candidate ||
      !savedSurveyAnswers ||
      isSubmittingSurvey
    ) {
      return;
    }

    setSurveyErrorMessage(null);
    setIsSubmittingSurvey(true);

    try {
      const comparisonResult = await persistPostSaveComparisonResponse({
        userId,
        entryId: pendingPostSaveSurvey.entryId,
        comparisonEntryId: pendingPostSaveSurvey.candidate.id,
        response,
      });

      if (!comparisonResult.ok) {
        setSurveyErrorMessage(
          comparisonResult.errorMessage ?? "Unable to save comparison response."
        );
        setIsSubmittingSurvey(false);
        return;
      }

      setIsSubmittingSurvey(false);
      completePostSaveFlow();
    } catch {
      setSurveyErrorMessage("Unable to save comparison. Check your connection and try again.");
      setIsSubmittingSurvey(false);
    }
  };

  const canSubmitPostSaveSurvey = Boolean(
    surveyHowWasIt && surveyExpectations && surveyDrinkAgain
  );

  return {
    pendingPostSaveSurvey,
    surveyHowWasIt,
    surveyExpectations,
    surveyDrinkAgain,
    postSaveSurveyStep,
    surveyErrorMessage,
    isSubmittingSurvey,
    canSubmitPostSaveSurvey,
    beginPostSaveSurvey,
    setSurveyHowWasIt,
    setSurveyExpectations,
    setSurveyDrinkAgain,
    submitPostSaveSurvey,
    submitPostSaveComparison,
    skipPostSaveComparison,
  };
}
