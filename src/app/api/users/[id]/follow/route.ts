import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function getTargetUserId(paramsPromise: Promise<{ id: string }>) {
  const { id } = await paramsPromise;
  const parsed = z.string().uuid().safeParse(id);
  return parsed.success ? parsed.data : null;
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

  const [{ data: followingRow }, { data: followsYouRow }] = await Promise.all([
    supabase
      .from("user_follows")
      .select("followee_id")
      .eq("follower_id", user.id)
      .eq("followee_id", targetUserId)
      .maybeSingle(),
    supabase
      .from("user_follows")
      .select("follower_id")
      .eq("follower_id", targetUserId)
      .eq("followee_id", user.id)
      .maybeSingle(),
  ]);

  const following = Boolean(followingRow);
  const follows_you = Boolean(followsYouRow);

  return NextResponse.json({
    following,
    follows_you,
    friends: following && follows_you,
  });
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
    return NextResponse.json(
      { error: "Cannot follow yourself" },
      { status: 400 }
    );
  }

  const { data: targetUser } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", targetUserId)
    .maybeSingle();

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { error } = await supabase.from("user_follows").upsert(
    {
      follower_id: user.id,
      followee_id: targetUserId,
    },
    {
      onConflict: "follower_id,followee_id",
      ignoreDuplicates: true,
    }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: followsYouRow } = await supabase
    .from("user_follows")
    .select("follower_id")
    .eq("follower_id", targetUserId)
    .eq("followee_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    following: true,
    follows_you: Boolean(followsYouRow),
    friends: Boolean(followsYouRow),
  });
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
    .from("user_follows")
    .delete()
    .eq("follower_id", user.id)
    .eq("followee_id", targetUserId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: followsYouRow } = await supabase
    .from("user_follows")
    .select("follower_id")
    .eq("follower_id", targetUserId)
    .eq("followee_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    following: false,
    follows_you: Boolean(followsYouRow),
    friends: false,
  });
}
