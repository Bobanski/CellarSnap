import {
  toComparisonSubmissionPayload,
  toSurveySubmissionPayload,
  type PostSaveSurveyAnswers,
} from "@shared/entry-flow";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type BrowserSupabaseClient = Awaited<ReturnType<typeof createSupabaseBrowserClient>>;

type SubmitPostSaveSurveyParams<
  TAnswerValue extends string,
  TComparisonResponse extends string,
> = {
  supabase: BrowserSupabaseClient;
  entryId: string;
  answers: PostSaveSurveyAnswers<TAnswerValue>;
  comparisonEntryId?: string | null;
  response?: TComparisonResponse;
};

export type SubmitPostSaveSurveyResult = {
  ok: boolean;
  status: number;
  error: string | null;
};

export async function getComparisonRequestHeaders(
  supabase: BrowserSupabaseClient
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
  } catch {
    // Fall back to cookie auth when session retrieval fails.
  }

  return headers;
}

export async function submitPostSaveSurveyRequest<
  TAnswerValue extends string,
  TComparisonResponse extends string,
>({
  supabase,
  entryId,
  answers,
  comparisonEntryId,
  response,
}: SubmitPostSaveSurveyParams<
  TAnswerValue,
  TComparisonResponse
>): Promise<SubmitPostSaveSurveyResult> {
  const body =
    comparisonEntryId && response
      ? toComparisonSubmissionPayload({
          answers,
          comparisonEntryId,
          response,
        })
      : toSurveySubmissionPayload(answers);

  const apiResponse = await fetch(`/api/entries/${entryId}/comparison`, {
    method: "POST",
    headers: await getComparisonRequestHeaders(supabase),
    body: JSON.stringify(body),
  });

  if (!apiResponse.ok && apiResponse.status !== 409) {
    const payload = await apiResponse.json().catch(() => null);
    const apiError =
      typeof payload?.error === "string" ? payload.error : "Unable to save response.";
    return {
      ok: false,
      status: apiResponse.status,
      error: apiError,
    };
  }

  return {
    ok: true,
    status: apiResponse.status,
    error: null,
  };
}
