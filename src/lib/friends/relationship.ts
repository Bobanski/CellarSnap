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

export async function getFriendRelationship(
  supabase: SupabaseClient,
  currentUserId: string,
  targetUserId: string
): Promise<FriendRelationship> {
  const [outgoingRes, incomingRes] = await Promise.all([
    supabase
      .from("friend_requests")
      .select("id, status")
      .eq("requester_id", currentUserId)
      .eq("recipient_id", targetUserId)
      .maybeSingle(),
    supabase
      .from("friend_requests")
      .select("id, status")
      .eq("requester_id", targetUserId)
      .eq("recipient_id", currentUserId)
      .maybeSingle(),
  ]);

  if (outgoingRes.error) {
    throw new Error(outgoingRes.error.message);
  }
  if (incomingRes.error) {
    throw new Error(incomingRes.error.message);
  }

  const outgoing = outgoingRes.data as FriendRequestRow | null;
  const incoming = incomingRes.data as FriendRequestRow | null;
  return relationshipFromRows(outgoing, incoming);
}
