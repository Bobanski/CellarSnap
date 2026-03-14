export type PostSaveSurveyAnswers<TValue extends string = string> = {
  how_was_it: TValue;
  expectations?: TValue;
  drink_again: TValue;
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
    drink_again: answers.drink_again,
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
