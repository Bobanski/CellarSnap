import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: requests, error } = await supabase
    .from("friend_requests")
    .select("id, requester_id, recipient_id, status")
    .eq("status", "accepted")
    .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const friendIds = Array.from(
    new Set(
      (requests ?? []).map((request) =>
        request.requester_id === user.id
          ? request.recipient_id
          : request.requester_id
      )
    )
  );

  const { data: profiles } =
    friendIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", friendIds)
      : { data: [] };

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile])
  );

  return NextResponse.json({
    friends: friendIds.map((id) => ({
      id,
      display_name: profileMap.get(id)?.display_name ?? null,
      email: profileMap.get(id)?.email ?? null,
    })),
  });
}
