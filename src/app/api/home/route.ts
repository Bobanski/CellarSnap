import { NextResponse } from "next/server";
import {
  HOME_CIRCLE_ENTRIES_LIMIT,
  HOME_RECENT_ENTRIES_LIMIT,
} from "@shared";
import { getFriendsOfFriendsIds } from "@/lib/access/entryVisibility";
import {
  normalizePrivacyValue,
  resolveInteractionAccessForViewer,
} from "@/lib/access/interactionVisibility";
import { isTestAccount } from "@/lib/access/testAccounts";
import { getPublicProfileName } from "@/lib/publicProfiles";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { executeSelectWithFallback } from "@/server/db/compat";
import { resolveGroupedPostData } from "@/server/entries/groupPosts";
import { signPhotoUrl } from "@/server/storage/signedUrls";

type HomeEntryRow = Record<string, unknown> & {
  id: string;
  user_id: string;
  root_entry_id?: string | null;
  entry_group_id?: string | null;
};

function dedupeHomeEntries(entries: HomeEntryRow[]) {
  const dedupedByKey = new Map<string, HomeEntryRow>();

  entries.forEach((entry) => {
    const dedupeKey =
      (typeof entry.entry_group_id === "string" && entry.entry_group_id.length > 0
        ? entry.entry_group_id
        : null) ??
      (typeof entry.root_entry_id === "string" && entry.root_entry_id.length > 0
        ? entry.root_entry_id
        : null) ??
      entry.id;

    const existing = dedupedByKey.get(dedupeKey);
    if (!existing) {
      dedupedByKey.set(dedupeKey, entry);
      return;
    }

    const existingIsCanonical = !existing.root_entry_id;
    const nextIsCanonical = !entry.root_entry_id;
    if (nextIsCanonical && !existingIsCanonical) {
      dedupedByKey.set(dedupeKey, entry);
    }
  });

  return Array.from(dedupedByKey.values());
}

function normalizeNullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isMissingAvatarPathColumnError(message: string) {
  return message.includes("avatar_path") || message.includes("column");
}

