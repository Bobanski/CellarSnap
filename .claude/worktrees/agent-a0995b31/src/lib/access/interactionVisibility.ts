import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canUserViewEntry, type EntryPrivacy } from "@/lib/access/entryVisibility";
import {
  canViewTestAuthoredContent,
  getTestAccountStatusMap,
} from "@/lib/access/testAccounts";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type NormalizedEntryPrivacy =
  | "public"
  | "friends_of_friends"
  | "friends"
  | "private";

export function normalizePrivacyValue(
  value: unknown,
  fallback: NormalizedEntryPrivacy
): NormalizedEntryPrivacy {
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

export function resolveInteractionPrivacy({
  entryPrivacy,
  reactionPrivacy,
  commentsPrivacy,
  commentsScope,
}: {
  entryPrivacy: EntryPrivacy;
  reactionPrivacy?: EntryPrivacy;
  commentsPrivacy?: EntryPrivacy;
  commentsScope?: string | null;
}) {
  const normalizedEntryPrivacy = normalizePrivacyValue(entryPrivacy, "public");
  const legacyCommentsScope = commentsScope === "friends" ? "friends" : "viewers";

  const normalizedReactionPrivacy = normalizePrivacyValue(
    reactionPrivacy,
    normalizedEntryPrivacy
  );
  const normalizedCommentsPrivacy = normalizePrivacyValue(
    commentsPrivacy ??
      (legacyCommentsScope === "friends" && normalizedEntryPrivacy !== "private"
        ? "friends"
        : normalizedEntryPrivacy),
    normalizedEntryPrivacy
  );

  return {
    entryPrivacy: normalizedEntryPrivacy,
    reactionPrivacy: normalizedReactionPrivacy,
    commentsPrivacy: normalizedCommentsPrivacy,
  };
}

export async function resolveInteractionAccessForViewer({
  supabase,
  viewerUserId,
  ownerUserId,
  entryPrivacy,
  reactionPrivacy,
  commentsPrivacy,
  commentsScope,
  acceptedFriendIds,
  friendsOfFriendsIds,
  blockedUserIds,
  viewerIsTestAccount,
  ownerIsTestAccount,
}: {
  supabase: SupabaseClient;
  viewerUserId: string;
  ownerUserId: string;
  entryPrivacy: EntryPrivacy;
  reactionPrivacy?: EntryPrivacy;
  commentsPrivacy?: EntryPrivacy;
  commentsScope?: string | null;
  acceptedFriendIds?: Set<string>;
  friendsOfFriendsIds?: Set<string>;
  blockedUserIds?: Set<string>;
  viewerIsTestAccount?: boolean;
  ownerIsTestAccount?: boolean;
}) {
  const resolvedPrivacy = resolveInteractionPrivacy({
    entryPrivacy,
    reactionPrivacy,
    commentsPrivacy,
    commentsScope,
  });

  const needsTestStatus =
    viewerIsTestAccount === undefined || ownerIsTestAccount === undefined;
  const testAccountStatus =
    needsTestStatus
      ? await getTestAccountStatusMap(supabase, [viewerUserId, ownerUserId])
      : null;
  const resolvedViewerIsTestAccount =
    viewerIsTestAccount ?? testAccountStatus?.get(viewerUserId) ?? false;
  const resolvedOwnerIsTestAccount =
    ownerIsTestAccount ?? testAccountStatus?.get(ownerUserId) ?? false;
  const ownerCanSeeViewerContent = canViewTestAuthoredContent({
    viewerUserId: ownerUserId,
    ownerUserId: viewerUserId,
    viewerIsTestAccount: resolvedOwnerIsTestAccount,
    ownerIsTestAccount: resolvedViewerIsTestAccount,
  });

  const [canReact, canComment] = await Promise.all([
    canUserViewEntry({
      supabase,
      viewerUserId,
      ownerUserId,
      entryPrivacy: resolvedPrivacy.reactionPrivacy,
      acceptedFriendIds,
      friendsOfFriendsIds,
      blockedUserIds,
      viewerIsTestAccount: resolvedViewerIsTestAccount,
      ownerIsTestAccount: resolvedOwnerIsTestAccount,
    }),
    canUserViewEntry({
      supabase,
      viewerUserId,
      ownerUserId,
      entryPrivacy: resolvedPrivacy.commentsPrivacy,
      acceptedFriendIds,
      friendsOfFriendsIds,
      blockedUserIds,
      viewerIsTestAccount: resolvedViewerIsTestAccount,
      ownerIsTestAccount: resolvedOwnerIsTestAccount,
    }),
  ]);

  return {
    ...resolvedPrivacy,
    canReact: ownerCanSeeViewerContent && canReact,
    canComment: ownerCanSeeViewerContent && canComment,
  };
}
