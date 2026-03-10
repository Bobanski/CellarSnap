import { getPublicProfileName } from "@/src/lib/publicProfiles";
import { signPhotoUrls } from "@/src/lib/storage/signedUrls";
import { supabase } from "@/src/lib/supabase";

type MobileSupabaseClient = typeof supabase;

export type FeedScope = "public" | "friends";
export type EntryPrivacy = "public" | "friends_of_friends" | "friends" | "private";
export type QprLevel = "extortion" | "pricey" | "mid" | "good_value" | "absolute_steal";
export type FeedPhotoType =
  | "label"
  | "place"
  | "people"
  | "pairing"
  | "lineup"
  | "other_bottles";

export type FeedEntryRow = {
  id: string;
  user_id: string;
  root_entry_id?: string | null;
  is_feed_visible?: boolean | null;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  notes: string | null;
  consumed_at: string;
  rating: number | null;
  qpr_level: QprLevel | null;
  tasted_with_user_ids: string[] | null;
  label_image_path: string | null;
  place_image_path: string | null;
  pairing_image_path: string | null;
  entry_privacy: EntryPrivacy;
  created_at: string;
};

export type PrimaryGrape = {
  id: string;
  name: string;
  position: number;
};

type EntryPrimaryGrapeRow = {
  entry_id: string;
  position: number;
  grape_varieties:
    | {
        id: string;
        name: string;
      }
    | {
        id: string;
        name: string;
      }[]
    | null;
};

type FeedProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_path?: string | null;
};

export type FeedPhoto = {
  type: FeedPhotoType;
  url: string;
};

type FeedPhotoRow = {
  entry_id: string;
  type: FeedPhotoType;
  path: string;
  position: number;
  created_at: string;
};

export type MobileFeedEntry = FeedEntryRow & {
  author_name: string;
  author_avatar_url: string | null;
  primary_grapes: PrimaryGrape[];
  photo_gallery: FeedPhoto[];
  tasted_with_users: Array<{
    id: string;
    display_name: string | null;
    email: string | null;
  }>;
  can_react: boolean;
  can_comment: boolean;
  comments_privacy: EntryPrivacy;
  my_reactions: string[];
  reaction_counts: Record<string, number>;
  reaction_users: Record<string, string[]>;
  comment_count: number;
};

type InteractionSettingsRow = {
  id: string;
  reaction_privacy?: string | null;
  comments_privacy?: string | null;
  comments_scope?: string | null;
};

type FriendRequestPair = {
  requester_id: string;
  recipient_id: string;
};

export type SocialAudience = {
  socialAuthorIds: string[];
  acceptedFriendIds: Set<string>;
  friendsOfFriendsIds: Set<string>;
};

const TYPE_ORDER: Record<FeedPhotoType, number> = {
  place: 0,
  people: 1,
  label: 2,
  lineup: 3,
  other_bottles: 4,
  pairing: 5,
};

function isMissingSharedTastingColumns(message: string) {
  return (
    message.includes("root_entry_id") ||
    message.includes("is_feed_visible") ||
    message.includes("column") ||
    message.includes("schema")
  );
}

function isMissingAvatarColumn(message: string) {
  return message.includes("avatar_path") || message.includes("column");
}

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

function normalizeVariety(
  variety: EntryPrimaryGrapeRow["grape_varieties"]
): { id: string; name: string } | null {
  if (!variety) {
    return null;
  }
  if (Array.isArray(variety)) {
    return variety[0] ?? null;
  }
  return variety;
}

