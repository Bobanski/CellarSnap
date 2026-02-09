import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getFriendRelationship } from "@/lib/friends/relationship";

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

  let relationship;
  try {
    relationship = await getFriendRelationship(supabase, user.id, id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load relationship";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({
    profile: {
      id: data.id,
      display_name: data.display_name ?? null,
      following: relationship.following,
      follows_you: relationship.follows_you,
      friends: relationship.friends,
      friend_status: relationship.status,
      outgoing_request_id: relationship.outgoing_request_id,
      incoming_request_id: relationship.incoming_request_id,
      friend_request_id: relationship.friend_request_id,
    },
  });
}
