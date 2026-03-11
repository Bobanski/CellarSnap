import {
  getAcceptedFriendIds,
  getBlockedEitherWayUserIds,
  getFriendsOfFriendsIds,
} from "@/lib/access/entryVisibility";
import {
  canViewTestAuthoredContent,
  getTestAccountStatusMap,
} from "@/lib/access/testAccounts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type ProfileEntryPrivacy =
  | "public"
  | "friends_of_friends"
  | "friends"
  | "private";

type ProfileEntryVisibilityParams = {
  isOwnProfile: boolean;
  isBlocked: boolean;
  isFriend: boolean;
  isFriendOfFriend: boolean;
  isTestViewer: boolean;
};

export function resolveAllowedProfileEntryPrivacies({
  isOwnProfile,
  isBlocked,
  isFriend,
  isFriendOfFriend,
  isTestViewer,
}: ProfileEntryVisibilityParams): ProfileEntryPrivacy[] {
  if (isOwnProfile || isTestViewer) {
    return ["public", "friends_of_friends", "friends", "private"];
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
        isTestViewer: false,
      }),
    };
  }

  const testAccountStatus = await getTestAccountStatusMap(supabase, [
    viewerUserId,
    targetUserId,
  ]);
  const viewerIsTestAccount = testAccountStatus.get(viewerUserId) ?? false;
  const targetIsTestAccount = testAccountStatus.get(targetUserId) ?? false;

  if (
    !canViewTestAuthoredContent({
      viewerUserId,
      ownerUserId: targetUserId,
      viewerIsTestAccount,
      ownerIsTestAccount: targetIsTestAccount,
    })
  ) {
    return {
      blocked: true,
      isOwnProfile,
      allowedPrivacies: [],
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
        isTestViewer: viewerIsTestAccount,
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
        isTestViewer: viewerIsTestAccount,
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
      isTestViewer: viewerIsTestAccount,
    }),
  };
}
