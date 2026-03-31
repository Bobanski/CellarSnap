import { NextResponse } from "next/server";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { evaluateAndAwardBadges } from "@/server/badges/evaluator";

type EvaluateRequestBody = {
  wine_type?: string | null;
  country?: string | null;
  region?: string | null;
  appellation?: string | null;
  grapes?: string[] | null;
  rating?: number | null;
};

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

  try {
    let body: EvaluateRequestBody = {};
    try {
      const text = await request.text();
      if (text.trim().length > 0) {
        body = JSON.parse(text) as EvaluateRequestBody;
      }
    } catch {
      // Empty or malformed body — proceed with empty entryData
    }

    const result = await evaluateAndAwardBadges({
      supabase: auth.supabase,
      userId: auth.user.id,
      entryData: {
        wine_type: body.wine_type ?? undefined,
        country: body.country ?? undefined,
        region: body.region ?? undefined,
        appellation: body.appellation ?? undefined,
        grapes: body.grapes ?? undefined,
        rating: body.rating ?? undefined,
      },
    });

    return NextResponse.json({ newly_earned_badges: result.newlyEarned });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to evaluate badges.",
      },
      { status: 500 }
    );
  }
}
