import { NextResponse } from "next/server";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { executeSelectWithFallback } from "@/server/db/compat";
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

    // featured_badge_ids (097_featured_badges.sql) may not exist yet on
    // every environment — fall back to the single-badge column so this
    // route keeps working either way.
    const profileSelectResult = await executeSelectWithFallback({
      attempts: [
        { fields: "featured_badge_id, featured_badge_ids", includesArray: true },
        { fields: "featured_badge_id", includesArray: false },
      ] as const,
      getFallbackColumns: () => ["featured_badge_ids"],
      attempt: async (attempt) => {
        const result = await auth.supabase
          .from("profiles")
          .select(attempt.fields)
          .eq("id", targetUserId)
          .single();
        return { data: result.data, error: result.error };
      },
    });

    if (profileSelectResult.error) {
      return NextResponse.json(
        { error: profileSelectResult.error.message },
        { status: 500 }
      );
    }

    const profile = profileSelectResult.data as {
      featured_badge_id: string | null;
      featured_badge_ids?: string[] | null;
    } | null;
    const featuredBadgeIds =
      profile?.featured_badge_ids && profile.featured_badge_ids.length > 0
        ? profile.featured_badge_ids
        : profile?.featured_badge_id
          ? [profile.featured_badge_id]
          : [];

    const badges = (earnedRows ?? [])
      .filter((row) => BADGE_MAP.has(row.badge_id))
      .map((row) => ({
        ...BADGE_MAP.get(row.badge_id)!,
        earned_at: row.earned_at as string,
      }));

    return NextResponse.json({
      badges,
      featured_badge_id: profile?.featured_badge_id ?? null,
      featured_badge_ids: featuredBadgeIds,
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
