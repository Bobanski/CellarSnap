import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAcceptedFriendIds,
  getFriendsOfFriendsIds,
  type EntryPrivacy,
} from "@/lib/access/entryVisibility";

type FeedEntryRow = {
  id: string;
  user_id: string;
  root_entry_id?: string | null;
  is_feed_visible?: boolean | null;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  consumed_at: string;
  rating: number | null;
  qpr_level: string | null;
  tasted_with_user_ids: string[] | null;
  notes: string | null;
  label_image_path: string | null;
  place_image_path: string | null;
  pairing_image_path: string | null;
  entry_privacy: EntryPrivacy;
  created_at: string;
};

type InteractionSettingsRow = {
  id: string;
  reaction_privacy?: string | null;
  comments_privacy?: string | null;
  comments_scope?: string | null;
};

function normalizePrivacyValue(
  value: unknown,
  fallback: "public" | "friends_of_friends" | "friends" | "private"
): "public" | "friends_of_friends" | "friends" | "private" {
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

function canViewerAccessByPrivacy({
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
}): boolean {
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

async function createSignedUrl(
  path: string | null,
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
) {
  if (!path) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from("wine-photos")
    .createSignedUrl(path, 60 * 60);

  if (error) {
    return null;
  }

  return data.signedUrl;
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");
  const cursor = url.searchParams.get("cursor"); // created_at (ISO)
  const rawLimit = Number(url.searchParams.get("limit") ?? "");
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(50, Math.max(1, rawLimit))
      : 30;

  const acceptedFriendIdsSet = await getAcceptedFriendIds(supabase, user.id);
  const friendIds = Array.from(acceptedFriendIdsSet);
  const friendsOfFriendsIdsSet = await getFriendsOfFriendsIds(
    supabase,
    user.id,
    acceptedFriendIdsSet
  );

  const baseSelectFields =
    "id, user_id, wine_name, producer, vintage, notes, consumed_at, rating, qpr_level, tasted_with_user_ids, label_image_path, place_image_path, pairing_image_path, entry_privacy, created_at";
  const extendedSelectFields = `${baseSelectFields}, root_entry_id, is_feed_visible`;

  const dedupeEntries = (rows: FeedEntryRow[]) => {
    const byKey = new Map<string, FeedEntryRow>();

    rows.forEach((entry) => {
      const key = entry.root_entry_id ?? entry.id;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, entry);
        return;
      }

      const existingIsCanonical = !existing.root_entry_id;
      const nextIsCanonical = !entry.root_entry_id;
      if (nextIsCanonical && !existingIsCanonical) {
        byKey.set(key, entry);
      }
    });

    return Array.from(byKey.values()).sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
  };

  const buildEntriesQuery = ({
    fields,
    withTastingSupport,
  }: {
    fields: string;
    withTastingSupport: boolean;
  }) => {
    let query = supabase.from("wine_entries").select(fields);

    if (scope === "friends") {
      const socialAuthorIds = Array.from(
        new Set([...friendIds, ...Array.from(friendsOfFriendsIdsSet)])
      );
      query = query
        .in("user_id", socialAuthorIds)
        .in("entry_privacy", ["public", "friends_of_friends", "friends"])
        .neq("user_id", user.id);
    } else {
      query = query.eq("entry_privacy", "public").neq("user_id", user.id);
    }

    if (withTastingSupport) {
      query = query.eq("is_feed_visible", true);
    }

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    return query;
  };

  if (scope === "friends" && friendIds.length === 0 && friendsOfFriendsIdsSet.size === 0) {
    return NextResponse.json({ entries: [], viewer_user_id: user.id });
  }

  let entries: FeedEntryRow[] = [];
  let hasTastingSupport = false;

  {
    const fetchLimit =
      scope === "friends" ? Math.min(150, limit * 4 + 1) : limit + 1;
    const attempt = await buildEntriesQuery({
      fields: extendedSelectFields,
      withTastingSupport: true,
    })
      .order("created_at", { ascending: false })
      .limit(fetchLimit);

    if (!attempt.error) {
      entries = (attempt.data ?? []) as unknown as FeedEntryRow[];
      hasTastingSupport = true;
    } else if (
      attempt.error.message.includes("is_feed_visible") ||
      attempt.error.message.includes("root_entry_id") ||
      attempt.error.message.includes("column")
    ) {
      // Backwards compatible: if tasting columns haven't been added, fall back.
      const fallback = await buildEntriesQuery({
        fields: baseSelectFields,
        withTastingSupport: false,
      })
        .order("created_at", { ascending: false })
        .limit(fetchLimit);

      if (fallback.error) {
        return NextResponse.json(
          { error: fallback.error.message },
          { status: 500 }
        );
      }
      entries = (fallback.data ?? []) as unknown as FeedEntryRow[];
    } else {
      return NextResponse.json({ error: attempt.error.message }, { status: 500 });
    }
  }

  const deduped = hasTastingSupport ? dedupeEntries(entries) : entries;
  const pageEntries =
    deduped && deduped.length > limit ? deduped.slice(0, limit) : deduped ?? [];
  const has_more = (deduped?.length ?? 0) > limit;
  const next_cursor = has_more
    ? pageEntries[pageEntries.length - 1]?.created_at ?? null
    : null;

  const entryIds = pageEntries.map((entry) => entry.id);
  const userIds = Array.from(
    new Set(
      pageEntries.flatMap((entry) => [
        entry.user_id,
        ...(entry.tasted_with_user_ids ?? []),
      ])
    )
  );
  const { data: profilesWithAvatar, error: profilesError } = await supabase
    .from("profiles")
    .select("id, display_name, email, avatar_path")
    .in("id", userIds);

  let profiles:
    | {
        id: string;
        display_name: string | null;
        email: string | null;
        avatar_path?: string | null;
      }[]
    | null = null;
  if (
    profilesError &&
    (profilesError.message.includes("avatar_path") ||
      profilesError.message.includes("column"))
  ) {
    const { data: fallback } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", userIds);
    profiles = (fallback ?? []).map((profile) => ({ ...profile, avatar_path: null }));
  } else if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  } else {
    profiles = profilesWithAvatar;
  }

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      {
        display_name: profile.display_name ?? null,
        email: profile.email ?? null,
        avatar_path: profile.avatar_path ?? null,
      },
    ])
  );

  const { data: entryPhotos } =
    entryIds.length > 0
      ? await supabase
          .from("entry_photos")
          .select("entry_id, type, path, position, created_at")
          .in("type", [
            "label",
            "place",
            "people",
            "pairing",
            "lineup",
            "other_bottles",
          ])
          .in("entry_id", entryIds)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true })
      : { data: [] };

  // Load optional interaction settings with safe fallback when columns are missing.
  const interactionSettingsByEntryId = new Map<string, InteractionSettingsRow>();
  if (entryIds.length > 0) {
    const selectAttempts = [
      "id, reaction_privacy, comments_privacy, comments_scope",
      "id, comments_scope",
      "id",
    ];

    let loaded = false;
    for (let index = 0; index < selectAttempts.length; index += 1) {
      const { data, error } = await supabase
        .from("wine_entries")
        .select(selectAttempts[index])
        .in("id", entryIds);

      if (!error) {
        const settingsRows = (data ?? []) as unknown as InteractionSettingsRow[];
        settingsRows.forEach((row) => {
          interactionSettingsByEntryId.set(row.id, row);
        });
        loaded = true;
        break;
      }

      const missingReactionPrivacy = error.message.includes("reaction_privacy");
      const missingCommentsPrivacy = error.message.includes("comments_privacy");
      const missingCommentsScope = error.message.includes("comments_scope");

      if (index === 0 && (missingReactionPrivacy || missingCommentsPrivacy || missingCommentsScope)) {
        continue;
      }
      if (index === 1 && missingCommentsScope) {
        continue;
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!loaded) {
      entryIds.forEach((entryId) => {
        interactionSettingsByEntryId.set(entryId, { id: entryId });
      });
    }
  }

  // Reactions: counts per entry per emoji, current user's reactions, and reactor user IDs.
  const reactionCountsMap = new Map<string, Record<string, number>>();
  const myReactionsMap = new Map<string, string[]>();
  const reactionUserIdsMap = new Map<string, Record<string, string[]>>();
  const allReactorUserIds = new Set<string>();
  if (entryIds.length > 0) {
    const { data: reactions } = await supabase
      .from("entry_reactions")
      .select("entry_id, user_id, emoji")
      .in("entry_id", entryIds);
    (reactions ?? []).forEach((reaction: { entry_id: string; user_id: string; emoji: string }) => {
      const counts = reactionCountsMap.get(reaction.entry_id) ?? {};
      counts[reaction.emoji] = (counts[reaction.emoji] ?? 0) + 1;
      reactionCountsMap.set(reaction.entry_id, counts);
      const emojiUsers = reactionUserIdsMap.get(reaction.entry_id) ?? {};
      const list = emojiUsers[reaction.emoji] ?? [];
      if (!list.includes(reaction.user_id)) list.push(reaction.user_id);
      emojiUsers[reaction.emoji] = list;
      reactionUserIdsMap.set(reaction.entry_id, emojiUsers);
      allReactorUserIds.add(reaction.user_id);
      if (reaction.user_id === user.id) {
        const mine = myReactionsMap.get(reaction.entry_id) ?? [];
        if (!mine.includes(reaction.emoji)) mine.push(reaction.emoji);
        myReactionsMap.set(reaction.entry_id, mine);
      }
    });
  }

  // Fetch display names for reactor user IDs not already in profileMap.
  const missingReactorIds = Array.from(allReactorUserIds).filter(
    (id) => !profileMap.has(id)
  );
  if (missingReactorIds.length > 0) {
    const { data: reactorProfiles } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", missingReactorIds);
    (reactorProfiles ?? []).forEach((profile) => {
      profileMap.set(profile.id, {
        display_name: profile.display_name ?? null,
        email: profile.email ?? null,
        avatar_path: null,
      });
    });
  }

  // Comments: count per entry (best effort if comments table is unavailable).
  const commentCountsMap = new Map<string, number>();
  if (entryIds.length > 0) {
    const { data: comments, error: commentsError } = await supabase
      .from("entry_comments")
      .select("entry_id")
      .in("entry_id", entryIds);

    if (!commentsError) {
      (comments ?? []).forEach((comment: { entry_id: string }) => {
        commentCountsMap.set(
          comment.entry_id,
          (commentCountsMap.get(comment.entry_id) ?? 0) + 1
        );
      });
    } else if (
      !commentsError.message.includes("entry_comments") &&
      !commentsError.message.includes("relation") &&
      !commentsError.message.includes("column")
    ) {
      return NextResponse.json({ error: commentsError.message }, { status: 500 });
    }
  }

  type GalleryPhotoType =
    | "label"
    | "place"
    | "people"
    | "pairing"
    | "lineup"
    | "other_bottles";
  type GalleryPhotoRow = {
    type: GalleryPhotoType;
    path: string;
    position: number;
    created_at: string;
  };
  const typeOrder: Record<GalleryPhotoType, number> = {
    place: 0,
    people: 1,
    label: 2,
    lineup: 3,
    other_bottles: 4,
    pairing: 5,
  };

  const galleryRowsByEntryId = new Map<string, GalleryPhotoRow[]>();
  (entryPhotos ?? []).forEach((photo) => {
    if (
      photo.type !== "label" &&
      photo.type !== "place" &&
      photo.type !== "people" &&
      photo.type !== "pairing" &&
      photo.type !== "lineup" &&
      photo.type !== "other_bottles"
    ) {
      return;
    }
    const current = galleryRowsByEntryId.get(photo.entry_id) ?? [];
    current.push({
      type: photo.type,
      path: photo.path,
      position: photo.position ?? 0,
      created_at: photo.created_at ?? "",
    });
    galleryRowsByEntryId.set(photo.entry_id, current);
  });

  pageEntries.forEach((entry) => {
    const current = galleryRowsByEntryId.get(entry.id) ?? [];
    const hasLabel = current.some((photo) => photo.type === "label");
    const hasPlace = current.some((photo) => photo.type === "place");
    const hasPairing = current.some((photo) => photo.type === "pairing");

    if (!hasLabel && entry.label_image_path) {
      current.push({
        type: "label",
        path: entry.label_image_path,
        position: 0,
        created_at: entry.created_at,
      });
    }
    if (!hasPlace && entry.place_image_path) {
      current.push({
        type: "place",
        path: entry.place_image_path,
        position: 0,
        created_at: entry.created_at,
      });
    }
    if (!hasPairing && entry.pairing_image_path) {
      current.push({
        type: "pairing",
        path: entry.pairing_image_path,
        position: 0,
        created_at: entry.created_at,
      });
    }

    current.sort((a, b) => {
      const typeDiff = typeOrder[a.type] - typeOrder[b.type];
      if (typeDiff !== 0) return typeDiff;
      const posDiff = a.position - b.position;
      if (posDiff !== 0) return posDiff;
      return a.created_at.localeCompare(b.created_at);
    });
    galleryRowsByEntryId.set(entry.id, current);
  });

  const pathsToSign = new Set<string>();
  const authorAvatarPathByUserId = new Map<string, string>();

  pageEntries.forEach((entry) => {
    const authorProfile = profileMap.get(entry.user_id);
    const avatarPath = authorProfile?.avatar_path ?? null;
    if (avatarPath) {
      pathsToSign.add(avatarPath);
      authorAvatarPathByUserId.set(entry.user_id, avatarPath);
    }
    (galleryRowsByEntryId.get(entry.id) ?? []).forEach((photo) => {
      pathsToSign.add(photo.path);
    });
  });

  const signedUrlByPath = new Map<string, string | null>();
  await Promise.all(
    Array.from(pathsToSign).map(async (path) => {
      signedUrlByPath.set(path, await createSignedUrl(path, supabase));
    })
  );

  const feedEntries = pageEntries.map((entry) => {
    const authorProfile = profileMap.get(entry.user_id);
    const avatarPath = authorAvatarPathByUserId.get(entry.user_id) ?? null;
    const galleryRows = galleryRowsByEntryId.get(entry.id) ?? [];
    const photoGallery = galleryRows
      .map((photo) => {
        const signedUrl = signedUrlByPath.get(photo.path) ?? null;
        if (!signedUrl) return null;
        return {
          type: photo.type,
          url: signedUrl,
        };
      })
      .filter(
        (photo): photo is { type: GalleryPhotoType; url: string } =>
          photo !== null
      );

    const labelPhoto = photoGallery.find((photo) => photo.type === "label")?.url ?? null;
    const placePhoto = photoGallery.find((photo) => photo.type === "place")?.url ?? null;
    const pairingPhoto =
      photoGallery.find((photo) => photo.type === "pairing")?.url ?? null;

    const tastedWithUsers = (entry.tasted_with_user_ids ?? []).map((id: string) => ({
      id,
      display_name: profileMap.get(id)?.display_name ?? null,
      email: profileMap.get(id)?.email ?? null,
    }));

    const settings = interactionSettingsByEntryId.get(entry.id);
    const entryPrivacy = normalizePrivacyValue(entry.entry_privacy, "public");
    const legacyCommentsScope = settings?.comments_scope === "friends" ? "friends" : "viewers";
    const reactionPrivacy = normalizePrivacyValue(
      settings?.reaction_privacy,
      entryPrivacy
    );
    const commentsPrivacy = normalizePrivacyValue(
      settings?.comments_privacy ??
        (legacyCommentsScope === "friends" && entryPrivacy !== "private"
          ? "friends"
          : entryPrivacy),
      entryPrivacy
    );

    const canSeeReactions = canViewerAccessByPrivacy({
      viewerUserId: user.id,
      ownerUserId: entry.user_id,
      privacy: reactionPrivacy,
      acceptedFriendIds: acceptedFriendIdsSet,
      friendsOfFriendsIds: friendsOfFriendsIdsSet,
    });
    const canSeeComments = canViewerAccessByPrivacy({
      viewerUserId: user.id,
      ownerUserId: entry.user_id,
      privacy: commentsPrivacy,
      acceptedFriendIds: acceptedFriendIdsSet,
      friendsOfFriendsIds: friendsOfFriendsIdsSet,
    });

    const reactionCounts = canSeeReactions
      ? reactionCountsMap.get(entry.id) ?? {}
      : {};
    const myReactions = canSeeReactions
      ? myReactionsMap.get(entry.id) ?? []
      : [];
    const rawReactionUserIds = canSeeReactions
      ? reactionUserIdsMap.get(entry.id) ?? {}
      : {};
    const reactionUsers: Record<string, string[]> = {};
    for (const [emoji, ids] of Object.entries(rawReactionUserIds)) {
      reactionUsers[emoji] = ids.map((id) => {
        const profile = profileMap.get(id);
        return profile?.display_name ?? profile?.email ?? "Unknown";
      });
    }
    const commentCount = canSeeComments
      ? commentCountsMap.get(entry.id) ?? 0
      : 0;

    return {
      ...entry,
      author_name: authorProfile?.display_name ?? authorProfile?.email ?? "Unknown",
      author_avatar_url: avatarPath ? signedUrlByPath.get(avatarPath) ?? null : null,
      label_image_url: labelPhoto,
      place_image_url: placePhoto,
      pairing_image_url: pairingPhoto,
      photo_gallery: photoGallery,
      tasted_with_users: tastedWithUsers,
      reaction_privacy: reactionPrivacy,
      comments_privacy: commentsPrivacy,
      can_react: canSeeReactions,
      can_comment: canSeeComments,
      comment_count: commentCount,
      reaction_counts: reactionCounts,
      my_reactions: myReactions,
      reaction_users: reactionUsers,
    };
  });

  return NextResponse.json({
    entries: feedEntries,
    next_cursor,
    has_more,
    viewer_user_id: user.id,
  });
}
