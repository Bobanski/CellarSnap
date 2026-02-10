import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const responseSchema = z.enum(["more", "less", "same_or_not_sure"]);

const createComparisonSchema = z.object({
  comparison_entry_id: z.string().uuid(),
  response: responseSchema,
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: newEntryId } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  if (payload.data.comparison_entry_id === newEntryId) {
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
      error?.message.includes("entry_comparison_feedback") ||
      error?.message.includes("entry_comparison_response")
    ) {
      return NextResponse.json(
        {
          error:
            "Entry comparison feedback is not available yet. Run supabase/sql/018_entry_comparison_feedback.sql and try again.",
        },
        { status: 500 }
      );
    }
    if (error?.code === "23505") {
      return NextResponse.json(
        { error: "Comparison feedback already recorded for this entry." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: error?.message ?? "Unable to save comparison feedback." },
      { status: 500 }
    );
  }

  return NextResponse.json({ feedback: data });
}
