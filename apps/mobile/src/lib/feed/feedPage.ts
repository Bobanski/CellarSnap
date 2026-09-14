import { supabase } from "@/src/lib/supabase";

import { getAccessTokenForApi, getWebApiBaseUrl, PHOTO_DELIVERY_HEADERS } from "@/src/lib/api/webApi";
import { createFeedPageFetcher } from "./feedRequest";

type MobileSupabaseClient = typeof supabase;

import type { EntryPrivacy } from "./feedTypes";
export type * from "./feedTypes";

type FriendRequestPair = {
  requester_id: string;
  recipient_id: string;
};

export type SocialAudience = {
  socialAuthorIds: string[];
  acceptedFriendIds: Set<string>;
  friendsOfFriendsIds: Set<string>;
};

function normalizePrivacyValue(
  value: unknown,
  fallback: EntryPrivacy
): EntryPrivacy {
  if (
    value === "public" ||
    value === "friends_of_friends" ||
    value === "friends" ||
    value === "private"
  ) {
    return value;
  }
  return fallback;
}

export function canViewerAccessByPrivacy({
  viewerUserId,
  ownerUserId,
  privacy,
  acceptedFriendIds,
  friendsOfFriendsIds,
}: {
  viewerUserId: string;
  ownerUserId: string;
  privacy: EntryPrivacy;
  acceptedFriendIds: Set<string>;
  friendsOfFriendsIds: Set<string>;
}) {
  if (viewerUserId === ownerUserId) {
    return true;
  }

  const normalized = normalizePrivacyValue(privacy, "public");
  if (normalized === "public") {
    return true;
  }
  if (normalized === "private") {
    return false;
  }
  if (normalized === "friends") {
    return acceptedFriendIds.has(ownerUserId);
  }

  return (
    acceptedFriendIds.has(ownerUserId) || friendsOfFriendsIds.has(ownerUserId)
  );
}

export async function loadSocialAudience(
  viewerUserId: string,
  supabaseClient: MobileSupabaseClient
): Promise<SocialAudience> {
  const { data, error } = await supabaseClient
    .from("friend_requests")
    .select("requester_id, recipient_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${viewerUserId},recipient_id.eq.${viewerUserId}`);

  if (error || !data) {
    return {
      socialAuthorIds: [],
      acceptedFriendIds: new Set<string>(),
      friendsOfFriendsIds: new Set<string>(),
    };
  }

  const acceptedFriendIds = new Set<string>();
  (data as FriendRequestPair[]).forEach((row) => {
    const friendId = row.requester_id === viewerUserId ? row.recipient_id : row.requester_id;
    if (friendId !== viewerUserId) {
      acceptedFriendIds.add(friendId);
    }
  });

  const socialIds = new Set<string>(acceptedFriendIds);
  const friendsOfFriendsIds = new Set<string>();
  const directList = Array.from(acceptedFriendIds);
  if (directList.length === 0) {
    return {
      socialAuthorIds: [],
      acceptedFriendIds,
      friendsOfFriendsIds,
    };
  }

  const [
    { data: foafRequesterRows, error: foafRequesterError },
    { data: foafRecipientRows, error: foafRecipientError },
  ] = await Promise.all([
    supabaseClient
      .from("friend_requests")
      .select("requester_id, recipient_id")
      .eq("status", "accepted")
      .in("requester_id", directList),
    supabaseClient
      .from("friend_requests")
      .select("requester_id, recipient_id")
      .eq("status", "accepted")
      .in("recipient_id", directList),
  ]);

  if (!foafRequesterError && foafRequesterRows) {
    (foafRequesterRows as FriendRequestPair[]).forEach((row) => {
      if (row.recipient_id !== viewerUserId) {
        socialIds.add(row.recipient_id);
        if (!acceptedFriendIds.has(row.recipient_id)) {
          friendsOfFriendsIds.add(row.recipient_id);
        }
      }
      if (row.requester_id !== viewerUserId) {
        socialIds.add(row.requester_id);
        if (!acceptedFriendIds.has(row.requester_id)) {
          friendsOfFriendsIds.add(row.requester_id);
        }
      }
    });
  }

  if (!foafRecipientError && foafRecipientRows) {
    (foafRecipientRows as FriendRequestPair[]).forEach((row) => {
      if (row.recipient_id !== viewerUserId) {
        socialIds.add(row.recipient_id);
        if (!acceptedFriendIds.has(row.recipient_id)) {
          friendsOfFriendsIds.add(row.recipient_id);
        }
      }
      if (row.requester_id !== viewerUserId) {
        socialIds.add(row.requester_id);
        if (!acceptedFriendIds.has(row.requester_id)) {
          friendsOfFriendsIds.add(row.requester_id);
        }
      }
    });
  }

  return {
    socialAuthorIds: Array.from(socialIds),
    acceptedFriendIds,
    friendsOfFriendsIds,
  };
}

// Feed reads use the server projection; detail interaction helpers above remain
// for the existing detail client until its own adoption slice.
export const fetchFeedPage = createFeedPageFetcher({
  getBaseUrl: getWebApiBaseUrl,
  getAccessToken: getAccessTokenForApi,
  photoHeaders: PHOTO_DELIVERY_HEADERS,
});
