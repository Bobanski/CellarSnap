import { NextResponse } from "next/server";
import { getPublicProfileName } from "@/lib/publicProfiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchPrimaryGrapesByEntryId } from "@/lib/primaryGrapes";
import {
  canUserViewEntry,
  getAcceptedFriendIds,
  getBlockedEitherWayUserIds,
  getFriendsOfFriendsIds,
  type EntryPrivacy,
} from "@/lib/access/entryVisibility";
import { resolveInteractionAccessForViewer } from "@/lib/access/interactionVisibility";
import { getTestAccountStatusMap, isTestAccount } from "@/lib/access/testAccounts";
import { executeSelectWithFallback } from "@/server/db/compat";
import { resolveGroupedPostData } from "@/server/entries/groupPosts";
import { signPhotoUrls } from "@/server/storage/signedUrls";

type FeedEntryRow = {
  id: string;
  user_id: string;
  drinking_now?: boolean | null;
  root_entry_id?: string | null;
  is_feed_visible?: boolean | null;
  entry_group_id?: string | null;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  canonical_country?: string | null;
  canonical_region?: string | null;
  canonical_sub_region?: string | null;
  classification?: string | null;
  wine_type?: string | null;
  consumed_at: string;
  rating: number | null;
  qpr_level: string | null;
  tasted_with_user_ids: string[] | null;
  notes: string | null;
  label_image_path: string | null;
  place_image_path: string | null;
  pairing_image_path: string | null;
  entry_privacy: "public" | "friends_of_friends" | "friends" | "private";
  created_at: string;
};

type InteractionSettingsRow = {
  id: string;
  reaction_privacy?: EntryPrivacy;
  comments_privacy?: EntryPrivacy;
  comments_scope?: string | null;
};

type FeedCursorToken = {
  v: 1;
  created_at: string;
  id: string;
  dedupe_key: string;
};

type FeedCursorPosition = {
  createdAt: string;
  id: string;
  dedupeKey: string;
};

const MAX_FEED_ITERATIONS = 20;

function isValidIsoTimestamp(value: string) {
  return !Number.isNaN(Date.parse(value));
}

function parseLegacyCursor(rawCursor: string | null) {
  if (!rawCursor || !isValidIsoTimestamp(rawCursor)) {
    return null;
  }
  return rawCursor;
}

function decodeCursorV2(rawCursor: string | null): FeedCursorToken | null {
  if (!rawCursor) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(rawCursor, "base64url").toString("utf8")
    ) as Partial<FeedCursorToken>;
    if (
      decoded.v !== 1 ||
      typeof decoded.created_at !== "string" ||
      typeof decoded.id !== "string" ||
      typeof decoded.dedupe_key !== "string"
    ) {
      return null;
    }
    if (!isValidIsoTimestamp(decoded.created_at)) {
      return null;
    }

    return {
      v: 1,
      created_at: decoded.created_at,
      id: decoded.id,
      dedupe_key: decoded.dedupe_key,
    };
  } catch {
    return null;
  }
}

