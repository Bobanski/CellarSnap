import { NextResponse } from "next/server";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { z } from "zod";
import { BADGE_MAP } from "@shared";

const bodySchema = z.object({
  badge_id: z.string().nullable(),
});

export async function PUT(request: Request) {
  let auth;
  try {
    auth = await requireRequestAuth(request);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "badge_id is required." },
      { status: 400 }
    );
  }

  const { badge_id } = parsed.data;

  try {
    if (badge_id !== null) {
      // Validate badge exists in the badge catalog
      if (!BADGE_MAP.has(badge_id)) {
        return NextResponse.json(
          { error: "Unknown badge." },
          { status: 400 }
        );
      }

      // Verify the user has actually earned this badge
      const { data: earned, error: earnedError } = await auth.supabase
        .from("user_badges")
        .select("badge_id")
        .eq("user_id", auth.user.id)
        .eq("badge_id", badge_id)
        .maybeSingle();

      if (earnedError) {
        return NextResponse.json(
          { error: earnedError.message },
          { status: 500 }
        );
      }

      if (!earned) {
        return NextResponse.json(
          { error: "Badge not earned." },
          { status: 403 }
        );
      }
    }

    const { error: updateError } = await auth.supabase
      .from("profiles")
      .update({ featured_badge_id: badge_id })
      .eq("id", auth.user.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ featured_badge_id: badge_id });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update featured badge.",
      },
      { status: 500 }
    );
  }
}
