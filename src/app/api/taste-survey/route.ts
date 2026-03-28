import { NextResponse } from "next/server";
import {
  RequestAuthError,
  requireRequestAuth,
} from "@/server/auth/requestAuth";
import type { TasteSurveyPayload, TasteSurveyRow } from "@shared";

// ─── GET /api/taste-survey ──────────────────────────────────
// Returns the user's existing survey responses, or null if none.
export async function GET(request: Request) {
  let auth;
  try {
    auth = await requireRequestAuth(request);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }

  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from("taste_survey_responses")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ survey: (data as TasteSurveyRow) ?? null });
}

// ─── POST /api/taste-survey ─────────────────────────────────
// Upsert the user's survey responses.
export async function POST(request: Request) {
  let auth;
  try {
    auth = await requireRequestAuth(request);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }

  const { supabase, user } = auth;

  let body: TasteSurveyPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const row = {
    user_id: user.id,
    wine_types: body.wine_types ?? [],
    varietals: body.varietals ?? [],
    regions: body.regions ?? [],
    countries: body.countries ?? [],
    sensory_loves: body.sensory_loves ?? [],
    sensory_avoids: body.sensory_avoids ?? [],
    budget_restaurant: body.budget_restaurant ?? null,
    budget_retail: body.budget_retail ?? null,
    adventurousness: body.adventurousness ?? 5,
    free_text: body.free_text ?? null,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("taste_survey_responses")
    .upsert(row, { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ survey: data as TasteSurveyRow });
}
