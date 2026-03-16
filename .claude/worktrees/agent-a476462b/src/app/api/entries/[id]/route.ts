import { NextResponse } from "next/server";
import { getPublicProfileName } from "@/lib/publicProfiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchPrimaryGrapesByEntryId } from "@/lib/primaryGrapes";
import {
  canUserViewEntry,
  getAcceptedFriendIds,
  getBlockedEitherWayUserIds,
  getFriendsOfFriendsIds,
} from "@/lib/access/entryVisibility";
import { resolveInteractionAccessForViewer } from "@/lib/access/interactionVisibility";
import { resolveGroupedPostData } from "@/server/entries/groupPosts";
import { signPhotoUrl } from "@/server/storage/signedUrls";
import { createEntryPutHandler } from "./putHandler";
import { createEntryDeleteHandler } from "./deleteHandler";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("wine_entries")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  const needsVisibilityChecks = user.id !== data.user_id;
  const blockedUserIds = needsVisibilityChecks
    ? await getBlockedEitherWayUserIds(supabase, user.id)
    : undefined;
  const acceptedFriendIds = needsVisibilityChecks
    ? await getAcceptedFriendIds(supabase, user.id)
    : undefined;
  const friendsOfFriendsIds =
    needsVisibilityChecks && acceptedFriendIds
      ? await getFriendsOfFriendsIds(supabase, user.id, acceptedFriendIds)
      : undefined;

  try {
    const canView = await canUserViewEntry({
      supabase,
      viewerUserId: user.id,
      ownerUserId: data.user_id,
      entryPrivacy: data.entry_privacy,
      acceptedFriendIds,
      friendsOfFriendsIds,
      blockedUserIds,
    });
    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch (visibilityError) {
    const message =
      visibilityError instanceof Error
        ? visibilityError.message
        : "Unable to verify entry visibility.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const tastedWithIds = Array.isArray(data.tasted_with_user_ids)
    ? data.tasted_with_user_ids
    : [];
  let tastedWithUsers: { id: string; display_name: string | null; email: string | null }[] = [];

  if (tastedWithIds.length > 0) {
    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("id, display_name, first_name, last_name, email")
      .in("id", tastedWithIds);

    const nameMap = new Map(
      (profiles ?? []).map((profile) => [
        profile.id,
        {
          display_name: getPublicProfileName(profile),
          email: null,
        },
      ])
    );

    tastedWithUsers = tastedWithIds.map((userId: string) => ({
      id: userId,
      display_name: nameMap.get(userId)?.display_name ?? null,
      email: nameMap.get(userId)?.email ?? null,
    }));
  }

  // If the viewer was tagged, check if they've already added this tasting to their cellar.
  let viewer_log_entry_id: string | null = null;
  const rootEntryIdFromRow =
    typeof (data as { root_entry_id?: unknown }).root_entry_id === "string"
      ? (data as { root_entry_id: string }).root_entry_id
      : null;
  const canonicalEntryId = rootEntryIdFromRow ?? data.id;
  const viewerIsTagged =
    data.user_id !== user.id && tastedWithIds.includes(user.id);

  if (viewerIsTagged && canonicalEntryId) {
    const { data: existingCopy, error: existingError } = await supabase
      .from("wine_entries")
      .select("id")
      .eq("user_id", user.id)
      .eq("root_entry_id", canonicalEntryId)
      .maybeSingle();

    if (!existingError && existingCopy?.id) {
      viewer_log_entry_id = existingCopy.id;
    }
  }

  // Reactions: counts, current user's reactions, and reactor display names.
  const reactionCounts: Record<string, number> = {};
  const myReactions: string[] = [];
  const reactionUsers: Record<string, string[]> = {};
  const reactorUserIds = new Set<string>();

  const { data: reactions } = await supabase
    .from("entry_reactions")
    .select("user_id, emoji")
    .eq("entry_id", id);

  (reactions ?? []).forEach((r: { user_id: string; emoji: string }) => {
    reactionCounts[r.emoji] = (reactionCounts[r.emoji] ?? 0) + 1;
    reactorUserIds.add(r.user_id);
    if (r.user_id === user.id && !myReactions.includes(r.emoji)) {
      myReactions.push(r.emoji);
    }
    const list = reactionUsers[r.emoji] ?? [];
    if (!list.includes(r.user_id)) list.push(r.user_id);
    reactionUsers[r.emoji] = list;
  });

  // Resolve reactor user IDs to display names.
  const reactorIds = Array.from(reactorUserIds);
  if (reactorIds.length > 0) {
    const { data: reactorProfiles } = await supabase
      .from("public_profiles")
      .select("id, display_name, first_name, last_name, email")
      .in("id", reactorIds);
    const reactorNameMap = new Map(
      (reactorProfiles ?? []).map((profile) => [
        profile.id as string,
        getPublicProfileName(profile),
      ])
    );
    for (const emoji of Object.keys(reactionUsers)) {
      reactionUsers[emoji] = reactionUsers[emoji].map(
        (uid) => reactorNameMap.get(uid) ?? "Unknown"
      );
    }
  }

  // Comment count (best-effort).
  let commentCount = 0;
  const { count: commentCountResult, error: commentCountError } = await supabase
    .from("entry_comments")
    .select("id", { count: "exact", head: true })
    .eq("entry_id", id);
  if (!commentCountError && typeof commentCountResult === "number") {
    commentCount = commentCountResult;
  }

  const interactionAccess = await resolveInteractionAccessForViewer({
    supabase,
    viewerUserId: user.id,
    ownerUserId: data.user_id,
    entryPrivacy: data.entry_privacy,
    reactionPrivacy: data.reaction_privacy,
    commentsPrivacy: data.comments_privacy,
    commentsScope: data.comments_scope,
    acceptedFriendIds,
    friendsOfFriendsIds,
    blockedUserIds,
  });

  const entry = {
    ...data,
    primary_grapes:
      (await fetchPrimaryGrapesByEntryId(supabase, [data.id])).get(data.id) ?? [],
    label_image_url: await signPhotoUrl(data.label_image_path, supabase),
    place_image_url: await signPhotoUrl(data.place_image_path, supabase),
    pairing_image_url: await signPhotoUrl(data.pairing_image_path, supabase),
    tasted_with_users: tastedWithUsers,
    viewer_log_entry_id,
    reaction_counts: reactionCounts,
    my_reactions: myReactions,
    reaction_users: reactionUsers,
    comment_count: commentCount,
    reaction_privacy: interactionAccess.reactionPrivacy,
    comments_privacy: interactionAccess.commentsPrivacy,
    can_react: interactionAccess.canReact,
    can_comment: interactionAccess.canComment,
  };

  const groupedPostData = await resolveGroupedPostData(supabase, [
    {
      id: data.id,
      entry_group_id:
        typeof (data as { entry_group_id?: unknown }).entry_group_id === "string"
          ? ((data as { entry_group_id: string }).entry_group_id as string)
          : null,
    },
  ]);
  const groupedPost = groupedPostData.get(data.id);

  return NextResponse.json({
    entry: groupedPost
      ? {
          ...entry,
          entry_group: groupedPost.entry_group,
          group_slides: groupedPost.group_slides,
        }
      : entry,
  });
}

export const PUT = createEntryPutHandler();
export const DELETE = createEntryDeleteHandler();
