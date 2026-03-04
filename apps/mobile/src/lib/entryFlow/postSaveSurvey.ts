import type { PostSaveSurveyAnswers } from "@cellarsnap/shared";
import { supabase } from "@/src/lib/supabase";

export async function persistPostSaveSurveyAnswers<TValue extends string>({
  entryId,
  userId,
  answers,
}: {
  entryId: string;
  userId: string;
  answers: PostSaveSurveyAnswers<TValue>;
}) {
  const { error } = await supabase
    .from("wine_entries")
    .update({
      survey_how_was_it: answers.how_was_it,
      survey_expectation_match: answers.expectations,
      survey_drink_again: answers.drink_again,
    })
    .eq("id", entryId)
    .eq("user_id", userId);

  if (!error) {
    return {
      ok: true as const,
      errorMessage: null,
    };
  }

  const message = error.message ?? "Unable to save survey.";
  const isSchemaIssue =
    message.includes("survey_how_was_it") ||
    message.includes("survey_expectation_match") ||
    message.includes("survey_drink_again");

  return {
    ok: false as const,
    errorMessage: isSchemaIssue
      ? "Entry survey is temporarily unavailable. Please try again later."
      : message,
  };
}

export async function persistPostSaveComparisonResponse<TResponse extends string>({
  userId,
  entryId,
  comparisonEntryId,
  response,
}: {
  userId: string;
  entryId: string;
  comparisonEntryId: string;
  response: TResponse;
}) {
  const { error } = await supabase
    .from("entry_comparison_feedback")
    .insert({
      user_id: userId,
      new_entry_id: entryId,
      comparison_entry_id: comparisonEntryId,
      response,
    });

  if (!error || error.code === "23505") {
    return {
      ok: true as const,
      errorMessage: null,
    };
  }

  const message = error.message ?? "Unable to save comparison.";
  const isSchemaIssue =
    message.includes("entry_comparison_feedback") ||
    message.includes("entry_comparison_response");

  return {
    ok: false as const,
    errorMessage: isSchemaIssue
      ? "Wine comparison is temporarily unavailable. Please try again later."
      : message,
  };
}
