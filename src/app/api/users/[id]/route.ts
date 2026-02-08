import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const [{ data: outgoingFollow }, { data: incomingFollow }] = await Promise.all([
    supabase
      .from("user_follows")
      .select("followee_id")
      .eq("follower_id", user.id)
      .eq("followee_id", id)
      .maybeSingle(),
    supabase
      .from("user_follows")
      .select("follower_id")
      .eq("follower_id", id)
      .eq("followee_id", user.id)
      .maybeSingle(),
  ]);

  const following = Boolean(outgoingFollow);
  const follows_you = Boolean(incomingFollow);

  return NextResponse.json({
    profile: {
      id: data.id,
      display_name: data.display_name ?? null,
      following,
      follows_you,
      friends: following && follows_you,
    },
  });
}
