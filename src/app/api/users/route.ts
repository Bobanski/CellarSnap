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

  const [{ data: outgoingRows, error: outgoingError }, { data: incomingRows, error: incomingError }] = await Promise.all([
    supabase
      .from("friend_requests")
      .select("id, recipient_id, status")
      .eq("requester_id", user.id)
      .in("recipient_id", userIds)
      .in("status", ["pending", "accepted"]),
    supabase
      .from("friend_requests")
      .select("id, requester_id, status")
      .eq("recipient_id", user.id)
      .in("requester_id", userIds)
      .in("status", ["pending", "accepted"]),
  ]);

  if (outgoingError || incomingError) {
    return NextResponse.json(
      { error: outgoingError?.message ?? incomingError?.message ?? "Unable to load relationships." },
      { status: 500 }
    );
  }

  const outgoingById = new Map(
    (outgoingRows ?? []).map((row) => [row.recipient_id, row])
  );
  const incomingById = new Map(
    (incomingRows ?? []).map((row) => [row.requester_id, row])
  );

  return NextResponse.json({
    users: users.map((candidate) => {
      const outgoing = outgoingById.get(candidate.id);
      const incoming = incomingById.get(candidate.id);

      const outgoingPending = outgoing?.status === "pending";
      const incomingPending = incoming?.status === "pending";
      const outgoingAccepted = outgoing?.status === "accepted";
      const incomingAccepted = incoming?.status === "accepted";
      const friends = outgoingAccepted || incomingAccepted;

      const friendStatus = friends
        ? "friends"
        : outgoingPending
          ? "request_sent"
          : incomingPending
            ? "request_received"
            : "none";

      const following = friends || outgoingPending;
      const follows_you = friends || incomingPending;

      return {
        ...candidate,
        following,
        follows_you,
        friends,
        friend_status: friendStatus,
        outgoing_request_id: outgoingPending ? outgoing?.id ?? null : null,
        incoming_request_id: incomingPending ? incoming?.id ?? null : null,
        friend_request_id: outgoingAccepted
          ? outgoing?.id ?? null
          : incomingAccepted
            ? incoming?.id ?? null
            : null,
      };
    }),
  });
}
