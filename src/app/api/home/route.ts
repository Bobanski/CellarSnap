import { NextResponse } from "next/server";
import { getPublicProfileName } from "@/lib/publicProfiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { executeSelectWithFallback } from "@/server/db/compat";
import { signPhotoUrl } from "@/server/storage/signedUrls";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  // ── Fetch user's 3 most recent entries ──
  const { data: ownRows } = await supabase
    .from("wine_entries")
    .select("*")
    .eq("user_id", user.id)
    .order("consumed_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(3);

  const ownEntries = ownRows ?? [];

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

  let friendEntries: typeof ownEntries = [];

  if (friendIds.length > 0) {
    const buildFriendQuery = (withFeedVisibilityFilter: boolean) => {
      let query = supabase
        .from("wine_entries")
        .select("*")
        .in("user_id", friendIds)
        .in("entry_privacy", ["public", "friends_of_friends", "friends"])
        .order("created_at", { ascending: false })
        .limit(6);
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

    const rawFriendEntries = (friendEntriesResult.data ?? []) as Array<
      Record<string, unknown> & { id: string; root_entry_id?: string | null }
    >;
    const dedupedByRoot = new Map<string, Record<string, unknown>>();

    rawFriendEntries.forEach((entry) => {
      const dedupeKey =
        typeof entry.root_entry_id === "string" && entry.root_entry_id.length > 0
          ? entry.root_entry_id
          : entry.id;
      const existing = dedupedByRoot.get(dedupeKey) as
        | (Record<string, unknown> & { root_entry_id?: string | null })
        | undefined;
      if (!existing) {
        dedupedByRoot.set(dedupeKey, entry);
        return;
      }

      const existingIsCanonical = !existing.root_entry_id;
      const nextIsCanonical = !entry.root_entry_id;
      if (nextIsCanonical && !existingIsCanonical) {
        dedupedByRoot.set(dedupeKey, entry);
      }
    });

    friendEntries = Array.from(dedupedByRoot.values()) as typeof ownEntries;
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

  // ── Resolve profiles for friend entries ──
  const friendUserIds = Array.from(
    new Set(friendEntries.map((e) => e.user_id))
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

  // ── Build response for own entries ──
  const recentEntries = await Promise.all(
    ownEntries.map(async (entry) => ({
      id: entry.id,
      wine_name: entry.wine_name,
      producer: entry.producer,
      vintage: entry.vintage,
      rating: entry.rating,
      qpr_level: entry.qpr_level,
      consumed_at: entry.consumed_at,
      label_image_url: await signPhotoUrl(
        labelMap.get(entry.id) ?? entry.label_image_path,
        supabase
      ),
    }))
  );

  // ── Build response for friend entries ──
  const circlEntries = await Promise.all(
    friendEntries.map(async (entry) => ({
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
        labelMap.get(entry.id) ?? entry.label_image_path,
        supabase
      ),
    }))
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
