import { NextResponse } from "next/server";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { BADGE_MAP } from "@shared";

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

  try {
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("user_id") ?? auth.user.id;

    const { data: earnedRows, error: badgesError } = await auth.supabase
      .from("user_badges")
      .select("badge_id, earned_at")
      .eq("user_id", targetUserId)
      .order("earned_at", { ascending: false });

    if (badgesError) {
      return NextResponse.json(
        { error: badgesError.message },
        { status: 500 }
      );
    }

    const { data: profile, error: profileError } = await auth.supabase
      .from("profiles")
      .select("featured_badge_id")
      .eq("id", targetUserId)
      .single();

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      );
    }

    const badges = (earnedRows ?? [])
      .filter((row) => BADGE_MAP.has(row.badge_id))
      .map((row) => ({
        ...BADGE_MAP.get(row.badge_id)!,
        earned_at: row.earned_at as string,
      }));

    return NextResponse.json({
      badges,
      featured_badge_id: profile?.featured_badge_id ?? null,
      total_earned: badges.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load badges.",
      },
      { status: 500 }
    );
  }
}
