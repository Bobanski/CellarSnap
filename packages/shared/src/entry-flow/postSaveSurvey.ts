export type PostSaveSurveyAnswers<TValue extends string = string> = {
  how_was_it: TValue;
  expectations?: TValue;
  // Keep for backward compat
  drink_again?: TValue;
  // New graduated scale
  enjoyment_intent?: TValue;
};

export type PostSaveSurveyStep = "survey" | "comparison";

export type PostSaveSurveyTransition = {
  nextStep: PostSaveSurveyStep | null;
  shouldComplete: boolean;
};

export function toSurveySubmissionPayload<TValue extends string>(
  answers: PostSaveSurveyAnswers<TValue>
) {
  return {
    how_was_it: answers.how_was_it,
    ...(typeof answers.expectations === "string"
      ? { expectations: answers.expectations }
      : {}),
    ...(typeof answers.drink_again === "string"
      ? { drink_again: answers.drink_again }
      : {}),
    ...(typeof answers.enjoyment_intent === "string"
      ? { enjoyment_intent: answers.enjoyment_intent }
      : {}),
  };
}

export function toComparisonSubmissionPayload<
  TValue extends string,
  TResponse extends string,
>({
  answers,
  comparisonEntryId,
  response,
}: {
  answers: PostSaveSurveyAnswers<TValue>;
  comparisonEntryId: string;
  response: TResponse;
}) {
  return {
    ...toSurveySubmissionPayload(answers),
    comparison_entry_id: comparisonEntryId,
    response,
  };
}

export function resolvePostSaveSurveyTransition(
  hasComparisonCandidate: boolean
): PostSaveSurveyTransition {
  if (hasComparisonCandidate) {
    return {
      nextStep: "comparison",
      shouldComplete: false,
    };
  }

  return {
    nextStep: null,
    shouldComplete: true,
  };
}
