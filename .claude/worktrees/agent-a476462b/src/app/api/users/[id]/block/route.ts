import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function isMissingBlocksTableError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("user_blocks") ||
    lower.includes("relation") ||
    lower.includes("does not exist") ||
    lower.includes("column")
  );
}

async function getTargetUserId(paramsPromise: Promise<{ id: string }>) {
  const { id } = await paramsPromise;
  const parsed = z.string().uuid().safeParse(id);
  return parsed.success ? parsed.data : null;
}

async function getBlockedState(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  currentUserId: string,
  targetUserId: string
) {
  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocker_id")
    .eq("blocker_id", currentUserId)
    .eq("blocked_id", targetUserId)
    .maybeSingle();

  if (error) {
    if (isMissingBlocksTableError(error.message)) {
      return {
        blocked: false,
        unavailable: true,
      };
    }
    throw new Error(error.message);
  }

  return {
    blocked: Boolean(data),
    unavailable: false,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const targetUserId = await getTargetUserId(params);
  if (!targetUserId) {
    return NextResponse.json({ error: "Valid user ID required" }, { status: 400 });
  }

  if (targetUserId === user.id) {
    return NextResponse.json({ blocked: false });
  }

  try {
    const state = await getBlockedState(supabase, user.id, targetUserId);
    if (state.unavailable) {
      return NextResponse.json(
        {
          error:
            "Blocking is temporarily unavailable. Please try again later. (BLOCKS_UNAVAILABLE)",
          code: "BLOCKS_UNAVAILABLE",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ blocked: state.blocked });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load block state.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const targetUserId = await getTargetUserId(params);
  if (!targetUserId) {
    return NextResponse.json({ error: "Valid user ID required" }, { status: 400 });
  }

  if (targetUserId === user.id) {
    return NextResponse.json({ error: "Cannot block yourself." }, { status: 400 });
  }

  const { error: insertError } = await supabase.from("user_blocks").insert({
    blocker_id: user.id,
    blocked_id: targetUserId,
  });

  if (insertError && insertError.code !== "23505") {
    if (isMissingBlocksTableError(insertError.message)) {
      return NextResponse.json(
        {
          error:
            "Blocking is temporarily unavailable. Please try again later. (BLOCKS_UNAVAILABLE)",
          code: "BLOCKS_UNAVAILABLE",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  await Promise.all([
    supabase
      .from("friend_requests")
      .delete()
      .eq("requester_id", user.id)
      .eq("recipient_id", targetUserId),
    supabase
      .from("friend_requests")
      .delete()
      .eq("requester_id", targetUserId)
      .eq("recipient_id", user.id),
    supabase
      .from("wine_notifications")
      .update({ seen_at: nowIso })
      .eq("user_id", user.id)
      .eq("actor_id", targetUserId)
      .is("seen_at", null),
  ]);

  return NextResponse.json({ blocked: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const targetUserId = await getTargetUserId(params);
  if (!targetUserId) {
    return NextResponse.json({ error: "Valid user ID required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", targetUserId);

  if (error) {
    if (isMissingBlocksTableError(error.message)) {
      return NextResponse.json(
        {
          error:
            "Blocking is temporarily unavailable. Please try again later. (BLOCKS_UNAVAILABLE)",
          code: "BLOCKS_UNAVAILABLE",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ blocked: false });
}
