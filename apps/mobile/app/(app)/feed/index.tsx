import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppTopBar } from "@/src/components/AppTopBar";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";

type FeedScope = "public" | "friends";
type EntryPrivacy = "public" | "friends_of_friends" | "friends" | "private";
type QprLevel = "extortion" | "pricey" | "mid" | "good_value" | "absolute_steal";
type FeedPhotoType =
  | "label"
  | "place"
  | "people"
  | "pairing"
  | "lineup"
  | "other_bottles";

type FeedEntryRow = {
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

type PrimaryGrape = {
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

type FeedPhoto = {
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

type MobileFeedEntry = FeedEntryRow & {
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
  comment_count: number;
};

type FeedReply = {
  id: string;
  entry_id: string;
  user_id: string;
  parent_comment_id: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
  is_deleted?: boolean;
};

type FeedComment = {
  id: string;
  entry_id: string;
  user_id: string;
  parent_comment_id: null;
  author_name: string | null;
  body: string;
  created_at: string;
  is_deleted?: boolean;
  replies: FeedReply[];
};

const PAGE_SIZE = 24;
const REACTION_EMOJIS = ["🍷", "🔥", "❤️", "👀", "🤝"] as const;
const PHOTO_TYPE_LABELS: Record<FeedPhotoType, string> = {
  label: "Label",
  place: "Place",
  people: "People",
  pairing: "Pairing",
  lineup: "Lineup",
  other_bottles: "Other bottle",
};

const TYPE_ORDER: Record<FeedPhotoType, number> = {
  place: 0,
  people: 1,
  label: 2,
  lineup: 3,
  other_bottles: 4,
  pairing: 5,
};

const QPR_LEVEL_LABELS: Record<QprLevel, string> = {
  extortion: "Extortion",
  pricey: "Pricey",
  mid: "Spot on",
  good_value: "Good Value",
  absolute_steal: "Absolute Steal",
};

type InteractionSettingsRow = {
  id: string;
  reaction_privacy?: string | null;
  comments_privacy?: string | null;
  comments_scope?: string | null;
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

function formatConsumedDate(raw: string) {
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCommentDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

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

function normalizeMetaValue(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function toWordSet(value: string | null | undefined): Set<string> {
  const normalized = value?.toLowerCase() ?? "";
  const words = normalized.match(/[a-z0-9]+/g) ?? [];
  return new Set(words.filter((word) => word.length >= 2));
}

function shouldHideProducerInEntryTile(
  wineName: string | null | undefined,
  producer: string | null | undefined
) {
  const wineWords = toWordSet(wineName);
  const producerWords = toWordSet(producer);

  if (wineWords.size === 0 || producerWords.size === 0) {
    return false;
  }

  let sharedWordCount = 0;
  for (const word of producerWords) {
    if (!wineWords.has(word)) {
      continue;
    }
    sharedWordCount += 1;
    if (sharedWordCount >= 3) {
      return true;
    }
  }

  return false;
}

function getPrimaryVarietal(entry: MobileFeedEntry) {
  const grapes = Array.isArray(entry.primary_grapes) ? entry.primary_grapes : [];
  if (grapes.length === 0) {
    return null;
  }
  const sorted = [...grapes].sort((a, b) => a.position - b.position);
  for (const grape of sorted) {
    const value = normalizeMetaValue(grape.name);
    if (value) {
      return value;
    }
  }
  return null;
}

function buildEntryMetaFields(entry: MobileFeedEntry) {
  const wineName = normalizeMetaValue(entry.wine_name) ?? "";
  const producer = normalizeMetaValue(entry.producer);
  const vintage = normalizeMetaValue(entry.vintage);
  const region = normalizeMetaValue(entry.region);
  const country = normalizeMetaValue(entry.country);
  const appellation = normalizeMetaValue(entry.appellation);
  const varietal = getPrimaryVarietal(entry);

  const hideProducer = shouldHideProducerInEntryTile(wineName, producer);
  const nonVintagePriority = [
    hideProducer ? null : producer,
    region,
    country,
    appellation,
    varietal,
  ];

  const fields: string[] = [];
  const firstField = nonVintagePriority.find((value): value is string => Boolean(value));
  if (firstField) {
    fields.push(firstField);
  }

  if (vintage && fields.length > 0) {
    fields.push(vintage);
  }

  if (fields.length < 2) {
    for (const value of nonVintagePriority) {
      if (!value || fields.includes(value)) {
        continue;
      }
      fields.push(value);
      if (fields.length >= 2) {
        break;
      }
    }
  }

  return fields.slice(0, 2);
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

function getDisplayRating(rating: number | null): string | null {
  if (typeof rating !== "number" || Number.isNaN(rating)) {
    return null;
  }
  const normalized = Math.max(0, Math.min(100, Math.round(rating)));
  return `${normalized}/100`;
}

async function createSignedUrlMap(paths: string[]) {
  const signedUrlByPath = new Map<string, string | null>();
  await Promise.all(
    paths.map(async (path) => {
      const { data: signedUrl, error } = await supabase.storage
        .from("wine-photos")
        .createSignedUrl(path, 60 * 60);
      signedUrlByPath.set(path, error ? null : signedUrl.signedUrl);
    })
  );
  return signedUrlByPath;
}

type FriendRequestPair = {
  requester_id: string;
  recipient_id: string;
};

type SocialAudience = {
  socialAuthorIds: string[];
  acceptedFriendIds: Set<string>;
  friendsOfFriendsIds: Set<string>;
};

async function loadSocialAudience(viewerUserId: string): Promise<SocialAudience> {
  const { data, error } = await supabase
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

  // Best-effort friends-of-friends expansion. RLS can block this depending on policy.
  const [
    { data: foafRequesterRows, error: foafRequesterError },
    { data: foafRecipientRows, error: foafRecipientError },
  ] = await Promise.all([
    supabase
      .from("friend_requests")
      .select("requester_id, recipient_id")
      .eq("status", "accepted")
      .in("requester_id", directList),
    supabase
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

async function fetchFeedPage({
  viewerUserId,
  scope,
  cursor,
  limit,
}: {
  viewerUserId: string;
  scope: FeedScope;
  cursor: string | null;
  limit: number;
}) {
  const socialAudience = await loadSocialAudience(viewerUserId);
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
    let query = supabase.from("wine_entries").select(fields);

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
    const { data: primaryRows } = await supabase
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
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, email, avatar_path")
      .in("id", userIds);

    if (error && isMissingAvatarColumn(error.message ?? "")) {
      const fallback = await supabase
        .from("profiles")
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
  if (entryIds.length > 0) {
    const { data: reactions } = await supabase
      .from("entry_reactions")
      .select("entry_id, user_id, emoji")
      .in("entry_id", entryIds);

    (reactions ?? []).forEach((reaction) => {
      const row = reaction as { entry_id: string; user_id: string; emoji: string };
      const current = reactionCountsMap.get(row.entry_id) ?? {};
      current[row.emoji] = (current[row.emoji] ?? 0) + 1;
      reactionCountsMap.set(row.entry_id, current);

      if (row.user_id === viewerUserId) {
        const mine = myReactionsMap.get(row.entry_id) ?? [];
        if (!mine.includes(row.emoji)) {
          mine.push(row.emoji);
          myReactionsMap.set(row.entry_id, mine);
        }
      }
    });
  }

  const commentCountsMap = new Map<string, number>();
  if (entryIds.length > 0) {
    const { data: comments } = await supabase
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

    if (!hasLabel && entry.label_image_path) {
      current.push({
        entry_id: entry.id,
        type: "label",
        path: entry.label_image_path,
        position: 0,
        created_at: entry.created_at,
      });
    }
    if (!hasPlace && entry.place_image_path) {
      current.push({
        entry_id: entry.id,
        type: "place",
        path: entry.place_image_path,
        position: 0,
        created_at: entry.created_at,
      });
    }
    if (!hasPairing && entry.pairing_image_path) {
      current.push({
        entry_id: entry.id,
        type: "pairing",
        path: entry.pairing_image_path,
        position: 0,
        created_at: entry.created_at,
      });
    }

    current.sort((left, right) => {
      const typeDiff = TYPE_ORDER[left.type] - TYPE_ORDER[right.type];
      if (typeDiff !== 0) return typeDiff;
      const posDiff = left.position - right.position;
      if (posDiff !== 0) return posDiff;
      return left.created_at.localeCompare(right.created_at);
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
  const signedUrlByPath = await createSignedUrlMap(Array.from(pathsToSign));

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
    const tastedWithUsers = (entry.tasted_with_user_ids ?? []).map((id) => ({
      id,
      display_name: profileMap.get(id)?.display_name ?? null,
      email: profileMap.get(id)?.email ?? null,
    }));

    return {
      ...entry,
      author_name:
        authorProfile?.display_name ?? authorProfile?.email ?? "Unknown",
      author_avatar_url: avatarPath ? signedUrlByPath.get(avatarPath) ?? null : null,
      primary_grapes: primaryGrapeMap.get(entry.id) ?? [],
      photo_gallery: photoGallery,
      tasted_with_users: tastedWithUsers,
      can_react: canSeeReactions,
      can_comment: canSeeComments,
      comments_privacy: commentsPrivacy,
      my_reactions: canSeeReactions ? myReactionsMap.get(entry.id) ?? [] : [],
      reaction_counts: canSeeReactions ? reactionCountsMap.get(entry.id) ?? {} : {},
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

function FeedCard({
  item,
  notesExpanded,
  onToggleNotes,
  commentsExpanded,
  onToggleComments,
  onGallerySwipeStart,
  onGallerySwipeEnd,
  replyTargetName,
  onSetReplyTarget,
  onClearReplyTarget,
  commentCount,
  comments,
  commentsLoading,
  commentDraft,
  onChangeCommentDraft,
  onSubmitComment,
  postingComment,
  commentError,
  reactionPickerOpen,
  onToggleReactionPicker,
  onToggleReaction,
}: {
  item: MobileFeedEntry;
  notesExpanded: boolean;
  onToggleNotes: () => void;
  commentsExpanded: boolean;
  onToggleComments: () => void;
  onGallerySwipeStart: () => void;
  onGallerySwipeEnd: () => void;
  replyTargetName: string | null;
  onSetReplyTarget: (commentId: string) => void;
  onClearReplyTarget: () => void;
  commentCount: number;
  comments: FeedComment[];
  commentsLoading: boolean;
  commentDraft: string;
  onChangeCommentDraft: (value: string) => void;
  onSubmitComment: () => void;
  postingComment: boolean;
  commentError: string | null;
  reactionPickerOpen: boolean;
  onToggleReactionPicker: () => void;
  onToggleReaction: (emoji: string) => void;
}) {
  const metaFields = useMemo(() => buildEntryMetaFields(item), [item]);
  const displayRating = getDisplayRating(item.rating);
  const galleryPhotos = item.photo_gallery ?? [];
  const notes = (item.notes ?? "").trim();
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [photoFrameWidth, setPhotoFrameWidth] = useState(0);
  const [isNotesTruncated, setIsNotesTruncated] = useState(false);
  const photoTranslateX = useRef(new Animated.Value(0)).current;
  const swipeActiveRef = useRef(false);
  const reactions = useMemo(
    () =>
      Object.entries(item.reaction_counts)
        .filter(([, count]) => count > 0)
        .sort((left, right) => right[1] - left[1]),
    [item.reaction_counts]
  );
  const visibleReactions = reactions.slice(0, 3);
  const hiddenReactionCount = Math.max(0, reactions.length - visibleReactions.length);
  const hasMultiplePhotos = galleryPhotos.length > 1;
  const showCommentsControl = item.can_comment;
  const activePhoto =
    galleryPhotos[Math.max(0, Math.min(galleryPhotos.length - 1, activePhotoIndex))] ?? null;
  const canToggleNotes = notesExpanded || isNotesTruncated;

  useEffect(() => {
    setActivePhotoIndex(0);
    photoTranslateX.stopAnimation();
    photoTranslateX.setValue(0);
  }, [item.id, photoTranslateX]);

  const beginGallerySwipe = useCallback(() => {
    if (swipeActiveRef.current) {
      return;
    }
    swipeActiveRef.current = true;
    onGallerySwipeStart();
  }, [onGallerySwipeStart]);

  const endGallerySwipe = useCallback(() => {
    if (!swipeActiveRef.current) {
      return;
    }
    swipeActiveRef.current = false;
    onGallerySwipeEnd();
  }, [onGallerySwipeEnd]);

  useEffect(
    () => () => {
      endGallerySwipe();
    },
    [endGallerySwipe]
  );

  useEffect(() => {
    setIsNotesTruncated(false);
  }, [item.id, notes]);

  useEffect(() => {
    if (photoFrameWidth <= 0) {
      return;
    }
    photoTranslateX.stopAnimation();
    photoTranslateX.setValue(-activePhotoIndex * photoFrameWidth);
  }, [activePhotoIndex, photoFrameWidth, photoTranslateX]);

  useEffect(() => {
    const maxIndex = Math.max(0, galleryPhotos.length - 1);
    if (activePhotoIndex <= maxIndex) {
      return;
    }
    setActivePhotoIndex(maxIndex);
  }, [activePhotoIndex, galleryPhotos.length]);

  useEffect(() => {
    if (galleryPhotos.length <= 1) {
      return;
    }
    galleryPhotos.forEach((photo) => {
      void Image.prefetch(photo.url);
    });
  }, [item.id, galleryPhotos]);

  const animateToPhotoIndex = useCallback(
    (nextIndex: number) => {
      const maxIndex = Math.max(0, galleryPhotos.length - 1);
      const clampedIndex = Math.max(0, Math.min(maxIndex, nextIndex));
      setActivePhotoIndex(clampedIndex);
      if (photoFrameWidth <= 0) {
        return;
      }
      Animated.spring(photoTranslateX, {
        toValue: -clampedIndex * photoFrameWidth,
        useNativeDriver: true,
        bounciness: 0,
        speed: 20,
      }).start();
    },
    [galleryPhotos.length, photoFrameWidth, photoTranslateX]
  );

  const photoSwipeResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          hasMultiplePhotos &&
          photoFrameWidth > 0 &&
          Math.abs(gestureState.dx) > 8 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onMoveShouldSetPanResponderCapture: (_, gestureState) =>
          hasMultiplePhotos &&
          photoFrameWidth > 0 &&
          Math.abs(gestureState.dx) > 8 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderGrant: () => {
          beginGallerySwipe();
          photoTranslateX.stopAnimation();
        },
        onPanResponderMove: (_, gestureState) => {
          if (!hasMultiplePhotos || photoFrameWidth <= 0) {
            return;
          }
          const baseOffset = -activePhotoIndex * photoFrameWidth;
          const minOffset = -(galleryPhotos.length - 1) * photoFrameWidth;
          let nextOffset = baseOffset + gestureState.dx;
          if (nextOffset > 0) {
            nextOffset = nextOffset * 0.32;
          } else if (nextOffset < minOffset) {
            nextOffset = minOffset + (nextOffset - minOffset) * 0.32;
          }
          photoTranslateX.setValue(nextOffset);
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_, gestureState) => {
          if (
            !hasMultiplePhotos ||
            photoFrameWidth <= 0 ||
            Math.abs(gestureState.dx) <= Math.abs(gestureState.dy)
          ) {
            animateToPhotoIndex(activePhotoIndex);
            endGallerySwipe();
            return;
          }
          const threshold = Math.max(28, Math.min(120, photoFrameWidth * 0.2));
          if (gestureState.dx <= -threshold) {
            animateToPhotoIndex(activePhotoIndex + 1);
          } else if (gestureState.dx >= threshold) {
            animateToPhotoIndex(activePhotoIndex - 1);
          } else {
            animateToPhotoIndex(activePhotoIndex);
          }
          endGallerySwipe();
        },
        onPanResponderTerminate: () => {
          animateToPhotoIndex(activePhotoIndex);
          endGallerySwipe();
        },
      }),
    [
      activePhotoIndex,
      animateToPhotoIndex,
      beginGallerySwipe,
      endGallerySwipe,
      galleryPhotos.length,
      hasMultiplePhotos,
      photoFrameWidth,
      photoTranslateX,
    ]
  );

  return (
    <View style={styles.feedCard}>
      <View style={styles.feedAuthorRow}>
        <View style={styles.feedAuthorStack}>
          <View style={styles.feedAvatar}>
            {item.author_avatar_url ? (
              <Image
                source={{ uri: item.author_avatar_url }}
                style={styles.feedAvatarImage}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.feedAvatarFallback}>
                {(item.author_name || "?")[0]?.toUpperCase() ?? "?"}
              </Text>
            )}
          </View>
          <Text style={styles.feedAuthorName}>{item.author_name}</Text>
        </View>
        <Text style={styles.feedDate}>{formatConsumedDate(item.consumed_at)}</Text>
      </View>

      <View
        style={styles.feedPhotoFrame}
        onLayout={(event) => {
          const nextWidth = Math.round(event.nativeEvent.layout.width);
          if (nextWidth > 0 && nextWidth !== photoFrameWidth) {
            setPhotoFrameWidth(nextWidth);
          }
        }}
        {...photoSwipeResponder.panHandlers}
      >
        {activePhoto ? (
          <>
            {hasMultiplePhotos && photoFrameWidth > 0 ? (
              <Animated.View
                style={[
                  styles.feedPhotoTrack,
                  {
                    width: photoFrameWidth * galleryPhotos.length,
                    transform: [{ translateX: photoTranslateX }],
                  },
                ]}
                pointerEvents="none"
              >
                {galleryPhotos.map((photo, photoIndex) => (
                  <Image
                    key={`${item.id}-${photo.type}-${photo.url}-${photoIndex}`}
                    source={{ uri: photo.url }}
                    style={[styles.feedPhotoTrackSlide, { width: photoFrameWidth }]}
                    resizeMode="cover"
                    fadeDuration={0}
                  />
                ))}
              </Animated.View>
            ) : (
              <Image
                source={{ uri: activePhoto.url }}
                style={styles.feedPhotoStatic}
                resizeMode="cover"
                fadeDuration={0}
              />
            )}
            <View style={styles.photoTypeChip}>
              <Text style={styles.photoTypeChipText}>
                {PHOTO_TYPE_LABELS[activePhoto.type]}
              </Text>
            </View>
            {hasMultiplePhotos ? (
              <View style={styles.photoDotRow}>
                {galleryPhotos.map((_, dotIndex) => (
                  <Pressable
                    key={`${item.id}-dot-${dotIndex}`}
                    onPress={() => animateToPhotoIndex(dotIndex)}
                    hitSlop={6}
                    style={[
                      styles.photoDot,
                      dotIndex === activePhotoIndex ? styles.photoDotActive : null,
                    ]}
                  />
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.feedPhotoFallback}>
            <Text style={styles.feedPhotoFallbackText}>No photo</Text>
          </View>
        )}
      </View>

      <View style={styles.feedTextStack}>
        {item.wine_name ? <Text style={styles.feedWineName}>{item.wine_name}</Text> : null}
        {metaFields.length > 0 ? (
          <Text style={styles.feedMetaText}>{metaFields.join(" · ")}</Text>
        ) : null}
        {item.tasted_with_users.length > 0 ? (
          <Text style={styles.feedTastedWithText}>
            Tasted with:{" "}
            {item.tasted_with_users
              .map((user) => user.display_name ?? user.email ?? "Unknown")
              .join(", ")}
          </Text>
        ) : null}
      </View>

      {notes ? (
        <Pressable
          style={styles.notesWrap}
          onPress={onToggleNotes}
          disabled={!canToggleNotes}
        >
          <Text
            style={styles.notesText}
            numberOfLines={notesExpanded ? undefined : 2}
            onTextLayout={(event) => {
              if (notesExpanded) {
                return;
              }
              const nextTruncated = event.nativeEvent.lines.length > 2;
              if (nextTruncated !== isNotesTruncated) {
                setIsNotesTruncated(nextTruncated);
              }
            }}
          >
            {notes}
          </Text>
          {canToggleNotes ? (
            <Text style={styles.notesToggleText}>
              {notesExpanded ? "Show less" : "Read more"}
            </Text>
          ) : null}
        </Pressable>
      ) : null}

      <View style={styles.feedValueRow}>
        {displayRating ? <Text style={styles.feedRating}>{displayRating}</Text> : null}
        {item.qpr_level ? (
          <Text style={[styles.feedQprTag, styles[`qpr_${item.qpr_level}` as keyof typeof styles]]}>
            {QPR_LEVEL_LABELS[item.qpr_level]}
          </Text>
        ) : null}
      </View>

      <View style={styles.feedDivider} />

      <View style={styles.feedInteractionRow}>
        <View>
          {showCommentsControl ? (
            <Pressable
              onPress={onToggleComments}
              style={[
                styles.commentsButton,
                commentsExpanded ? styles.commentsButtonActive : null,
              ]}
            >
              <Text
                style={[
                  styles.commentsButtonText,
                  commentsExpanded ? styles.commentsButtonTextActive : null,
                ]}
              >
                Comments
              </Text>
              <Text style={styles.commentsButtonCount}>{commentCount}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.reactionRight}>
          <View style={styles.reactionPills}>
            {visibleReactions.map(([emoji, count]) => (
              <View key={`${item.id}-${emoji}`} style={styles.reactionPill}>
                <Text style={styles.reactionPillText}>
                  {emoji} {count}
                </Text>
              </View>
            ))}
            {hiddenReactionCount > 0 ? (
              <View style={styles.reactionPill}>
                <Text style={styles.reactionPillText}>+{hiddenReactionCount}</Text>
              </View>
            ) : null}
          </View>
          <Pressable
            onPress={onToggleReactionPicker}
            style={[
              styles.reactionAddButton,
              item.can_react ? null : styles.reactionAddButtonDisabled,
            ]}
          >
            <View style={styles.plusIcon}>
              <View
                style={[
                  styles.plusLineHorizontal,
                  item.can_react ? null : styles.plusLineDisabled,
                ]}
              />
              <View
                style={[
                  styles.plusLineVertical,
                  item.can_react ? null : styles.plusLineDisabled,
                ]}
              />
            </View>
          </Pressable>
        </View>
      </View>

      {reactionPickerOpen ? (
        <View style={styles.reactionPickerCard}>
          <View style={styles.reactionPickerRow}>
            {REACTION_EMOJIS.map((emoji) => {
              const selected = item.my_reactions.includes(emoji);
              return (
                <Pressable
                  key={`${item.id}-${emoji}`}
                  disabled={!item.can_react}
                  onPress={() => onToggleReaction(emoji)}
                  style={[
                    styles.reactionEmojiBtn,
                    selected ? styles.reactionEmojiBtnActive : null,
                    !item.can_react ? styles.reactionEmojiBtnDisabled : null,
                  ]}
                >
                  <Text style={styles.reactionEmojiText}>{emoji}</Text>
                </Pressable>
              );
            })}
          </View>
          {!item.can_react ? (
            <Text style={styles.reactionPrivateText}>
              Reactions are not available for this post.
            </Text>
          ) : null}
        </View>
      ) : null}

      {commentsExpanded ? (
        <View style={styles.commentsPanel}>
          {commentsLoading ? (
            <Text style={styles.commentsEmptyText}>Loading comments...</Text>
          ) : comments.length === 0 ? (
            <Text style={styles.commentsEmptyText}>No comments yet. Start the thread.</Text>
          ) : (
            <View style={styles.commentList}>
              {comments.map((comment) => (
                <View key={comment.id} style={styles.commentRow}>
                  <View style={styles.commentHeader}>
                    <Text style={styles.commentAuthor}>
                      {comment.author_name ?? "Unknown"}
                    </Text>
                    <Text style={styles.commentDate}>
                      {formatCommentDate(comment.created_at)}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.commentBody,
                      comment.is_deleted ? styles.commentBodyDeleted : null,
                    ]}
                  >
                    {comment.is_deleted ? "[deleted]" : comment.body}
                  </Text>
                  {!comment.is_deleted && showCommentsControl ? (
                    <Pressable
                      onPress={() => onSetReplyTarget(comment.id)}
                      style={styles.replyActionButton}
                    >
                      <Text style={styles.replyActionText}>Reply</Text>
                    </Pressable>
                  ) : null}
                  {comment.replies.length > 0 ? (
                    <View style={styles.replyList}>
                      {comment.replies.map((reply) => (
                        <View key={reply.id} style={styles.replyRow}>
                          <View style={styles.commentHeader}>
                            <Text style={styles.commentAuthor}>
                              {reply.author_name ?? "Unknown"}
                            </Text>
                            <Text style={styles.commentDate}>
                              {formatCommentDate(reply.created_at)}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.commentBody,
                              reply.is_deleted ? styles.commentBodyDeleted : null,
                            ]}
                          >
                            {reply.is_deleted ? "[deleted]" : reply.body}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          )}
          {showCommentsControl ? (
            <View style={styles.commentComposer}>
              {replyTargetName ? (
                <View style={styles.replyTargetRow}>
                  <Text style={styles.replyTargetText}>Replying to {replyTargetName}</Text>
                  <Pressable onPress={onClearReplyTarget}>
                    <Text style={styles.replyTargetCancel}>Cancel</Text>
                  </Pressable>
                </View>
              ) : null}
              <TextInput
                value={commentDraft}
                onChangeText={onChangeCommentDraft}
                placeholder={replyTargetName ? "Write a reply..." : "Write a comment..."}
                placeholderTextColor="#71717a"
                style={styles.commentInput}
                multiline
              />
              <Pressable
                onPress={onSubmitComment}
                disabled={!commentDraft.trim() || postingComment}
                style={[
                  styles.commentSubmitButton,
                  !commentDraft.trim() || postingComment
                    ? styles.commentSubmitButtonDisabled
                    : null,
                ]}
              >
                <Text style={styles.commentSubmitButtonText}>
                  {postingComment ? "Posting..." : replyTargetName ? "Post reply" : "Post"}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {commentError ? <Text style={styles.commentErrorText}>{commentError}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function countComments(comments: FeedComment[] | undefined, fallback: number) {
  if (!comments) {
    return fallback;
  }
  return comments.reduce((total, comment) => total + 1 + comment.replies.length, 0);
}

export default function FeedScreen() {
  const { user } = useAuth();
  const [feedScope, setFeedScope] = useState<FeedScope>("public");
  const [entries, setEntries] = useState<MobileFeedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [expandedNotesByEntryId, setExpandedNotesByEntryId] = useState<
    Record<string, boolean>
  >({});
  const [reactionPopupEntryId, setReactionPopupEntryId] = useState<string | null>(
    null
  );
  const [expandedCommentsByEntryId, setExpandedCommentsByEntryId] = useState<
    Record<string, boolean>
  >({});
  const [commentsByEntryId, setCommentsByEntryId] = useState<
    Record<string, FeedComment[]>
  >({});
  const [commentDraftByEntryId, setCommentDraftByEntryId] = useState<
    Record<string, string>
  >({});
  const [isGallerySwipeActive, setIsGallerySwipeActive] = useState(false);
  const [replyTargetByEntryId, setReplyTargetByEntryId] = useState<
    Record<string, string | null>
  >({});
  const [loadingCommentsByEntryId, setLoadingCommentsByEntryId] = useState<
    Record<string, boolean>
  >({});
  const [postingCommentByEntryId, setPostingCommentByEntryId] = useState<
    Record<string, boolean>
  >({});
  const [commentErrorByEntryId, setCommentErrorByEntryId] = useState<
    Record<string, string | null>
  >({});

  const loadCommentsForEntry = useCallback(
    async (entryId: string, options?: { force?: boolean }) => {
      if (!user?.id) {
        return;
      }
      if (loadingCommentsByEntryId[entryId]) {
        return;
      }
      if (!options?.force && commentsByEntryId[entryId]) {
        return;
      }

      setLoadingCommentsByEntryId((current) => ({
        ...current,
        [entryId]: true,
      }));
      setCommentErrorByEntryId((current) => ({
        ...current,
        [entryId]: null,
      }));

      try {
        const withDeletedAt = await supabase
          .from("entry_comments")
          .select("id, entry_id, user_id, parent_comment_id, body, created_at, deleted_at")
          .eq("entry_id", entryId)
          .order("created_at", { ascending: true });

        let rows: Array<{
          id: string;
          entry_id: string;
          user_id: string;
          parent_comment_id: string | null;
          body: string;
          created_at: string;
          deleted_at?: string | null;
        }> = [];

        if (!withDeletedAt.error) {
          rows = (withDeletedAt.data ?? []) as typeof rows;
        } else if (withDeletedAt.error.message.includes("deleted_at")) {
          const fallback = await supabase
            .from("entry_comments")
            .select("id, entry_id, user_id, parent_comment_id, body, created_at")
            .eq("entry_id", entryId)
            .order("created_at", { ascending: true });
          if (fallback.error) {
            setCommentErrorByEntryId((current) => ({
              ...current,
              [entryId]: fallback.error.message,
            }));
            return;
          }
          rows = ((fallback.data ?? []) as Omit<(typeof rows)[number], "deleted_at">[]).map(
            (row) => ({ ...row, deleted_at: null })
          );
        } else {
          setCommentErrorByEntryId((current) => ({
            ...current,
            [entryId]: withDeletedAt.error.message,
          }));
          return;
        }

        const authorIds = Array.from(new Set(rows.map((row) => row.user_id)));
        const authorNameById = new Map<string, string>();
        if (authorIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, display_name, email")
            .in("id", authorIds);
          (profiles ?? []).forEach((profile) => {
            authorNameById.set(
              profile.id,
              profile.display_name ?? profile.email ?? "Unknown"
            );
          });
        }

        const topLevelRows = rows.filter((row) => row.parent_comment_id === null);
        const repliesByParentId = new Map<string, typeof rows>();
        rows
          .filter((row) => row.parent_comment_id !== null)
          .forEach((reply) => {
            const parentId = reply.parent_comment_id as string;
            const list = repliesByParentId.get(parentId) ?? [];
            list.push(reply);
            repliesByParentId.set(parentId, list);
          });

        const serializeComment = (
          row: (typeof rows)[number]
        ): Omit<FeedReply, "parent_comment_id"> & { parent_comment_id: string | null } => {
          const isDeleted = Boolean(row.deleted_at) || row.body.trim() === "[deleted]";
          return {
            id: row.id,
            entry_id: row.entry_id,
            user_id: row.user_id,
            parent_comment_id: row.parent_comment_id,
            body: isDeleted ? "[deleted]" : row.body,
            created_at: row.created_at,
            author_name: isDeleted ? null : authorNameById.get(row.user_id) ?? "Unknown",
            is_deleted: isDeleted,
          };
        };

        const comments = topLevelRows.map((row) => {
          const serialized = serializeComment(row);
          const replies = (repliesByParentId.get(row.id) ?? []).map((reply) => {
            const replySerialized = serializeComment(reply);
            return {
              ...replySerialized,
              parent_comment_id: replySerialized.parent_comment_id,
            } as FeedReply;
          });

          return {
            ...serialized,
            parent_comment_id: null,
            replies,
          } as FeedComment;
        });

        setCommentsByEntryId((current) => ({
          ...current,
          [entryId]: comments,
        }));
        setEntries((current) =>
          current.map((entry) =>
            entry.id === entryId
              ? {
                  ...entry,
                  comment_count: countComments(comments, entry.comment_count),
                }
              : entry
          )
        );
      } finally {
        setLoadingCommentsByEntryId((current) => ({
          ...current,
          [entryId]: false,
        }));
      }
    },
    [commentsByEntryId, loadingCommentsByEntryId, user?.id]
  );

  const toggleCommentsExpanded = (entryId: string) => {
    setReactionPopupEntryId(null);
    setExpandedCommentsByEntryId((current) => {
      const nextExpanded = !current[entryId];
      if (nextExpanded) {
        void loadCommentsForEntry(entryId);
      }
      return {
        ...current,
        [entryId]: nextExpanded,
      };
    });
  };

  const submitCommentForEntry = async (entryId: string) => {
    if (!user?.id) {
      return;
    }
    const body = (commentDraftByEntryId[entryId] ?? "").trim();
    const replyTargetId = replyTargetByEntryId[entryId] ?? null;
    const canComment = entries.find((entry) => entry.id === entryId)?.can_comment ?? false;
    if (!body) {
      return;
    }
    if (!canComment) {
      setCommentErrorByEntryId((current) => ({
        ...current,
        [entryId]: null,
      }));
      return;
    }
    if (postingCommentByEntryId[entryId]) {
      return;
    }

    setPostingCommentByEntryId((current) => ({
      ...current,
      [entryId]: true,
    }));
    setCommentErrorByEntryId((current) => ({
      ...current,
      [entryId]: null,
    }));

    const { error } = await supabase.from("entry_comments").insert({
      entry_id: entryId,
      user_id: user.id,
      body,
      parent_comment_id: replyTargetId,
    });

    if (error) {
      setCommentErrorByEntryId((current) => ({
        ...current,
        [entryId]: error.message,
      }));
      setPostingCommentByEntryId((current) => ({
        ...current,
        [entryId]: false,
      }));
      return;
    }

    setCommentDraftByEntryId((current) => ({
      ...current,
      [entryId]: "",
    }));
    setReplyTargetByEntryId((current) => ({
      ...current,
      [entryId]: null,
    }));
    await loadCommentsForEntry(entryId, { force: true });

    setPostingCommentByEntryId((current) => ({
      ...current,
      [entryId]: false,
    }));
  };

  const toggleReaction = async (entryId: string, emoji: string) => {
    if (!user?.id) {
      return;
    }
    const target = entries.find((entry) => entry.id === entryId);
    if (!target) {
      return;
    }

    const hasMine = target.my_reactions.includes(emoji);
    if (hasMine) {
      const { error } = await supabase
        .from("entry_reactions")
        .delete()
        .eq("entry_id", entryId)
        .eq("user_id", user.id)
        .eq("emoji", emoji);
      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setEntries((current) =>
        current.map((entry) => {
          if (entry.id !== entryId) {
            return entry;
          }
          const nextCounts = { ...entry.reaction_counts };
          const nextValue = Math.max(0, (nextCounts[emoji] ?? 1) - 1);
          if (nextValue === 0) {
            delete nextCounts[emoji];
          } else {
            nextCounts[emoji] = nextValue;
          }
          return {
            ...entry,
            reaction_counts: nextCounts,
            my_reactions: entry.my_reactions.filter((value) => value !== emoji),
          };
        })
      );
    } else {
      const { error } = await supabase.from("entry_reactions").insert({
        entry_id: entryId,
        user_id: user.id,
        emoji,
      });
      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setEntries((current) =>
        current.map((entry) => {
          if (entry.id !== entryId) {
            return entry;
          }
          return {
            ...entry,
            reaction_counts: {
              ...entry.reaction_counts,
              [emoji]: (entry.reaction_counts[emoji] ?? 0) + 1,
            },
            my_reactions: [...entry.my_reactions, emoji],
          };
        })
      );
    }
  };

  const loadFeed = useCallback(
    async (refresh = false) => {
      if (!user?.id) {
        return;
      }

      refresh ? setIsRefreshing(true) : setIsLoading(true);
      setErrorMessage(null);

      const result = await fetchFeedPage({
        viewerUserId: user.id,
        scope: feedScope,
        cursor: null,
        limit: PAGE_SIZE,
      });

      if (result.errorMessage) {
        setErrorMessage(result.errorMessage);
        setEntries([]);
        setHasMore(false);
        setNextCursor(null);
        setExpandedNotesByEntryId({});
        setReactionPopupEntryId(null);
        setExpandedCommentsByEntryId({});
        setCommentsByEntryId({});
        setCommentDraftByEntryId({});
        setReplyTargetByEntryId({});
        setLoadingCommentsByEntryId({});
        setPostingCommentByEntryId({});
        setCommentErrorByEntryId({});
      } else {
        setEntries(result.entries);
        setHasMore(result.hasMore);
        setNextCursor(result.nextCursor);
        setExpandedNotesByEntryId({});
        setReactionPopupEntryId(null);
        setExpandedCommentsByEntryId({});
        setCommentsByEntryId({});
        setCommentDraftByEntryId({});
        setReplyTargetByEntryId({});
        setLoadingCommentsByEntryId({});
        setPostingCommentByEntryId({});
        setCommentErrorByEntryId({});
      }

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [feedScope, user?.id]
  );

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const loadMore = async () => {
    if (!user?.id || isLoadingMore || !hasMore || !nextCursor) {
      return;
    }

    setIsLoadingMore(true);
    setErrorMessage(null);

    const result = await fetchFeedPage({
      viewerUserId: user.id,
      scope: feedScope,
      cursor: nextCursor,
      limit: PAGE_SIZE,
    });

    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
      setIsLoadingMore(false);
      return;
    }

    setEntries((current) => {
      const seen = new Set(current.map((entry) => entry.id));
      const next = result.entries.filter((entry) => !seen.has(entry.id));
      return [...current, ...next];
    });
    setHasMore(result.hasMore);
    setNextCursor(result.nextCursor);
    setIsLoadingMore(false);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#fbbf24" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        scrollEnabled={!isGallerySwipeActive}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadFeed(true)}
            tintColor="#fbbf24"
          />
        }
      >
        <AppTopBar activeHref="/(app)/feed" />

        <View style={styles.header}>
          <Text style={styles.eyebrow}>Social feed</Text>
          <Text style={styles.title}>What the cellar is sipping.</Text>
          <Text style={styles.subtitle}>
            Discover what others are enjoying across the app.
          </Text>
        </View>

        <View style={styles.scopeRow}>
          <Pressable
            style={[
              styles.scopePill,
              feedScope === "public" ? styles.scopePillActive : null,
            ]}
            onPress={() => setFeedScope("public")}
          >
            <Text
              style={[
                styles.scopePillText,
                feedScope === "public" ? styles.scopePillTextActive : null,
              ]}
            >
              Public feed
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.scopePill,
              feedScope === "friends" ? styles.scopePillActive : null,
            ]}
            onPress={() => setFeedScope("friends")}
          >
            <Text
              style={[
                styles.scopePillText,
                feedScope === "friends" ? styles.scopePillTextActive : null,
              ]}
            >
              Friends only
            </Text>
          </Pressable>
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        {entries.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No entries yet.</Text>
          </View>
        ) : (
          <View style={styles.feedStack}>
            {entries.map((entry) => {
              const entryComments = commentsByEntryId[entry.id] ?? [];
              const replyTargetId = replyTargetByEntryId[entry.id] ?? null;
              const replyTarget =
                replyTargetId && entryComments.length > 0
                  ? entryComments.find((comment) => comment.id === replyTargetId) ?? null
                  : null;

              return (
                <FeedCard
                  key={entry.id}
                  item={entry}
                  notesExpanded={Boolean(expandedNotesByEntryId[entry.id])}
                  onToggleNotes={() =>
                    setExpandedNotesByEntryId((current) => ({
                      ...current,
                      [entry.id]: !current[entry.id],
                    }))
                  }
                  commentsExpanded={Boolean(expandedCommentsByEntryId[entry.id])}
                  onToggleComments={() => toggleCommentsExpanded(entry.id)}
                  onGallerySwipeStart={() =>
                    setIsGallerySwipeActive((current) => (current ? current : true))
                  }
                  onGallerySwipeEnd={() =>
                    setIsGallerySwipeActive((current) => (current ? false : current))
                  }
                  replyTargetName={replyTarget?.author_name ?? null}
                  onSetReplyTarget={(commentId) =>
                    setReplyTargetByEntryId((current) => ({
                      ...current,
                      [entry.id]: current[entry.id] === commentId ? null : commentId,
                    }))
                  }
                  onClearReplyTarget={() =>
                    setReplyTargetByEntryId((current) => ({
                      ...current,
                      [entry.id]: null,
                    }))
                  }
                  commentCount={countComments(
                    commentsByEntryId[entry.id],
                    entry.comment_count
                  )}
                  comments={entryComments}
                  commentsLoading={Boolean(loadingCommentsByEntryId[entry.id])}
                  commentDraft={commentDraftByEntryId[entry.id] ?? ""}
                  onChangeCommentDraft={(value) =>
                    setCommentDraftByEntryId((current) => ({
                      ...current,
                      [entry.id]: value,
                    }))
                  }
                  onSubmitComment={() => void submitCommentForEntry(entry.id)}
                  postingComment={Boolean(postingCommentByEntryId[entry.id])}
                  commentError={commentErrorByEntryId[entry.id] ?? null}
                  reactionPickerOpen={reactionPopupEntryId === entry.id}
                  onToggleReactionPicker={() =>
                    setReactionPopupEntryId((current) =>
                      current === entry.id ? null : entry.id
                    )
                  }
                  onToggleReaction={(emoji) => void toggleReaction(entry.id, emoji)}
                />
              );
            })}
          </View>
        )}

        {hasMore ? (
          <Pressable
            style={styles.loadMoreButton}
            disabled={isLoadingMore}
            onPress={() => void loadMore()}
          >
            {isLoadingMore ? (
              <ActivityIndicator color="#09090b" />
            ) : (
              <Text style={styles.loadMoreText}>Load more</Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0f0a09",
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: "#0f0a09",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 12,
  },
  header: {
    gap: 6,
  },
  eyebrow: {
    color: "#fcd34d",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  title: {
    color: "#fafafa",
    fontSize: 29,
    fontWeight: "700",
  },
  subtitle: {
    color: "#d4d4d8",
    fontSize: 13,
    lineHeight: 18,
  },
  scopeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  scopePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  scopePillActive: {
    borderColor: "rgba(252,211,77,0.7)",
    backgroundColor: "rgba(251,191,36,0.15)",
  },
  scopePillText: {
    color: "#d4d4d8",
    fontSize: 12,
    fontWeight: "700",
  },
  scopePillTextActive: {
    color: "#fef3c7",
  },
  errorText: {
    color: "#fecdd3",
    fontSize: 13,
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  emptyText: {
    color: "#d4d4d8",
    fontSize: 14,
    lineHeight: 20,
  },
  feedStack: {
    gap: 12,
  },
  feedCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 14,
    gap: 10,
  },
  feedAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  feedAuthorStack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  feedAvatar: {
    width: 30,
    height: 30,
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  feedAvatarImage: {
    width: "100%",
    height: "100%",
  },
  feedAvatarFallback: {
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "700",
  },
  feedAuthorName: {
    color: "#e4e4e7",
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 1,
  },
  feedDate: {
    color: "#a1a1aa",
    fontSize: 11,
    flexShrink: 0,
  },
  feedPhotoFrame: {
    width: "100%",
    aspectRatio: 7 / 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.45)",
    position: "relative",
  },
  feedPhotoTrack: {
    flexDirection: "row",
    width: "100%",
    height: "100%",
  },
  feedPhotoTrackSlide: {
    height: "100%",
  },
  feedPhotoStatic: {
    width: "100%",
    height: "100%",
  },
  photoDotRow: {
    position: "absolute",
    bottom: 8,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  photoDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(161,161,170,0.85)",
  },
  photoDotActive: {
    backgroundColor: "#fcd34d",
  },
  feedPhotoFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  feedPhotoFallbackText: {
    color: "#71717a",
    fontSize: 12,
  },
  photoTypeChip: {
    position: "absolute",
    left: 10,
    top: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  photoTypeChipText: {
    color: "#e4e4e7",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  feedTextStack: {
    gap: 3,
  },
  feedWineName: {
    color: "#fafafa",
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 23,
  },
  feedMetaText: {
    color: "#a1a1aa",
    fontSize: 13,
    lineHeight: 18,
  },
  feedTastedWithText: {
    color: "#a1a1aa",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  feedValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 2,
  },
  feedRating: {
    color: "#fcd34d",
    fontSize: 14,
    fontWeight: "800",
  },
  feedQprTag: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  qpr_extortion: {
    borderColor: "rgba(251,113,133,0.4)",
    backgroundColor: "rgba(251,113,133,0.1)",
    color: "#fecdd3",
  },
  qpr_pricey: {
    borderColor: "rgba(248,113,113,0.4)",
    backgroundColor: "rgba(248,113,113,0.1)",
    color: "#fecaca",
  },
  qpr_mid: {
    borderColor: "rgba(251,191,36,0.4)",
    backgroundColor: "rgba(251,191,36,0.1)",
    color: "#fde68a",
  },
  qpr_good_value: {
    borderColor: "rgba(74,222,128,0.4)",
    backgroundColor: "rgba(74,222,128,0.1)",
    color: "#bbf7d0",
  },
  qpr_absolute_steal: {
    borderColor: "rgba(34,197,94,0.4)",
    backgroundColor: "rgba(34,197,94,0.1)",
    color: "#86efac",
  },
  notesWrap: {
    gap: 4,
  },
  notesText: {
    color: "#d4d4d8",
    fontSize: 12,
    lineHeight: 18,
  },
  notesToggleText: {
    color: "#fcd34d",
    fontSize: 11,
    fontWeight: "700",
  },
  feedDivider: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.11)",
    marginTop: 3,
    marginBottom: 2,
  },
  feedInteractionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  commentsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.2)",
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  commentsButtonActive: {
    borderColor: "rgba(252,211,77,0.45)",
    backgroundColor: "rgba(251,191,36,0.12)",
  },
  commentsButtonText: {
    color: "#d4d4d8",
    fontSize: 11,
    fontWeight: "700",
  },
  commentsButtonTextActive: {
    color: "#fef3c7",
  },
  commentsButtonCount: {
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "700",
  },
  reactionRight: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  reactionPills: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    flexShrink: 1,
  },
  reactionPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(0,0,0,0.25)",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  reactionPillText: {
    color: "#d4d4d8",
    fontSize: 11,
    fontWeight: "600",
  },
  reactionAddButton: {
    width: 27,
    height: 27,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  reactionAddButtonDisabled: {
    borderColor: "rgba(255,255,255,0.1)",
  },
  plusIcon: {
    width: 12,
    height: 12,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  plusLineHorizontal: {
    position: "absolute",
    width: 12,
    height: 1.6,
    borderRadius: 999,
    backgroundColor: "#e4e4e7",
  },
  plusLineVertical: {
    position: "absolute",
    width: 1.6,
    height: 12,
    borderRadius: 999,
    backgroundColor: "#e4e4e7",
  },
  plusLineDisabled: {
    backgroundColor: "#71717a",
  },
  reactionPickerCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.28)",
    padding: 9,
    gap: 8,
  },
  reactionPickerRow: {
    flexDirection: "row",
    gap: 7,
    flexWrap: "wrap",
  },
  reactionEmojiBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  reactionEmojiBtnActive: {
    borderColor: "rgba(252,211,77,0.5)",
    backgroundColor: "rgba(251,191,36,0.14)",
  },
  reactionEmojiBtnDisabled: {
    opacity: 0.5,
  },
  reactionEmojiText: {
    fontSize: 18,
  },
  reactionPrivateText: {
    color: "#71717a",
    fontSize: 11,
  },
  commentsPanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.2)",
    padding: 10,
    gap: 8,
  },
  commentsEmptyText: {
    color: "#a1a1aa",
    fontSize: 12,
  },
  commentList: {
    gap: 8,
  },
  commentRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 8,
    gap: 4,
  },
  replyList: {
    marginTop: 6,
    paddingLeft: 8,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.1)",
    gap: 6,
  },
  replyRow: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(0,0,0,0.2)",
    padding: 7,
    gap: 3,
  },
  commentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  commentAuthor: {
    color: "#e4e4e7",
    fontSize: 11,
    fontWeight: "700",
  },
  commentDate: {
    color: "#71717a",
    fontSize: 10,
  },
  commentBody: {
    color: "#d4d4d8",
    fontSize: 12,
    lineHeight: 17,
  },
  commentBodyDeleted: {
    color: "#71717a",
    fontStyle: "italic",
  },
  replyActionButton: {
    alignSelf: "flex-start",
  },
  replyActionText: {
    color: "#d4d4d8",
    fontSize: 11,
    fontWeight: "600",
  },
  commentComposer: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    paddingTop: 8,
    gap: 8,
  },
  replyTargetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.25)",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  replyTargetText: {
    color: "#d4d4d8",
    fontSize: 11,
    flex: 1,
  },
  replyTargetCancel: {
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "600",
  },
  commentInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.25)",
    color: "#f4f4f5",
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 52,
    textAlignVertical: "top",
  },
  commentSubmitButton: {
    alignSelf: "flex-end",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(252,211,77,0.5)",
    backgroundColor: "rgba(251,191,36,0.15)",
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  commentSubmitButtonDisabled: {
    opacity: 0.5,
  },
  commentSubmitButtonText: {
    color: "#fef3c7",
    fontSize: 11,
    fontWeight: "700",
  },
  commentErrorText: {
    color: "#fecdd3",
    fontSize: 11,
  },
  loadMoreButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#fbbf24",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  loadMoreText: {
    color: "#09090b",
    fontSize: 12,
    fontWeight: "700",
  },
});
