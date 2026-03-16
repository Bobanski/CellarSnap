import {
  getFriendRelationship,
  type FriendRelationship,
} from "@/lib/friends/relationship";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RelationshipSupabaseClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

export type FriendRelationshipPayload = {
  following: boolean;
  follows_you: boolean;
  friends: boolean;
  friend_status: FriendRelationship["status"];
  outgoing_request_id: string | null;
  incoming_request_id: string | null;
  friend_request_id: string | null;
};

export function toFriendRelationshipPayload(
  relationship: FriendRelationship
): FriendRelationshipPayload {
  return {
    following: relationship.following,
    follows_you: relationship.follows_you,
    friends: relationship.friends,
    friend_status: relationship.status,
    outgoing_request_id: relationship.outgoing_request_id,
    incoming_request_id: relationship.incoming_request_id,
    friend_request_id: relationship.friend_request_id,
  };
}

export async function getFriendRelationshipPayload(
  supabase: RelationshipSupabaseClient,
  currentUserId: string,
  targetUserId: string
) {
  const relationship = await getFriendRelationship(
    supabase,
    currentUserId,
    targetUserId
  );

  return toFriendRelationshipPayload(relationship);
}