function dedupeEntries(rows: FeedEntryRow[]) {
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

export async function fetchFeedPage({
  viewerUserId,
  scope,
  cursor,
  limit,
  supabaseClient = supabase,
}: {
  viewerUserId: string;
  scope: FeedScope;
  cursor: string | null;
  limit: number;
  supabaseClient?: MobileSupabaseClient;
}) {
  const socialAudience = await loadSocialAudience(viewerUserId, supabaseClient);
  const socialAuthorIds = socialAudience.socialAuthorIds;

  if (scope === "friends" && socialAuthorIds.length === 0) {
    return {
      entries: [] as MobileFeedEntry[],
      nextCursor: null,
      hasMore: false,
      errorMessage: null as string | null,
    };
  }

  const baseSelectFields =
    "id, user_id, wine_name, producer, vintage, country, region, appellation, notes, consumed_at, rating, qpr_level, tasted_with_user_ids, label_image_path, place_image_path, pairing_image_path, entry_privacy, created_at";
  const extendedSelectFields = `${baseSelectFields}, root_entry_id, is_feed_visible`;
  const fetchLimit = Math.min(160, limit * 5 + 1);

  const buildQuery = ({
    fields,
    withTastingSupport,
  }: {
    fields: string;
    withTastingSupport: boolean;
  }) => {
    let query = supabaseClient.from("wine_entries").select(fields);

    if (scope === "friends") {
      query = query
        .in("user_id", socialAuthorIds)
        .in("entry_privacy", ["public", "friends_of_friends", "friends"])
        .neq("user_id", viewerUserId);
    } else {
      query = query.eq("entry_privacy", "public").neq("user_id", viewerUserId);
    }

    if (withTastingSupport) {
      query = query.eq("is_feed_visible", true);
    }

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    return query.order("created_at", { ascending: false }).limit(fetchLimit);
  };

  let feedRows: FeedEntryRow[] = [];
  let hasSharedTastingColumns = false;

  const firstAttempt = await buildQuery({
    fields: extendedSelectFields,
    withTastingSupport: true,
  });

  if (!firstAttempt.error) {
    feedRows = (firstAttempt.data ?? []) as unknown as FeedEntryRow[];
    hasSharedTastingColumns = true;
  } else if (isMissingSharedTastingColumns(firstAttempt.error.message ?? "")) {
    const fallbackAttempt = await buildQuery({
      fields: baseSelectFields,
      withTastingSupport: false,
    });
    if (fallbackAttempt.error) {
      return {
        entries: [] as MobileFeedEntry[],
        nextCursor: null,
        hasMore: false,
        errorMessage: fallbackAttempt.error.message,
      };
    }
    feedRows = (fallbackAttempt.data ?? []) as unknown as FeedEntryRow[];
  } else {
    return {
      entries: [] as MobileFeedEntry[],
      nextCursor: null,
      hasMore: false,
      errorMessage: firstAttempt.error.message,
    };
  }

  const dedupedRows = hasSharedTastingColumns ? dedupeEntries(feedRows) : feedRows;
  const pageRows =
    dedupedRows.length > limit ? dedupedRows.slice(0, limit) : dedupedRows;
  const hasMore = dedupedRows.length > limit;
  const nextCursor = hasMore
    ? pageRows[pageRows.length - 1]?.created_at ?? null
    : null;

  const entryIds = pageRows.map((entry) => entry.id);
  const userIds = Array.from(
    new Set(
      pageRows.flatMap((entry) => [
        entry.user_id,
        ...(entry.tasted_with_user_ids ?? []),
      ])
    )
  );

  const primaryGrapeMap = new Map<string, PrimaryGrape[]>();
  if (entryIds.length > 0) {
    const { data: primaryRows } = await supabaseClient
      .from("entry_primary_grapes")
      .select("entry_id, position, grape_varieties(id, name)")
      .in("entry_id", entryIds)
      .order("position", { ascending: true });

    (primaryRows ?? []).forEach((row) => {
      const typedRow = row as EntryPrimaryGrapeRow;
      const variety = normalizeVariety(typedRow.grape_varieties);
      if (!variety) {
        return;
      }
      const current = primaryGrapeMap.get(typedRow.entry_id) ?? [];
      current.push({
        id: variety.id,
        name: variety.name,
        position: typedRow.position,
      });
      primaryGrapeMap.set(typedRow.entry_id, current);
    });
  }

  let profileRows: FeedProfileRow[] = [];
  if (userIds.length > 0) {
    const { data, error } = await supabaseClient
      .from("public_profiles")
      .select("id, display_name, email, avatar_path")
      .in("id", userIds);

    if (error && isMissingAvatarColumn(error.message ?? "")) {
      const fallback = await supabaseClient
        .from("public_profiles")
        .select("id, display_name, email")
        .in("id", userIds);
      profileRows = (fallback.data ?? []).map((row) => ({
        ...(row as FeedProfileRow),
        avatar_path: null,
      }));
    } else if (error) {
      return {
        entries: [] as MobileFeedEntry[],
        nextCursor: null,
        hasMore: false,
        errorMessage: error.message,
      };
    } else {
      profileRows = (data ?? []) as FeedProfileRow[];
    }
  }

  const profileMap = new Map(profileRows.map((row) => [row.id, row]));

  const { data: entryPhotoRows } =
    entryIds.length > 0
      ? await supabaseClient
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

  const interactionSettingsByEntryId = new Map<string, InteractionSettingsRow>();
  if (entryIds.length > 0) {
    const selectAttempts = [
      "id, reaction_privacy, comments_privacy, comments_scope",
      "id, comments_scope",
      "id",
    ];
    let loaded = false;

    for (let index = 0; index < selectAttempts.length; index += 1) {
      const { data, error } = await supabaseClient
        .from("wine_entries")
        .select(selectAttempts[index])
        .in("id", entryIds);

      if (!error) {
        (data ?? []).forEach((row) => {
          const typed = row as unknown as InteractionSettingsRow;
          interactionSettingsByEntryId.set(typed.id, typed);
        });
        loaded = true;
        break;
      }

      const missingReactionPrivacy = error.message.includes("reaction_privacy");
      const missingCommentsPrivacy = error.message.includes("comments_privacy");
      const missingCommentsScope = error.message.includes("comments_scope");

      if (
        index === 0 &&
        (missingReactionPrivacy || missingCommentsPrivacy || missingCommentsScope)
      ) {
        continue;
      }
      if (index === 1 && missingCommentsScope) {
        continue;
      }
    }

    if (!loaded) {
      entryIds.forEach((entryId) => {
        interactionSettingsByEntryId.set(entryId, { id: entryId });
      });
    }
  }

  const reactionCountsMap = new Map<string, Record<string, number>>();
  const myReactionsMap = new Map<string, string[]>();
  const reactionUserIdsMap = new Map<string, Record<string, string[]>>();
  const allReactorUserIds = new Set<string>();
  if (entryIds.length > 0) {
    const { data: reactions } = await supabaseClient
      .from("entry_reactions")
      .select("entry_id, user_id, emoji")
      .in("entry_id", entryIds);

    (reactions ?? []).forEach((reaction) => {
      const row = reaction as { entry_id: string; user_id: string; emoji: string };
      const current = reactionCountsMap.get(row.entry_id) ?? {};
      current[row.emoji] = (current[row.emoji] ?? 0) + 1;
      reactionCountsMap.set(row.entry_id, current);

      const emojiUsers = reactionUserIdsMap.get(row.entry_id) ?? {};
      const list = emojiUsers[row.emoji] ?? [];
      if (!list.includes(row.user_id)) {
        list.push(row.user_id);
      }
      emojiUsers[row.emoji] = list;
      reactionUserIdsMap.set(row.entry_id, emojiUsers);
      allReactorUserIds.add(row.user_id);

      if (row.user_id === viewerUserId) {
        const mine = myReactionsMap.get(row.entry_id) ?? [];
        if (!mine.includes(row.emoji)) {
          mine.push(row.emoji);
          myReactionsMap.set(row.entry_id, mine);
        }
      }
    });
  }

  const missingReactorIds = Array.from(allReactorUserIds).filter((id) => !profileMap.has(id));
  if (missingReactorIds.length > 0) {
    const { data: reactorProfiles } = await supabaseClient
      .from("public_profiles")
      .select("id, display_name, email, avatar_path")
      .in("id", missingReactorIds);

    (reactorProfiles ?? []).forEach((row) => {
      const typedRow = row as FeedProfileRow;
      profileMap.set(typedRow.id, typedRow);
    });
  }

  const commentCountsMap = new Map<string, number>();
  if (entryIds.length > 0) {
    const { data: comments } = await supabaseClient
      .from("entry_comments")
      .select("entry_id")
      .in("entry_id", entryIds);

    (comments ?? []).forEach((comment) => {
      const row = comment as { entry_id: string };
      commentCountsMap.set(row.entry_id, (commentCountsMap.get(row.entry_id) ?? 0) + 1);
    });
  }

  const galleryRowsByEntryId = new Map<string, FeedPhotoRow[]>();
  (entryPhotoRows ?? []).forEach((photo) => {
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
      entry_id: photo.entry_id,
      type: photo.type,
      path: photo.path,
      position: photo.position ?? 0,
      created_at: photo.created_at ?? "",
    });
    galleryRowsByEntryId.set(photo.entry_id, current);
  });

  pageRows.forEach((entry) => {
    const current = galleryRowsByEntryId.get(entry.id) ?? [];
    const hasLabel = current.some((photo) => photo.type === "label");
    const hasPlace = current.some((photo) => photo.type === "place");
    const hasPairing = current.some((photo) => photo.type === "pairing");
    const existingPaths = new Set(current.map((photo) => photo.path));

    if (!hasLabel && entry.label_image_path && !existingPaths.has(entry.label_image_path)) {
      current.push({
        entry_id: entry.id,
        type: "label",
        path: entry.label_image_path,
        position: 0,
        created_at: entry.created_at,
      });
      existingPaths.add(entry.label_image_path);
    }
    if (!hasPlace && entry.place_image_path && !existingPaths.has(entry.place_image_path)) {
      current.push({
        entry_id: entry.id,
        type: "place",
        path: entry.place_image_path,
        position: 0,
        created_at: entry.created_at,
      });
      existingPaths.add(entry.place_image_path);
    }
    if (
      !hasPairing &&
      entry.pairing_image_path &&
      !existingPaths.has(entry.pairing_image_path)
    ) {
      current.push({
        entry_id: entry.id,
        type: "pairing",
        path: entry.pairing_image_path,
        position: 0,
        created_at: entry.created_at,
      });
      existingPaths.add(entry.pairing_image_path);
    }

    current.sort((left, right) => {
      const posDiff = left.position - right.position;
      if (posDiff !== 0) return posDiff;
      const createdDiff = left.created_at.localeCompare(right.created_at);
      if (createdDiff !== 0) return createdDiff;
      return TYPE_ORDER[left.type] - TYPE_ORDER[right.type];
    });
    galleryRowsByEntryId.set(entry.id, current);
  });

  const pathsToSign = new Set<string>();
  pageRows.forEach((entry) => {
    const avatarPath = profileMap.get(entry.user_id)?.avatar_path ?? null;
    if (avatarPath) {
      pathsToSign.add(avatarPath);
    }
    (galleryRowsByEntryId.get(entry.id) ?? []).forEach((photo) => {
      pathsToSign.add(photo.path);
    });
  });
  const signedUrlByPath = await signPhotoUrls(Array.from(pathsToSign), {
    supabaseClient,
  });

  const entries: MobileFeedEntry[] = pageRows.map((entry) => {
    const authorProfile = profileMap.get(entry.user_id);
    const avatarPath = authorProfile?.avatar_path ?? null;
    const galleryRows = galleryRowsByEntryId.get(entry.id) ?? [];
    const photoGallery = galleryRows
      .map((row) => {
        const url = signedUrlByPath.get(row.path) ?? null;
        if (!url) {
          return null;
        }
        return { type: row.type, url };
      })
      .filter((photo): photo is FeedPhoto => photo !== null);

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
      viewerUserId,
      ownerUserId: entry.user_id,
      privacy: reactionPrivacy,
      acceptedFriendIds: socialAudience.acceptedFriendIds,
      friendsOfFriendsIds: socialAudience.friendsOfFriendsIds,
    });
    const canSeeComments = canViewerAccessByPrivacy({
      viewerUserId,
      ownerUserId: entry.user_id,
      privacy: commentsPrivacy,
      acceptedFriendIds: socialAudience.acceptedFriendIds,
      friendsOfFriendsIds: socialAudience.friendsOfFriendsIds,
    });
    const rawReactionUsers = canSeeReactions
      ? reactionUserIdsMap.get(entry.id) ?? {}
      : {};
    const reactionUsers: Record<string, string[]> = {};
    Object.entries(rawReactionUsers).forEach(([emoji, ids]) => {
      reactionUsers[emoji] = ids.map((id) => getPublicProfileName(profileMap.get(id)));
    });
    const tastedWithUsers = (entry.tasted_with_user_ids ?? []).map((id) => ({
      id,
      display_name: getPublicProfileName(profileMap.get(id)),
      email: null,
    }));

    return {
      ...entry,
      author_name: getPublicProfileName(authorProfile),
      author_avatar_url: avatarPath ? signedUrlByPath.get(avatarPath) ?? null : null,
      primary_grapes: primaryGrapeMap.get(entry.id) ?? [],
      photo_gallery: photoGallery,
      tasted_with_users: tastedWithUsers,
      can_react: canSeeReactions,
      can_comment: canSeeComments,
      comments_privacy: commentsPrivacy,
      my_reactions: canSeeReactions ? myReactionsMap.get(entry.id) ?? [] : [],
      reaction_counts: canSeeReactions ? reactionCountsMap.get(entry.id) ?? {} : {},
      reaction_users: reactionUsers,
      comment_count: canSeeComments ? commentCountsMap.get(entry.id) ?? 0 : 0,
    };
  });

  const entriesWithPhotos = entries.filter(
    (entry) => (entry.photo_gallery?.length ?? 0) > 0
  );

  return {
    entries: entriesWithPhotos,
    nextCursor,
    hasMore,
    errorMessage: null as string | null,
  };
}
