import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, type User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingDbColumnError, isMissingDbTableError } from "@/lib/supabase/errors";

const responseSchema = z.enum(["more", "less", "same_or_not_sure"]);
const howWasItSchema = z.enum(["awful", "bad", "okay", "good", "exceptional"]);
const expectationsSchema = z.enum([
  "below_expectations",
  "met_expectations",
  "above_expectations",
]);
const drinkAgainSchema = z.enum(["yes", "no"]);

const createComparisonSchema = z
  .object({
    how_was_it: howWasItSchema,
    expectations: expectationsSchema,
    drink_again: drinkAgainSchema,
    comparison_entry_id: z.string().uuid().optional(),
    response: responseSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const hasComparisonEntryId = typeof data.comparison_entry_id === "string";
    const hasResponse = typeof data.response === "string";

    if (hasComparisonEntryId !== hasResponse) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "comparison_entry_id and response must both be provided when comparison feedback is included.",
        path: hasComparisonEntryId ? ["response"] : ["comparison_entry_id"],
      });
    }
  });

function isSurveyColumnUnavailable(error: { message: string; code?: string | null }) {
  return (
    isMissingDbColumnError(error, "survey_how_was_it") ||
    isMissingDbColumnError(error, "survey_expectation_match") ||
    isMissingDbColumnError(error, "survey_drink_again")
  );
}

type ComparisonSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function createRequestSupabaseClient(
  request: Request
): Promise<{ supabase: ComparisonSupabaseClient; user: User | null }> {
  const authHeader = request.headers.get("authorization");
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader ?? "");
  const bearerToken = bearerMatch?.[1]?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (bearerToken && supabaseUrl && supabaseAnonKey) {
    const bearerClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
      },
    });
    const {
      data: { user },
    } = await bearerClient.auth.getUser();
    if (user) {
      return {
        supabase: bearerClient as unknown as ComparisonSupabaseClient,
        user,
      };
    }
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: newEntryId } = await params;
  const { supabase, user } = await createRequestSupabaseClient(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = createComparisonSchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json(
      { error: payload.error.flatten() },
      { status: 400 }
    );
  }

  if (
    payload.data.comparison_entry_id &&
    payload.data.comparison_entry_id === newEntryId
  ) {
    return NextResponse.json(
      { error: "Comparison entry must be different from the new entry." },
      { status: 400 }
    );
  }

  const { data: newEntry, error: newEntryError } = await supabase
    .from("wine_entries")
    .select("id, user_id")
    .eq("id", newEntryId)
    .single();

  if (newEntryError || !newEntry) {
    return NextResponse.json({ error: "New entry not found." }, { status: 404 });
  }

  if (newEntry.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: survey, error: surveyError } = await supabase
    .from("wine_entries")
    .update({
      survey_how_was_it: payload.data.how_was_it,
      survey_expectation_match: payload.data.expectations,
      survey_drink_again: payload.data.drink_again,
    })
    .eq("id", newEntryId)
    .eq("user_id", user.id)
    .select(
      "id, survey_how_was_it, survey_expectation_match, survey_drink_again"
    )
    .single();

  if (surveyError || !survey) {
    if (surveyError && isSurveyColumnUnavailable(surveyError)) {
      return NextResponse.json(
        {
          error:
            "Entry survey is temporarily unavailable. Please try again later. (ENTRY_SURVEY_UNAVAILABLE)",
          code: "ENTRY_SURVEY_UNAVAILABLE",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: surveyError?.message ?? "Unable to save entry survey." },
      { status: 500 }
    );
  }

  if (!payload.data.comparison_entry_id || !payload.data.response) {
    return NextResponse.json({ survey, feedback: null });
  }

  const { data: comparisonEntry, error: comparisonEntryError } = await supabase
    .from("wine_entries")
    .select("id, user_id")
    .eq("id", payload.data.comparison_entry_id)
    .single();

  if (comparisonEntryError || !comparisonEntry) {
    return NextResponse.json(
      { error: "Comparison entry not found." },
      { status: 404 }
    );
  }

  if (comparisonEntry.user_id !== user.id) {
    return NextResponse.json(
      { error: "Comparison entry must be one of your own entries." },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("entry_comparison_feedback")
    .insert({
      user_id: user.id,
      new_entry_id: newEntryId,
      comparison_entry_id: payload.data.comparison_entry_id,
      response: payload.data.response,
    })
    .select("id, new_entry_id, comparison_entry_id, response, created_at")
    .single();

  if (error || !data) {
    if (
      (error && isMissingDbTableError(error, "entry_comparison_feedback")) ||
      (typeof error?.message === "string" &&
        error.message.toLowerCase().includes("entry_comparison_response") &&
        error.message.toLowerCase().includes("does not exist"))
    ) {
      return NextResponse.json(
        {
          error:
            "Entry comparison feedback is temporarily unavailable. Please try again later. (ENTRY_COMPARISON_UNAVAILABLE)",
          code: "ENTRY_COMPARISON_UNAVAILABLE",
        },
        { status: 503 }
      );
    }
    if (error?.code === "23505") {
      return NextResponse.json(
        { error: "Comparison feedback already recorded for this entry.", survey },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: error?.message ?? "Unable to save comparison feedback." },
      { status: 500 }
    );
  }

  return NextResponse.json({ survey, feedback: data });
}
