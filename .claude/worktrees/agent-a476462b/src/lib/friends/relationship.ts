import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FriendStatus = "none" | "request_sent" | "request_received" | "friends";

export type FriendRelationship = {
  status: FriendStatus;
  following: boolean;
  follows_you: boolean;
  friends: boolean;
  outgoing_request_id: string | null;
  incoming_request_id: string | null;
  friend_request_id: string | null;
};

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type FriendRequestRow = {
  id: string;
  status: "pending" | "accepted" | "declined";
  created_at?: string;
};

function relationshipFromRows(
  outgoing: FriendRequestRow | null,
  incoming: FriendRequestRow | null
): FriendRelationship {
  const outgoingPending = outgoing?.status === "pending";
  const incomingPending = incoming?.status === "pending";
  const outgoingAccepted = outgoing?.status === "accepted";
  const incomingAccepted = incoming?.status === "accepted";

  const friends = outgoingAccepted || incomingAccepted;
  const status: FriendStatus = friends
    ? "friends"
    : incomingPending
      ? "request_received"
      : outgoingPending
        ? "request_sent"
        : "none";

  return {
    status,
    following: friends || outgoingPending,
    follows_you: friends || incomingPending,
    friends,
    outgoing_request_id: outgoingPending ? outgoing?.id ?? null : null,
    incoming_request_id: incomingPending ? incoming?.id ?? null : null,
    friend_request_id: outgoingAccepted
      ? outgoing?.id ?? null
      : incomingAccepted
        ? incoming?.id ?? null
        : null,
  };
}

function pickRelevantRow(rows: FriendRequestRow[] | null): FriendRequestRow | null {
  if (!rows || rows.length === 0) return null;

  // Prefer an accepted relationship over pending/declined, and pending over declined.
  const accepted = rows.find((row) => row.status === "accepted");
  if (accepted) return accepted;

  const pending = rows.find((row) => row.status === "pending");
  if (pending) return pending;

  const declined = rows.find((row) => row.status === "declined");
  return declined ?? null;
}

export async function getFriendRelationship(
  supabase: SupabaseClient,
  currentUserId: string,
  targetUserId: string
): Promise<FriendRelationship> {
  const [outgoingRes, incomingRes] = await Promise.all([
    supabase
      .from("friend_requests")
      .select("id, status, created_at")
      .eq("requester_id", currentUserId)
      .eq("recipient_id", targetUserId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("friend_requests")
      .select("id, status, created_at")
      .eq("requester_id", targetUserId)
      .eq("recipient_id", currentUserId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (outgoingRes.error) {
    throw new Error(outgoingRes.error.message);
  }
  if (incomingRes.error) {
    throw new Error(incomingRes.error.message);
  }

  const outgoing = pickRelevantRow(outgoingRes.data as FriendRequestRow[] | null);
  const incoming = pickRelevantRow(incomingRes.data as FriendRequestRow[] | null);
  return relationshipFromRows(outgoing, incoming);
}
