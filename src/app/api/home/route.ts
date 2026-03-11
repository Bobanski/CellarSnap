import { NextResponse } from "next/server";
import { getFriendsOfFriendsIds } from "@/lib/access/entryVisibility";
import { resolveInteractionAccessForViewer } from "@/lib/access/interactionVisibility";
import { isTestAccount } from "@/lib/access/testAccounts";
import { getPublicProfileName } from "@/lib/publicProfiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { executeSelectWithFallback } from "@/server/db/compat";
import { resolveGroupedPostData } from "@/server/entries/groupPosts";
import { signPhotoUrl } from "@/server/storage/signedUrls";
import type { EntryPrivacy } from "@/lib/access/entryVisibility";

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

function normalizeEntryPrivacy(value: unknown): EntryPrivacy {
  if (
    value === "public" ||
    value === "friends_of_friends" ||
    value === "friends" ||
    value === "private"
  ) {
    return value;
  }
  return "public";
}

function normalizeNullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const viewerIsTestAccount = await isTestAccount(supabase, user.id);

  // ── Fetch user profile ──
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

  // ── Fetch user's total entry count (for first-time detection) ──
  const { count: totalEntryCount } = await supabase
    .from("wine_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  // ── Fetch user's recent grouped/visible posts ──
  const ownEntriesResult = await executeSelectWithFallback({
    attempts: [
      {
        withFeedVisibilityFilter: true,
        missingColumns: ["is_feed_visible"] as const,
      },
      { withFeedVisibilityFilter: false, missingColumns: [] as const },
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
  ).slice(0, 3);

  // ── Fetch friends' recent entries (up to 6) ──
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
    const buildFriendQuery = (withFeedVisibilityFilter: boolean) => {
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
      return query;
    };

    const friendEntriesResult = await executeSelectWithFallback({
      attempts: [
        {
          withFeedVisibilityFilter: true,
          missingColumns: ["is_feed_visible"] as const,
        },
        { withFeedVisibilityFilter: false, missingColumns: [] as const },
      ],
      getFallbackColumns: (attempt) => attempt.missingColumns,
      fallbackOnAnyMissingColumn: true,
      attempt: async (attempt) => {
        const response = await buildFriendQuery(attempt.withFeedVisibilityFilter);
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
    friendEntries = dedupeHomeEntries(rawFriendEntries).slice(0, 6);
  }

  // ── Resolve label photos for all entries ──
  const allEntries = [...ownEntries, ...friendEntries];
  const allEntryIds = allEntries.map((e) => e.id);

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

  // ── Resolve profiles for friend entries ──
  const friendUserIds = Array.from(
    new Set([
      ...friendEntries.map((e) => e.user_id),
      ...Array.from(reactorUserIds),
    ])
  );

  const { data: friendProfiles } =
    friendUserIds.length > 0
      ? await supabase
          .from("public_profiles")
          .select("id, display_name, email")
          .in("id", friendUserIds)
      : { data: [] };

  const profileMap = new Map(
    (friendProfiles ?? []).map((profile) => [profile.id, profile])
  );
  const acceptedFriendIds = new Set(friendIds);
  const friendsOfFriendsIds = viewerIsTestAccount
    ? new Set<string>()
    : await getFriendsOfFriendsIds(supabase, user.id, acceptedFriendIds);

  // ── Build response for own entries ──
  const recentEntries = await Promise.all(
    ownEntries.map(async (entry) => {
      const interactionAccess = await resolveInteractionAccessForViewer({
        supabase,
        viewerUserId: user.id,
        ownerUserId: entry.user_id,
        entryPrivacy: normalizeEntryPrivacy(entry.entry_privacy),
        reactionPrivacy: normalizeEntryPrivacy(
          (entry as { reaction_privacy?: unknown }).reaction_privacy
        ),
        commentsPrivacy: normalizeEntryPrivacy(
          (entry as { comments_privacy?: unknown }).comments_privacy
        ),
        commentsScope: normalizeNullableString(
          (entry as { comments_scope?: unknown }).comments_scope
        ),
        acceptedFriendIds,
        friendsOfFriendsIds,
      });

      const groupedPost = groupedPostByEntryId.get(entry.id);

      return {
      id: entry.id,
      wine_name: entry.wine_name,
      producer: entry.producer,
      vintage: entry.vintage,
      rating: entry.rating,
      qpr_level: entry.qpr_level,
      consumed_at: entry.consumed_at,
      label_image_url: await signPhotoUrl(
        labelMap.get(entry.id) ?? normalizeNullableString(entry.label_image_path),
        supabase
      ),
      photo_gallery: groupedPost?.photo_gallery ?? [],
      entry_group: groupedPost?.entry_group ?? null,
      group_slides: groupedPost?.group_slides ?? [],
      can_react: interactionAccess.canReact,
      my_reactions: interactionAccess.canReact ? myReactionsByEntryId.get(entry.id) ?? [] : [],
      reaction_counts: interactionAccess.canReact ? reactionCountsByEntryId.get(entry.id) ?? {} : {},
      reaction_users: interactionAccess.canReact
        ? Object.fromEntries(
            Object.entries(reactionUserIdsByEntryId.get(entry.id) ?? {}).map(
              ([emoji, ids]) => [
                emoji,
                ids.map((id) => getPublicProfileName(profileMap.get(id))),
              ]
            )
          )
        : {},
    };
    })
  );

  // ── Build response for friend entries ──
  const circlEntries = await Promise.all(
    friendEntries.map(async (entry) => {
      const interactionAccess = await resolveInteractionAccessForViewer({
        supabase,
        viewerUserId: user.id,
        ownerUserId: entry.user_id,
        entryPrivacy: normalizeEntryPrivacy(entry.entry_privacy),
        reactionPrivacy: normalizeEntryPrivacy(
          (entry as { reaction_privacy?: unknown }).reaction_privacy
        ),
        commentsPrivacy: normalizeEntryPrivacy(
          (entry as { comments_privacy?: unknown }).comments_privacy
        ),
        commentsScope: normalizeNullableString(
          (entry as { comments_scope?: unknown }).comments_scope
        ),
        acceptedFriendIds,
        friendsOfFriendsIds,
      });

      const groupedPost = groupedPostByEntryId.get(entry.id);

      return {
      id: entry.id,
      user_id: entry.user_id,
      wine_name: entry.wine_name,
      producer: entry.producer,
      vintage: entry.vintage,
      rating: entry.rating,
      qpr_level: entry.qpr_level,
      consumed_at: entry.consumed_at,
      author_name:
        getPublicProfileName(profileMap.get(entry.user_id)),
      label_image_url: await signPhotoUrl(
        labelMap.get(entry.id) ?? normalizeNullableString(entry.label_image_path),
        supabase
      ),
      photo_gallery: groupedPost?.photo_gallery ?? [],
      entry_group: groupedPost?.entry_group ?? null,
      group_slides: groupedPost?.group_slides ?? [],
      can_react: interactionAccess.canReact,
      my_reactions: interactionAccess.canReact ? myReactionsByEntryId.get(entry.id) ?? [] : [],
      reaction_counts: interactionAccess.canReact ? reactionCountsByEntryId.get(entry.id) ?? {} : {},
      reaction_users: interactionAccess.canReact
        ? Object.fromEntries(
            Object.entries(reactionUserIdsByEntryId.get(entry.id) ?? {}).map(
              ([emoji, ids]) => [
                emoji,
                ids.map((id) => getPublicProfileName(profileMap.get(id))),
              ]
            )
          )
        : {},
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
    circleEntries: circlEntries,
  });
}
