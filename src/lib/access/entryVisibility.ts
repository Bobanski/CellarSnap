import { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type EntryPrivacy =
  | "public"
  | "friends_of_friends"
  | "friends"
  | "private"
  | null
  | undefined;

function normalizeEntryPrivacy(
  value: EntryPrivacy
): "public" | "friends_of_friends" | "friends" | "private" {
  if (value === "friends_of_friends" || value === "friends" || value === "private") {
    return value;
  }
  return "public";
}

export async function getAcceptedFriendIds(
  supabase: SupabaseClient,
  userId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("friend_requests")
    .select("requester_id, recipient_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`);

  if (error) {
    throw new Error(error.message);
  }

  return new Set(
    (data ?? []).map((row) =>
      row.requester_id === userId ? row.recipient_id : row.requester_id
    )
  );
}

export async function isAcceptedFriend(
  supabase: SupabaseClient,
  userId: string,
  otherUserId: string
): Promise<boolean> {
  if (userId === otherUserId) {
    return false;
  }

  const friendIds = await getAcceptedFriendIds(supabase, userId);
  return friendIds.has(otherUserId);
}

export async function getFriendsOfFriendsIds(
  supabase: SupabaseClient,
  userId: string,
  acceptedFriendIds?: Set<string>
): Promise<Set<string>> {
  const friendIds = acceptedFriendIds ?? (await getAcceptedFriendIds(supabase, userId));
  if (friendIds.size === 0) {
    return new Set<string>();
  }

  const friendList = Array.from(friendIds);
  const [requesterRows, recipientRows] = await Promise.all([
    supabase
      .from("friend_requests")
      .select("requester_id, recipient_id")
      .eq("status", "accepted")
      .in("requester_id", friendList),
    supabase
      .from("friend_requests")
      .select("requester_id, recipient_id")
      .eq("status", "accepted")
      .in("recipient_id", friendList),
  ]);

  if (requesterRows.error) {
    throw new Error(requesterRows.error.message);
  }
  if (recipientRows.error) {
    throw new Error(recipientRows.error.message);
  }

  const fofIds = new Set<string>();
  const rows = [...(requesterRows.data ?? []), ...(recipientRows.data ?? [])];

  rows.forEach((row) => {
    const aIsFriend = friendIds.has(row.requester_id);
    const bIsFriend = friendIds.has(row.recipient_id);
    if (aIsFriend && row.recipient_id !== userId && !friendIds.has(row.recipient_id)) {
      fofIds.add(row.recipient_id);
    }
    if (bIsFriend && row.requester_id !== userId && !friendIds.has(row.requester_id)) {
      fofIds.add(row.requester_id);
    }
  });

  return fofIds;
}

export async function canUserViewEntry({
  supabase,
  viewerUserId,
  ownerUserId,
  entryPrivacy,
  acceptedFriendIds,
  friendsOfFriendsIds,
}: {
  supabase: SupabaseClient;
  viewerUserId: string;
  ownerUserId: string;
  entryPrivacy: EntryPrivacy;
  acceptedFriendIds?: Set<string>;
  friendsOfFriendsIds?: Set<string>;
}): Promise<boolean> {
  if (viewerUserId === ownerUserId) {
    return true;
  }

  const privacy = normalizeEntryPrivacy(entryPrivacy);
  if (privacy === "public") {
    return true;
  }
  if (privacy === "private") {
    return false;
  }

  if (privacy === "friends") {
    if (acceptedFriendIds) {
      return acceptedFriendIds.has(ownerUserId);
    }
    return isAcceptedFriend(supabase, viewerUserId, ownerUserId);
  }

  if (acceptedFriendIds?.has(ownerUserId)) {
    return true;
  }
  if (friendsOfFriendsIds?.has(ownerUserId)) {
    return true;
  }

  const friendIds = acceptedFriendIds ?? (await getAcceptedFriendIds(supabase, viewerUserId));
  if (friendIds.has(ownerUserId)) {
    return true;
  }
  const fofIds = friendsOfFriendsIds ?? (await getFriendsOfFriendsIds(supabase, viewerUserId, friendIds));
  return fofIds.has(ownerUserId);
}
