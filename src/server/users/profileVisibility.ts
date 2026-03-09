import {
  getAcceptedFriendIds,
  getBlockedEitherWayUserIds,
  getFriendsOfFriendsIds,
} from "@/lib/access/entryVisibility";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type ProfileEntryPrivacy = "public" | "friends_of_friends" | "friends";

type ProfileEntryVisibilityParams = {
  isOwnProfile: boolean;
  isBlocked: boolean;
  isFriend: boolean;
  isFriendOfFriend: boolean;
};

export function resolveAllowedProfileEntryPrivacies({
  isOwnProfile,
  isBlocked,
  isFriend,
  isFriendOfFriend,
}: ProfileEntryVisibilityParams): ProfileEntryPrivacy[] {
  if (isOwnProfile) {
    return ["public", "friends_of_friends", "friends"];
  }
  if (isBlocked) {
    return [];
  }
  if (isFriend) {
    return ["public", "friends_of_friends", "friends"];
  }
  if (isFriendOfFriend) {
    return ["public", "friends_of_friends"];
  }
  return ["public"];
}

export async function resolveProfileEntryAccess({
  supabase,
  viewerUserId,
  targetUserId,
}: {
  supabase: SupabaseClient;
  viewerUserId: string;
  targetUserId: string;
}) {
  const isOwnProfile = viewerUserId === targetUserId;
  if (isOwnProfile) {
    return {
      blocked: false,
      isOwnProfile,
      allowedPrivacies: resolveAllowedProfileEntryPrivacies({
        isOwnProfile,
        isBlocked: false,
        isFriend: false,
        isFriendOfFriend: false,
      }),
    };
  }

  const blockedUserIds = await getBlockedEitherWayUserIds(supabase, viewerUserId);
  const isBlocked = blockedUserIds.has(targetUserId);
  if (isBlocked) {
    return {
      blocked: true,
      isOwnProfile,
      allowedPrivacies: resolveAllowedProfileEntryPrivacies({
        isOwnProfile,
        isBlocked,
        isFriend: false,
        isFriendOfFriend: false,
      }),
    };
  }

  const acceptedFriendIds = await getAcceptedFriendIds(supabase, viewerUserId);
  const isFriend = acceptedFriendIds.has(targetUserId);
  if (isFriend) {
    return {
      blocked: false,
      isOwnProfile,
      allowedPrivacies: resolveAllowedProfileEntryPrivacies({
        isOwnProfile,
        isBlocked: false,
        isFriend,
        isFriendOfFriend: false,
      }),
    };
  }

  const friendsOfFriendsIds = await getFriendsOfFriendsIds(
    supabase,
    viewerUserId,
    acceptedFriendIds
  );
  const isFriendOfFriend = friendsOfFriendsIds.has(targetUserId);

  return {
    blocked: false,
    isOwnProfile,
    allowedPrivacies: resolveAllowedProfileEntryPrivacies({
      isOwnProfile,
      isBlocked: false,
      isFriend: false,
      isFriendOfFriend,
    }),
  };
}
