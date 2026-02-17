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

  // Build a map: friend_user_id -> request_id
  const friendMap = new Map<string, string>();
  for (const request of requests ?? []) {
    const friendId =
      request.requester_id === user.id
        ? request.recipient_id
        : request.requester_id;
    friendMap.set(friendId, request.id);
  }

  const friendIds = Array.from(friendMap.keys());

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

  // Count how often each friend appears in tasted_with_user_ids
  const frequencyMap = new Map<string, number>();
  if (friendIds.length > 0) {
    const { data: entries } = await supabase
      .from("wine_entries")
      .select("tasted_with_user_ids")
      .eq("user_id", user.id)
      .neq("tasted_with_user_ids", "{}");

    for (const entry of entries ?? []) {
      for (const id of entry.tasted_with_user_ids ?? []) {
        if (friendMap.has(id)) {
          frequencyMap.set(id, (frequencyMap.get(id) ?? 0) + 1);
        }
      }
    }
  }

  return NextResponse.json({
    friends: friendIds.map((id) => ({
      id,
      request_id: friendMap.get(id) ?? null,
      display_name: profileMap.get(id)?.display_name ?? null,
      email: profileMap.get(id)?.email ?? null,
      tasting_count: frequencyMap.get(id) ?? 0,
    })),
  });
}
