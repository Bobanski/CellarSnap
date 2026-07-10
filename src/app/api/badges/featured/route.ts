import { NextResponse } from "next/server";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { executeWithColumnFallback } from "@/server/db/compat";
import { z } from "zod";
import { BADGE_MAP } from "@shared";

// Up to five featured badges per profile (097_featured_badges.sql). Until
// that migration is applied, `featured_badge_ids` won't exist yet —
// executeWithColumnFallback below detects the missing-column error and
// retries with just `featured_badge_id`, so this route degrades gracefully
// to single-badge behavior on an unmigrated DB instead of failing.
const MAX_FEATURED_BADGES = 5;

const bodySchema = z.union([
  // Legacy shape (still used by mobile) — replaces the whole selection with
  // a single badge, or clears it.
  z.object({ badge_id: z.string().nullable() }),
  // New shape — an ordered list of up to five earned badges.
  z.object({ badge_ids: z.array(z.string()).max(MAX_FEATURED_BADGES) }),
]);

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
      {
        error:
          parsed.error.issues[0]?.message ?? "badge_id or badge_ids is required.",
      },
      { status: 400 }
    );
  }

  const rawIds =
    "badge_ids" in parsed.data
      ? parsed.data.badge_ids
      : parsed.data.badge_id !== null
        ? [parsed.data.badge_id]
        : [];
  // De-dupe (preserving order) and enforce the cap defensively even though
  // zod already caps badge_ids.
  const badgeIds = Array.from(new Set(rawIds)).slice(0, MAX_FEATURED_BADGES);

  try {
    for (const badgeId of badgeIds) {
      if (!BADGE_MAP.has(badgeId)) {
        return NextResponse.json(
          { error: `Unknown badge: ${badgeId}` },
          { status: 400 }
        );
      }
    }

    if (badgeIds.length > 0) {
      const { data: earnedRows, error: earnedError } = await auth.supabase
        .from("user_badges")
        .select("badge_id")
        .eq("user_id", auth.user.id)
        .in("badge_id", badgeIds);

      if (earnedError) {
        return NextResponse.json(
          { error: earnedError.message },
          { status: 500 }
        );
      }

      const earnedSet = new Set((earnedRows ?? []).map((row) => row.badge_id));
      const notEarned = badgeIds.filter((id) => !earnedSet.has(id));
      if (notEarned.length > 0) {
        return NextResponse.json(
          { error: "Badge not earned." },
          { status: 403 }
        );
      }
    }

    // `featured_badge_id` is kept in lockstep (mirrors element 0) so older
    // mobile builds reading the single column stay correct.
    const updateResult = await executeWithColumnFallback({
      initialPayload: {
        featured_badge_id: badgeIds[0] ?? null,
        featured_badge_ids: badgeIds,
      },
      removableColumns: ["featured_badge_ids"],
      maxAttempts: 2,
      attempt: async (payload) => {
        const result = await auth.supabase
          .from("profiles")
          .update(payload)
          .eq("id", auth.user.id)
          .select("id")
          .single();
        return { data: result.data, error: result.error };
      },
    });

    if (updateResult.error) {
      return NextResponse.json(
        { error: updateResult.error.message },
        { status: 500 }
      );
    }

    // If `featured_badge_ids` had to be dropped (column doesn't exist yet —
    // pre-097_featured_badges.sql), only `featured_badge_id` actually made
    // it to the DB. Echo back what was truly persisted rather than the full
    // requested list, so the client doesn't show a selection that won't
    // survive a reload.
    const persistedIds = updateResult.removedColumns.includes("featured_badge_ids")
      ? badgeIds.slice(0, 1)
      : badgeIds;

    return NextResponse.json({
      featured_badge_id: persistedIds[0] ?? null,
      featured_badge_ids: persistedIds,
      migration_pending: updateResult.removedColumns.includes("featured_badge_ids"),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update featured badges.",
      },
      { status: 500 }
    );
  }
}
