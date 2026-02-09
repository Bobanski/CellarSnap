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

  const { count } = await supabase
    .from("wine_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("seen_at", null);

  const { data: notifications, error } = await supabase
    .from("wine_notifications")
    .select("id, entry_id, actor_id, created_at, seen_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const entryIds = Array.from(
    new Set((notifications ?? []).map((n) => n.entry_id))
  );
  const actorIds = Array.from(
    new Set((notifications ?? []).map((n) => n.actor_id))
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

  const entryMap = new Map(
    (entries ?? []).map((entry) => [entry.id, entry])
  );
  const actorMap = new Map(
    (actors ?? []).map((actor) => [
      actor.id,
      actor.display_name ?? actor.email ?? "Unknown",
    ])
  );

  const result = (notifications ?? []).map((n) => ({
    id: n.id,
    entry_id: n.entry_id,
    actor_name: actorMap.get(n.actor_id) ?? "Unknown",
    wine_name: entryMap.get(n.entry_id)?.wine_name ?? null,
    consumed_at: entryMap.get(n.entry_id)?.consumed_at ?? "",
    created_at: n.created_at,
  }));

  return NextResponse.json({
    unseen_count: count ?? 0,
    notifications: result,
  });
}
