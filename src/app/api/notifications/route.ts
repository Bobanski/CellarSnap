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

  const url = new URL(request.url);
  const countOnly = url.searchParams.get("count_only") === "true";

  const { count: tagCount } = await supabase
    .from("wine_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("seen_at", null);

  const { count: requestCount } = await supabase
    .from("friend_requests")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", user.id)
    .eq("status", "pending")
    .is("seen_at", null);

  // Fast path: only return the count (used by AlertsMenu badge on mount)
  if (countOnly) {
    return NextResponse.json({ unseen_count: (tagCount ?? 0) + (requestCount ?? 0) });
  }

  const { data: notifications, error } = await supabase
    .from("wine_notifications")
    .select("id, entry_id, actor_id, created_at, seen_at")
    .eq("user_id", user.id)
    .is("seen_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: friendRequests } = await supabase
    .from("friend_requests")
    .select("id, requester_id, created_at, seen_at, status")
    .eq("recipient_id", user.id)
    .eq("status", "pending")
    .is("seen_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  const entryIds = Array.from(
    new Set((notifications ?? []).map((n) => n.entry_id))
  );
  const actorIds = Array.from(
    new Set((notifications ?? []).map((n) => n.actor_id))
  );
  const requesterIds = Array.from(
    new Set((friendRequests ?? []).map((request) => request.requester_id))
  );

  const { data: entries } =
    entryIds.length > 0
      ? await supabase
          .from("wine_entries")
          .select("id, wine_name, consumed_at")
          .in("id", entryIds)
      : { data: [] };

  const { data: actors } =
    actorIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", actorIds)
      : { data: [] };

  const { data: requesters } =
    requesterIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", requesterIds)
      : { data: [] };

  const entryMap = new Map(
    (entries ?? []).map((entry) => [entry.id, entry])
  );
  const actorMap = new Map(
    (actors ?? []).map((actor) => [
      actor.id,
      actor.display_name ?? actor.email ?? "Unknown",
    ])
  );
  const requesterMap = new Map(
    (requesters ?? []).map((requester) => [
      requester.id,
      requester.display_name ?? requester.email ?? "Unknown",
    ])
  );

  const tagItems = (notifications ?? []).map((n) => ({
    id: n.id,
    type: "tagged" as const,
    entry_id: n.entry_id,
    actor_name: actorMap.get(n.actor_id) ?? "Unknown",
    wine_name: entryMap.get(n.entry_id)?.wine_name ?? null,
    consumed_at: entryMap.get(n.entry_id)?.consumed_at ?? "",
    created_at: n.created_at,
  }));

  const requestItems = (friendRequests ?? []).map((request) => ({
    id: request.id,
    type: "friend_request" as const,
    requester_id: request.requester_id,
    requester_name: requesterMap.get(request.requester_id) ?? "Unknown",
    created_at: request.created_at,
  }));

  const result = [...tagItems, ...requestItems].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );

  return NextResponse.json({
    unseen_count: (tagCount ?? 0) + (requestCount ?? 0),
    notifications: result,
  });
}
