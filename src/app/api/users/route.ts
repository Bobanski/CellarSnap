import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();

  let query = supabase
    .from("profiles")
    .select("id, display_name")
    .neq("id", user.id)
    .order("display_name", { ascending: true });

  if (search) {
    query = query.ilike("display_name", `%${search}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = data ?? [];
  const userIds = users.map((candidate) => candidate.id);

  if (userIds.length === 0) {
    return NextResponse.json({ users: [] });
  }

  const [{ data: followingRows }, { data: followerRows }] = await Promise.all([
    supabase
      .from("user_follows")
      .select("followee_id")
      .eq("follower_id", user.id)
      .in("followee_id", userIds),
    supabase
      .from("user_follows")
      .select("follower_id")
      .eq("followee_id", user.id)
      .in("follower_id", userIds),
  ]);

  const followingSet = new Set((followingRows ?? []).map((row) => row.followee_id));
  const followersSet = new Set((followerRows ?? []).map((row) => row.follower_id));

  return NextResponse.json({
    users: users.map((candidate) => {
      const following = followingSet.has(candidate.id);
      const follows_you = followersSet.has(candidate.id);
      return {
        ...candidate,
        following,
        follows_you,
        friends: following && follows_you,
      };
    }),
  });
}
