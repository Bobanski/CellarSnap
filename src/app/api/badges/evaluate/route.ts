import { NextResponse } from "next/server";
import { RequestAuthError, requireTypedRequestAuth } from "@/server/auth/requestAuth";
import { evaluateAndAwardBadges } from "@/server/badges/evaluator";
import { log } from "@/server/log";

export async function POST(request: Request) {
  try {
    const auth = await requireTypedRequestAuth(request);
    // Legacy mobile clients send entry hints. Ignore them: only stored,
    // owner-scoped tasting facts can establish eligibility.
    const result = await evaluateAndAwardBadges({ supabase: auth.supabase, userId: auth.user.id });
    return NextResponse.json({ newly_earned_badges: result.newlyEarned });
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    log.error("Badge evaluation failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Unable to evaluate badges." }, { status: 500 });
  }
}