export async function GET(request: Request) {
  let auth;
  try {
    auth = await requireRequestAuth(request);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const { supabase, user } = auth;

  const viewerIsTestAccount = await isTestAccount(supabase, user.id);

  const profileSelectResult = await executeSelectWithFallback({
    attempts: [
      {
        select:
          "display_name, first_name, default_entry_privacy, privacy_confirmed_at",
        missingColumns: ["default_entry_privacy", "privacy_confirmed_at"] as const,
        includesPrivacyDefaults: true,
      },
      {
        select: "display_name, first_name, created_at",
        missingColumns: [] as const,
        includesPrivacyDefaults: false,
      },
    ],
    getFallbackColumns: (attempt) => attempt.missingColumns,
    attempt: async (attempt) => {
      const response = await supabase
        .from("profiles")
        .select(attempt.select)
        .eq("id", user.id)
        .maybeSingle();
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

  const profileData = profileSelectResult.data as Record<string, unknown> | null;
  const profile = profileData
    ? profileSelectResult.usedAttempt?.includesPrivacyDefaults
      ? profileData
      : {
          ...profileData,
          default_entry_privacy: "public",
          privacy_confirmed_at:
            (profileData as { created_at?: string | null }).created_at ??
            new Date().toISOString(),
        }
    : null;

  const { count: totalEntryCount } = await supabase
    .from("wine_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("entry_status", "consumed");

  const ownEntriesResult = await executeSelectWithFallback({
    attempts: [
      {
        withFeedVisibilityFilter: true,
        withEntryStatusFilter: true,
        missingColumns: ["is_feed_visible", "entry_status"] as const,
      },
      {
        withFeedVisibilityFilter: true,
        withEntryStatusFilter: false,
        missingColumns: ["is_feed_visible"] as const,
      },
      {
        withFeedVisibilityFilter: false,
        withEntryStatusFilter: false,
        missingColumns: [] as const,
      },
    ],
    getFallbackColumns: (attempt) => attempt.missingColumns,
    fallbackOnAnyMissingColumn: true,
    attempt: async (attempt) => {
      let query = supabase
        .from("wine_entries")
        .select("*")
        .eq("user_id", user.id)
        .order("consumed_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(12);

      if (attempt.withFeedVisibilityFilter) {
        query = query.eq("is_feed_visible", true);
      }

      if (attempt.withEntryStatusFilter) {
        query = query.eq("entry_status", "consumed");
      }

      const response = await query;
      return {
        data: response.data,
        error: response.error,
      };
    },
  });

  if (ownEntriesResult.error) {
    return NextResponse.json(
      { error: ownEntriesResult.error.message },
      { status: 500 }
    );
  }

  const ownEntries = dedupeHomeEntries(
    ((ownEntriesResult.data ?? []) as HomeEntryRow[]).slice(0, 12)
  ).slice(0, HOME_RECENT_ENTRIES_LIMIT);

  const { data: friendRows } = await supabase
    .from("friend_requests")
    .select("requester_id, recipient_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);

  const friendIds = Array.from(
    new Set(
      (friendRows ?? []).map((row) =>
        row.requester_id === user.id ? row.recipient_id : row.requester_id
      )
    )
  );

  let friendEntries: HomeEntryRow[] = [];

  if (viewerIsTestAccount || friendIds.length > 0) {
    const buildFriendQuery = (withFeedVisibilityFilter: boolean, withEntryStatusFilter: boolean) => {
      let query = supabase
        .from("wine_entries")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(12);

      query = viewerIsTestAccount
        ? query.neq("user_id", user.id)
        : query
            .in("user_id", friendIds)
            .in("entry_privacy", ["public", "friends_of_friends", "friends"]);

      if (withFeedVisibilityFilter) {
        query = query.eq("is_feed_visible", true);
      }

      if (withEntryStatusFilter) {
        query = query.eq("entry_status", "consumed");
      }

      return query;
    };

    const friendEntriesResult = await executeSelectWithFallback({
      attempts: [
        {
          withFeedVisibilityFilter: true,
          withEntryStatusFilter: true,
          missingColumns: ["is_feed_visible", "entry_status"] as const,
        },
        {
          withFeedVisibilityFilter: true,
          withEntryStatusFilter: false,
          missingColumns: ["is_feed_visible"] as const,
        },
        {
          withFeedVisibilityFilter: false,
          withEntryStatusFilter: false,
          missingColumns: [] as const,
        },
      ],
      getFallbackColumns: (attempt) => attempt.missingColumns,
      fallbackOnAnyMissingColumn: true,
      attempt: async (attempt) => {
        const response = await buildFriendQuery(attempt.withFeedVisibilityFilter, attempt.withEntryStatusFilter);
        return {
          data: response.data,
          error: response.error,
        };
      },
    });

    if (friendEntriesResult.error) {
      return NextResponse.json(
        { error: friendEntriesResult.error.message },
        { status: 500 }
      );
    }

    const rawFriendEntries = (friendEntriesResult.data ?? []) as HomeEntryRow[];
    friendEntries = dedupeHomeEntries(rawFriendEntries).slice(
      0,
      HOME_CIRCLE_ENTRIES_LIMIT
    );
  }

  const allEntries = [...ownEntries, ...friendEntries];
  const allEntryIds = allEntries.map((entry) => entry.id);

  const { data: labelPhotos } =
    allEntryIds.length > 0
      ? await supabase
          .from("entry_photos")
          .select("entry_id, path, position, created_at")
          .eq("type", "label")
          .in("entry_id", allEntryIds)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true })
      : { data: [] };

  const labelMap = new Map<string, string>();
  (labelPhotos ?? []).forEach((photo) => {
    if (!labelMap.has(photo.entry_id)) {
      labelMap.set(photo.entry_id, photo.path);
    }
  });

  const groupedPostByEntryId = await resolveGroupedPostData(
    supabase,
    allEntries.map((entry) => ({
      id: entry.id,
      entry_group_id:
        typeof entry.entry_group_id === "string" ? entry.entry_group_id : null,
    }))
  );

  const reactionCountsByEntryId = new Map<string, Record<string, number>>();
  const myReactionsByEntryId = new Map<string, string[]>();
  const reactionUserIdsByEntryId = new Map<string, Record<string, string[]>>();
  const reactorUserIds = new Set<string>();

  if (allEntryIds.length > 0) {
    const { data: reactionRows, error: reactionsError } = await supabase
      .from("entry_reactions")
      .select("entry_id, user_id, emoji")
      .in("entry_id", allEntryIds);

    if (reactionsError) {
      return NextResponse.json(
        { error: reactionsError.message },
        { status: 500 }
      );
    }

    (reactionRows ?? []).forEach((row) => {
      const counts = reactionCountsByEntryId.get(row.entry_id) ?? {};
      counts[row.emoji] = (counts[row.emoji] ?? 0) + 1;
      reactionCountsByEntryId.set(row.entry_id, counts);

      const emojiUsers = reactionUserIdsByEntryId.get(row.entry_id) ?? {};
      const list = emojiUsers[row.emoji] ?? [];
      if (!list.includes(row.user_id)) {
        list.push(row.user_id);
      }
      emojiUsers[row.emoji] = list;
      reactionUserIdsByEntryId.set(row.entry_id, emojiUsers);
      reactorUserIds.add(row.user_id);

      if (row.user_id === user.id) {
        const mine = myReactionsByEntryId.get(row.entry_id) ?? [];
        if (!mine.includes(row.emoji)) {
          mine.push(row.emoji);
        }
        myReactionsByEntryId.set(row.entry_id, mine);
      }
    });
  }

  const friendUserIds = Array.from(
    new Set([
      ...friendEntries.map((entry) => entry.user_id),
      ...allEntries.flatMap((entry) =>
        Array.isArray((entry as { tasted_with_user_ids?: unknown }).tasted_with_user_ids)
          ? (((entry as { tasted_with_user_ids?: unknown }).tasted_with_user_ids as string[]) ??
              [])
          : []
      ),
      ...Array.from(reactorUserIds),
    ])
  );

  let friendProfiles:
    | {
        id: string;
        display_name: string | null;
        email: string | null;
        avatar_path?: string | null;
      }[]
    | null = [];

  if (friendUserIds.length > 0) {
    const profileResponse = await supabase
      .from("public_profiles")
      .select("id, display_name, email, avatar_path")
      .in("id", friendUserIds);

    if (!profileResponse.error) {
      friendProfiles = profileResponse.data ?? [];
    } else if (isMissingAvatarPathColumnError(profileResponse.error.message)) {
      const fallbackResponse = await supabase
        .from("public_profiles")
        .select("id, display_name, email")
        .in("id", friendUserIds);

      if (fallbackResponse.error) {
        return NextResponse.json(
          { error: fallbackResponse.error.message },
          { status: 500 }
        );
      }

      friendProfiles = (fallbackResponse.data ?? []).map((profile) => ({
        ...profile,
        avatar_path: null,
      }));
    } else {
      return NextResponse.json(
        { error: profileResponse.error.message },
        { status: 500 }
      );
    }
  }

  const profileMap = new Map(
    (friendProfiles ?? []).map((profile) => [profile.id, profile])
  );
  const avatarUrlEntries = await Promise.all(
    (friendProfiles ?? []).map(async (profile) => [
      profile.id,
      await signPhotoUrl(profile.avatar_path ?? null, supabase),
    ] as const)
  );
  const avatarUrlByUserId = new Map(avatarUrlEntries);
  const acceptedFriendIds = new Set(friendIds);
  const friendsOfFriendsIds = viewerIsTestAccount
    ? new Set<string>()
    : await getFriendsOfFriendsIds(supabase, user.id, acceptedFriendIds);

  const resolveEntryAccess = (entry: HomeEntryRow) => {
    const entryPrivacy = normalizePrivacyValue(entry.entry_privacy, "public");
    return resolveInteractionAccessForViewer({
      supabase,
      viewerUserId: user.id,
      ownerUserId: entry.user_id,
      entryPrivacy,
      reactionPrivacy: normalizePrivacyValue(
        (entry as { reaction_privacy?: unknown }).reaction_privacy,
        entryPrivacy
      ),
      commentsPrivacy: normalizePrivacyValue(
        (entry as { comments_privacy?: unknown }).comments_privacy,
        entryPrivacy
      ),
      commentsScope: normalizeNullableString(
        (entry as { comments_scope?: unknown }).comments_scope
      ),
      acceptedFriendIds,
      friendsOfFriendsIds,
    });
  };

  const buildReactionUsers = (entryId: string) =>
    Object.fromEntries(
      Object.entries(reactionUserIdsByEntryId.get(entryId) ?? {}).map(([emoji, ids]) => [
        emoji,
        ids.map((id) => getPublicProfileName(profileMap.get(id))),
      ])
    );

  const recentEntries = await Promise.all(
    ownEntries.map(async (entry) => {
      const interactionAccess = await resolveEntryAccess(entry);
      const groupedPost = groupedPostByEntryId.get(entry.id);

      return {
        id: entry.id,
        wine_name: normalizeNullableString(entry.wine_name),
        producer: normalizeNullableString(entry.producer),
        vintage: normalizeNullableString(entry.vintage),
        rating: typeof entry.rating === "number" ? entry.rating : null,
        qpr_level: normalizeNullableString(entry.qpr_level),
        consumed_at: normalizeNullableString(entry.consumed_at) ?? "",
        created_at: normalizeNullableString(entry.created_at) ?? "",
        drinking_now: (entry as { drinking_now?: unknown }).drinking_now === true,
        tasted_with_names: Array.isArray(
          (entry as { tasted_with_user_ids?: unknown }).tasted_with_user_ids
        )
          ? (((entry as { tasted_with_user_ids?: unknown }).tasted_with_user_ids as string[]) ??
              []
            ).map((id) => getPublicProfileName(profileMap.get(id)))
          : [],
        label_image_url: await signPhotoUrl(
          labelMap.get(entry.id) ?? normalizeNullableString(entry.label_image_path),
          supabase
        ),
        photo_gallery: groupedPost?.photo_gallery ?? [],
        entry_group: groupedPost?.entry_group ?? null,
        group_slides: groupedPost?.group_slides ?? [],
        can_react: interactionAccess.canReact,
        my_reactions: interactionAccess.canReact
          ? myReactionsByEntryId.get(entry.id) ?? []
          : [],
        reaction_counts: interactionAccess.canReact
          ? reactionCountsByEntryId.get(entry.id) ?? {}
          : {},
        reaction_users: interactionAccess.canReact ? buildReactionUsers(entry.id) : {},
      };
    })
  );

  const circleEntries = await Promise.all(
    friendEntries.map(async (entry) => {
      const interactionAccess = await resolveEntryAccess(entry);
      const groupedPost = groupedPostByEntryId.get(entry.id);

      return {
        id: entry.id,
        user_id: entry.user_id,
        wine_name: normalizeNullableString(entry.wine_name),
        producer: normalizeNullableString(entry.producer),
        vintage: normalizeNullableString(entry.vintage),
        rating: typeof entry.rating === "number" ? entry.rating : null,
        qpr_level: normalizeNullableString(entry.qpr_level),
        consumed_at: normalizeNullableString(entry.consumed_at) ?? "",
        created_at: normalizeNullableString(entry.created_at) ?? "",
        drinking_now: (entry as { drinking_now?: unknown }).drinking_now === true,
        tasted_with_names: Array.isArray(
          (entry as { tasted_with_user_ids?: unknown }).tasted_with_user_ids
        )
          ? (((entry as { tasted_with_user_ids?: unknown }).tasted_with_user_ids as string[]) ??
              []
            ).map((id) => getPublicProfileName(profileMap.get(id)))
          : [],
        author_name: getPublicProfileName(profileMap.get(entry.user_id)),
        author_avatar_url: avatarUrlByUserId.get(entry.user_id) ?? null,
        label_image_url: await signPhotoUrl(
          labelMap.get(entry.id) ?? normalizeNullableString(entry.label_image_path),
          supabase
        ),
        photo_gallery: groupedPost?.photo_gallery ?? [],
        entry_group: groupedPost?.entry_group ?? null,
        group_slides: groupedPost?.group_slides ?? [],
        can_react: interactionAccess.canReact,
        my_reactions: interactionAccess.canReact
          ? myReactionsByEntryId.get(entry.id) ?? []
          : [],
        reaction_counts: interactionAccess.canReact
          ? reactionCountsByEntryId.get(entry.id) ?? {}
          : {},
        reaction_users: interactionAccess.canReact ? buildReactionUsers(entry.id) : {},
      };
    })
  );

  return NextResponse.json({
    firstName: profile?.first_name ?? null,
    displayName: profile?.display_name ?? null,
    defaultEntryPrivacy: profile?.default_entry_privacy ?? "public",
    privacyConfirmedAt: profile?.privacy_confirmed_at ?? null,
    totalEntryCount: totalEntryCount ?? 0,
    friendCount: friendIds.length,
    recentEntries,
    circleEntries,
  });
}