function encodeCursorV2(cursor: FeedCursorPosition) {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      created_at: cursor.createdAt,
      id: cursor.id,
      dedupe_key: cursor.dedupeKey,
    } satisfies FeedCursorToken),
    "utf8"
  ).toString("base64url");
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
  const legacyCursor = parseLegacyCursor(url.searchParams.get("cursor"));
  const cursorV2 = decodeCursorV2(url.searchParams.get("cursor_v2"));
  const rawLimit = Number(url.searchParams.get("limit") ?? "");
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(50, Math.max(1, rawLimit))
      : 30;
  const viewerIsTestAccount = await isTestAccount(supabase, user.id);

  const blockedUserIdsSet = await getBlockedEitherWayUserIds(supabase, user.id);
  const acceptedFriendIdsSet = await getAcceptedFriendIds(supabase, user.id);
  const friendIds = Array.from(acceptedFriendIdsSet);
  const friendsOfFriendsIdsSet = await getFriendsOfFriendsIds(
    supabase,
    user.id,
    acceptedFriendIdsSet
  );
  const socialAuthorIds = Array.from(
    new Set([...friendIds, ...Array.from(friendsOfFriendsIdsSet)])
  ).filter((id) => !blockedUserIdsSet.has(id));

  const baseSelectFieldsWithoutDrinkingNow =
    "id, user_id, wine_name, producer, vintage, country, region, appellation, canonical_country, canonical_region, canonical_sub_region, classification, wine_type, notes, consumed_at, rating, qpr_level, tasted_with_user_ids, label_image_path, place_image_path, pairing_image_path, entry_privacy, created_at";
  const baseSelectFields = `${baseSelectFieldsWithoutDrinkingNow}, drinking_now`;
  const extendedSelectFields = `${baseSelectFields}, root_entry_id, is_feed_visible, entry_group_id`;
  const extendedSelectFieldsWithoutDrinkingNow =
    `${baseSelectFieldsWithoutDrinkingNow}, root_entry_id, is_feed_visible, entry_group_id`;

  const initialCursor = cursorV2
    ? {
        createdAt: cursorV2.created_at,
        id: cursorV2.id,
      }
    : legacyCursor
      ? {
          createdAt: legacyCursor,
          id: null,
        }
      : null;

  const buildEntriesQuery = ({
    fields,
    withTastingSupport,
    withEntryStatusFilter,
    cursor,
  }: {
    fields: string;
    withTastingSupport: boolean;
    withEntryStatusFilter: boolean;
    cursor: { createdAt: string; id: string | null } | null;
  }) => {
    let query = supabase.from("wine_entries").select(fields);

    if (withEntryStatusFilter) {
      query = query.eq("entry_status", "consumed");
    }

    if (viewerIsTestAccount) {
      query = query.neq("user_id", user.id);
    } else if (scope === "friends") {
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

    if (cursor?.id) {
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
      );
    } else if (cursor?.createdAt) {
      query = query.lt("created_at", cursor.createdAt);
    }

    return query;
  };

  if (!viewerIsTestAccount && scope === "friends" && socialAuthorIds.length === 0) {
    return NextResponse.json({
      entries: [],
      next_cursor: null,
      next_cursor_v2: null,
      has_more: false,
      viewer_user_id: user.id,
    });
  }

  let hasTastingSupport = false;
  const dedupeOrder: string[] = [];
  const dedupedByKey = new Map<string, FeedEntryRow>();
  const fetchLimit = Math.min(200, Math.max(40, limit * 2));
  let queryCursor = initialCursor;
  let nextCursorAnchor: FeedCursorPosition | null = null;
  let lastScannedRow: FeedCursorPosition | null = null;
  let has_more = false;

  for (let attemptIndex = 0; attemptIndex < MAX_FEED_ITERATIONS; attemptIndex += 1) {
    const entrySelectResult = await executeSelectWithFallback({
      attempts: [
        {
          fields: extendedSelectFields,
          withTastingSupport: true,
          withEntryStatusFilter: true,
          hasDrinkingNowColumn: true,
          missingColumns: [
            "drinking_now",
            "is_feed_visible",
            "root_entry_id",
            "entry_group_id",
            "entry_status",
          ] as const,
        },
        {
          fields: extendedSelectFieldsWithoutDrinkingNow,
          withTastingSupport: true,
          withEntryStatusFilter: true,
          hasDrinkingNowColumn: false,
          missingColumns: ["is_feed_visible", "root_entry_id", "entry_group_id", "entry_status"] as const,
        },
        {
          fields: baseSelectFields,
          withTastingSupport: false,
          withEntryStatusFilter: false,
          hasDrinkingNowColumn: true,
          missingColumns: ["drinking_now"] as const,
        },
        {
          fields: baseSelectFieldsWithoutDrinkingNow,
          withTastingSupport: false,
          withEntryStatusFilter: false,
          hasDrinkingNowColumn: false,
          missingColumns: [] as const,
        },
      ],
      getFallbackColumns: (attempt) => attempt.missingColumns,
      fallbackOnAnyMissingColumn: true,
      attempt: async (attempt) => {
        const result = await buildEntriesQuery({
          fields: attempt.fields,
          withTastingSupport: attempt.withTastingSupport,
          withEntryStatusFilter: attempt.withEntryStatusFilter,
          cursor: queryCursor,
        })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(fetchLimit);
        return {
          data: result.data,
          error: result.error,
        };
      },
    });

    if (entrySelectResult.error) {
      return NextResponse.json(
        { error: entrySelectResult.error.message },
        { status: 500 }
      );
    }

    const rawRows = ((entrySelectResult.data ?? []) as unknown as FeedEntryRow[]).map((row) => ({
      ...row,
      drinking_now: entrySelectResult.usedAttempt?.hasDrinkingNowColumn
        ? row.drinking_now ?? false
        : false,
    }));
    hasTastingSupport = Boolean(entrySelectResult.usedAttempt?.withTastingSupport);

    if (rawRows.length === 0) {
      break;
    }

    const rowsMissingInlinePhotos = rawRows
      .filter(
        (row) =>
          !row.label_image_path &&
          !row.place_image_path &&
          !row.pairing_image_path
      )
      .map((row) => row.id);
    const entryIdsWithGalleryPhotos = new Set<string>();
    if (rowsMissingInlinePhotos.length > 0) {
      const { data: galleryPhotoRows, error: galleryPhotoError } = await supabase
        .from("entry_photos")
        .select("entry_id")
        .in("entry_id", rowsMissingInlinePhotos);

      if (galleryPhotoError) {
        if (
          !galleryPhotoError.message.includes("entry_photos") &&
          !galleryPhotoError.message.includes("relation") &&
          !galleryPhotoError.message.includes("column")
        ) {
          return NextResponse.json(
            { error: galleryPhotoError.message },
            { status: 500 }
          );
        }
      } else {
        (galleryPhotoRows ?? []).forEach((photoRow) => {
          if (typeof photoRow.entry_id === "string") {
            entryIdsWithGalleryPhotos.add(photoRow.entry_id);
          }
        });
      }
    }

    let reachedOverflow = false;
    const ownerTestAccountStatuses = await getTestAccountStatusMap(
      supabase,
      rawRows.map((row) => row.user_id)
    );

    for (const row of rawRows) {
      const dedupeKey =
        hasTastingSupport
          ? row.entry_group_id ?? row.root_entry_id ?? row.id
          : row.id;
      const rowCursor: FeedCursorPosition = {
        createdAt: row.created_at,
        id: row.id,
        dedupeKey,
      };

      const hasInlinePhoto =
        Boolean(row.label_image_path) ||
        Boolean(row.place_image_path) ||
        Boolean(row.pairing_image_path);
      if (!hasInlinePhoto && !entryIdsWithGalleryPhotos.has(row.id)) {
        lastScannedRow = rowCursor;
        continue;
      }

      const canSeeEntry = await canUserViewEntry({
        supabase,
        viewerUserId: user.id,
        ownerUserId: row.user_id,
        entryPrivacy: row.entry_privacy,
        acceptedFriendIds: acceptedFriendIdsSet,
        friendsOfFriendsIds: friendsOfFriendsIdsSet,
        blockedUserIds: blockedUserIdsSet,
        viewerIsTestAccount,
        ownerIsTestAccount: ownerTestAccountStatuses.get(row.user_id) ?? false,
      });

      if (!canSeeEntry) {
        lastScannedRow = rowCursor;
        continue;
      }

      const existing = dedupedByKey.get(dedupeKey);
      if (!existing) {
        dedupeOrder.push(dedupeKey);
        dedupedByKey.set(dedupeKey, row);
      } else if (hasTastingSupport) {
        const existingIsCanonical = !existing.root_entry_id;
        const nextIsCanonical = !row.root_entry_id;
        if (nextIsCanonical && !existingIsCanonical) {
          dedupedByKey.set(dedupeKey, row);
        }
      }

      if (dedupeOrder.length > limit) {
        has_more = true;
        nextCursorAnchor = lastScannedRow;
        reachedOverflow = true;
        break;
      }

      lastScannedRow = rowCursor;
    }

    if (reachedOverflow) {
      break;
    }

    const lastRawRow = rawRows[rawRows.length - 1];
    queryCursor = {
      createdAt: lastRawRow.created_at,
      id: lastRawRow.id,
    };
    lastScannedRow = {
      createdAt: lastRawRow.created_at,
      id: lastRawRow.id,
      dedupeKey: hasTastingSupport
        ? lastRawRow.entry_group_id ?? lastRawRow.root_entry_id ?? lastRawRow.id
        : lastRawRow.id,
    };

    if (rawRows.length < fetchLimit) {
      break;
    }
  }

  const pageEntries = dedupeOrder
    .slice(0, limit)
    .map((key) => dedupedByKey.get(key))
    .filter((entry): entry is FeedEntryRow => entry !== undefined);
  const resolvedNextCursorAnchor = has_more
    ? nextCursorAnchor ?? lastScannedRow
    : null;
  const next_cursor = has_more
    ? pageEntries[pageEntries.length - 1]?.created_at ?? null
    : null;
  const next_cursor_v2 = resolvedNextCursorAnchor
    ? encodeCursorV2(resolvedNextCursorAnchor)
    : null;

  const entryIds = pageEntries.map((entry) => entry.id);
  const authorTestAccountStatuses = await getTestAccountStatusMap(
    supabase,
    pageEntries.map((entry) => entry.user_id)
  );
  const groupedPostByEntryId = await resolveGroupedPostData(
    supabase,
    pageEntries.map((entry) => ({
      id: entry.id,
      entry_group_id: entry.entry_group_id ?? null,
    }))
  );
  const primaryGrapeMap = await fetchPrimaryGrapesByEntryId(supabase, entryIds);
  const userIds = Array.from(
    new Set(
      pageEntries.flatMap((entry) => [
        entry.user_id,
        ...(entry.tasted_with_user_ids ?? []),
      ])
    )
  );
  let profiles: {
    id: string;
    display_name: string | null;
    email: string | null;
    avatar_path?: string | null;
  }[] = [];

  if (userIds.length > 0) {
    const profileSelectResult = await executeSelectWithFallback({
      attempts: [
        {
          select: "id, display_name, email, avatar_path",
          missingColumns: ["avatar_path"] as const,
          includesAvatar: true,
        },
        {
          select: "id, display_name, email",
          missingColumns: [] as const,
          includesAvatar: false,
        },
      ],
      getFallbackColumns: (attempt) => attempt.missingColumns,
      fallbackOnAnyMissingColumn: true,
      attempt: async (attempt) => {
        const response = await supabase
          .from("public_profiles")
          .select(attempt.select)
          .in("id", userIds);
        return {
          data: response.data,
          error: response.error,
        };
      },
    });

    if (profileSelectResult.error) {
      return NextResponse.json(
        { error: profileSelectResult.error.message },
        { status: 500 }
      );
    }

    const profileRows = (profileSelectResult.data ?? []) as unknown as {
      id: string;
      display_name: string | null;
      email: string | null;
      avatar_path?: string | null;
    }[];
    profiles = profileRows.map((profile) =>
      profileSelectResult.usedAttempt?.includesAvatar
        ? profile
        : { ...profile, avatar_path: null }
    );
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
    const interactionSettingsResult = await executeSelectWithFallback({
      attempts: [
        {
          select: "id, reaction_privacy, comments_privacy, comments_scope",
          missingColumns: [
            "reaction_privacy",
            "comments_privacy",
            "comments_scope",
          ] as const,
        },
        {
          select: "id, comments_scope",
          missingColumns: ["comments_scope"] as const,
        },
        {
          select: "id",
          missingColumns: [] as const,
        },
      ],
      getFallbackColumns: (attempt) => attempt.missingColumns,
      attempt: async (attempt) => {
        const response = await supabase
          .from("wine_entries")
          .select(attempt.select)
          .in("id", entryIds);
        return {
          data: response.data,
          error: response.error,
        };
      },
    });

    if (interactionSettingsResult.error) {
      return NextResponse.json(
        { error: interactionSettingsResult.error.message },
        { status: 500 }
      );
    }

    const settingsRows = (interactionSettingsResult.data ?? []) as unknown as InteractionSettingsRow[];
    settingsRows.forEach((row) => {
      interactionSettingsByEntryId.set(row.id, row);
    });

    if (interactionSettingsResult.data == null) {
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
      .from("public_profiles")
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

  const signedUrlByPath = await signPhotoUrls(pathsToSign, supabase);

  const feedEntries = await Promise.all(pageEntries.map(async (entry) => {
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
      display_name: getPublicProfileName(profileMap.get(id)),
      email: null,
    }));

    const settings = interactionSettingsByEntryId.get(entry.id);
    const interactionAccess = await resolveInteractionAccessForViewer({
      supabase,
      viewerUserId: user.id,
      ownerUserId: entry.user_id,
      entryPrivacy: entry.entry_privacy,
      reactionPrivacy: settings?.reaction_privacy,
      commentsPrivacy: settings?.comments_privacy,
      commentsScope: settings?.comments_scope,
      acceptedFriendIds: acceptedFriendIdsSet,
      friendsOfFriendsIds: friendsOfFriendsIdsSet,
      blockedUserIds: blockedUserIdsSet,
      viewerIsTestAccount,
      ownerIsTestAccount: authorTestAccountStatuses.get(entry.user_id) ?? false,
    });

    const reactionCounts = interactionAccess.canReact
      ? reactionCountsMap.get(entry.id) ?? {}
      : {};
    const myReactions = interactionAccess.canReact
      ? myReactionsMap.get(entry.id) ?? []
      : [];
    const rawReactionUserIds = interactionAccess.canReact
      ? reactionUserIdsMap.get(entry.id) ?? {}
      : {};
    const reactionUsers: Record<string, string[]> = {};
    for (const [emoji, ids] of Object.entries(rawReactionUserIds)) {
      reactionUsers[emoji] = ids.map((id) => {
        const profile = profileMap.get(id);
        return getPublicProfileName(profile);
      });
    }
    const commentCount = interactionAccess.canComment
      ? commentCountsMap.get(entry.id) ?? 0
      : 0;
    const groupedPost = groupedPostByEntryId.get(entry.id);

    return {
      ...entry,
      primary_grapes: primaryGrapeMap.get(entry.id) ?? [],
      drinking_now: entry.drinking_now === true,
      viewer_is_direct_friend: acceptedFriendIdsSet.has(entry.user_id),
      author_name: getPublicProfileName(authorProfile),
      author_avatar_url: avatarPath ? signedUrlByPath.get(avatarPath) ?? null : null,
      label_image_url: labelPhoto,
      place_image_url: placePhoto,
      pairing_image_url: pairingPhoto,
      photo_gallery: groupedPost?.photo_gallery ?? photoGallery,
      entry_group: groupedPost?.entry_group ?? null,
      group_slides: groupedPost?.group_slides ?? [],
      tasted_with_users: tastedWithUsers,
      reaction_privacy: interactionAccess.reactionPrivacy,
      comments_privacy: interactionAccess.commentsPrivacy,
      can_react: interactionAccess.canReact,
      can_comment: interactionAccess.canComment,
      comment_count: commentCount,
      reaction_counts: reactionCounts,
      my_reactions: myReactions,
      reaction_users: reactionUsers,
    };
  }));

  return NextResponse.json({
    entries: feedEntries,
    next_cursor,
    next_cursor_v2,
    has_more,
    viewer_user_id: user.id,
  });
}
