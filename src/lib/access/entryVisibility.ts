import { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type EntryPrivacy = "public" | "friends" | "private" | null | undefined;

function normalizeEntryPrivacy(value: EntryPrivacy): "public" | "friends" | "private" {
  if (value === "friends" || value === "private") {
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

export async function canUserViewEntry({
  supabase,
  viewerUserId,
  ownerUserId,
  entryPrivacy,
  acceptedFriendIds,
}: {
  supabase: SupabaseClient;
  viewerUserId: string;
  ownerUserId: string;
  entryPrivacy: EntryPrivacy;
  acceptedFriendIds?: Set<string>;
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

  if (acceptedFriendIds) {
    return acceptedFriendIds.has(ownerUserId);
  }

  return isAcceptedFriend(supabase, viewerUserId, ownerUserId);
}
