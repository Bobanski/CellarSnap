import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/friends/suggestions
 * Returns up to 5 "people you may know": users who have at least one mutual
 * friend with the current user, ordered by mutual friend count (most first).
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const myId = user.id;

  // 1) My friends (accepted)
  const { data: myFriendRows, error: friendsError } = await supabase
    .from("friend_requests")
    .select("requester_id, recipient_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${myId},recipient_id.eq.${myId}`);

  if (friendsError) {
    return NextResponse.json({ error: friendsError.message }, { status: 500 });
  }

  const myFriendIds = new Set(
    (myFriendRows ?? []).map((row) =>
      row.requester_id === myId ? row.recipient_id : row.requester_id
    )
  );

  if (myFriendIds.size === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  // 2) Pending incoming (requesters) and outgoing (recipients) to exclude
  const { data: pendingRows } = await supabase
    .from("friend_requests")
    .select("requester_id, recipient_id")
    .eq("status", "pending")
    .or(`requester_id.eq.${myId},recipient_id.eq.${myId}`);

  const excludeIds = new Set<string>([myId, ...myFriendIds]);
  (pendingRows ?? []).forEach((row) => {
    excludeIds.add(row.requester_id);
    excludeIds.add(row.recipient_id);
  });

  // 3) All accepted friend_requests where one side is me or one of my friends
  const ids = [myId, ...myFriendIds];
  const idList = ids.map((id) => `"${id}"`).join(",");
  const { data: allEdges, error: edgesError } = await supabase
    .from("friend_requests")
    .select("requester_id, recipient_id")
    .eq("status", "accepted")
    .or(`requester_id.in.(${idList}),recipient_id.in.(${idList})`);

  if (edgesError) {
    return NextResponse.json({ error: edgesError.message }, { status: 500 });
  }

  // 4) For each friend of my friends (not me, not my friend, not pending), count mutuals
  const mutualCount = new Map<string, number>();

  (allEdges ?? []).forEach((row) => {
    const a = row.requester_id;
    const b = row.recipient_id;
    // This edge is (myFriend, candidate) or (candidate, myFriend) where myFriend is in myFriendIds
    const myFriend = myFriendIds.has(a) ? a : myFriendIds.has(b) ? b : null;
    const candidate = myFriend === a ? b : myFriend === b ? a : null;
    if (!myFriend || !candidate || excludeIds.has(candidate)) return;
    mutualCount.set(candidate, (mutualCount.get(candidate) ?? 0) + 1);
  });

  // 5) Sort by count desc, take 5
  const sorted = Array.from(mutualCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const suggestionIds = sorted.map(([id]) => id);
  if (suggestionIds.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email, avatar_path")
    .in("id", suggestionIds);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p])
  );
  const countMap = new Map(sorted);

  // Sign avatar URLs in parallel
  const avatarUrlMap = new Map<string, string | null>();
  await Promise.all(
    (profiles ?? []).map(async (p) => {
      if (p.avatar_path) {
        const { data: urlData } = await supabase.storage
          .from("wine-photos")
          .createSignedUrl(p.avatar_path, 60 * 60);
        avatarUrlMap.set(p.id, urlData?.signedUrl ?? null);
      }
    })
  );

  const suggestions = suggestionIds.map((id) => ({
    id,
    display_name: profileMap.get(id)?.display_name ?? null,
    email: profileMap.get(id)?.email ?? null,
    avatar_url: avatarUrlMap.get(id) ?? null,
    mutual_count: countMap.get(id) ?? 0,
  }));

  return NextResponse.json({ suggestions });
}
