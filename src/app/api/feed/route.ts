import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(50, Math.max(1, rawLimit)) : 30;

  // Friend set for scope + can_react (mutual friends only)
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
  const friendIdsSet = new Set(friendIds);

  const selectFields =
    "id, user_id, wine_name, producer, consumed_at, rating, qpr_level, tasted_with_user_ids, label_image_path, entry_privacy, created_at";
  let entriesQuery = supabase.from("wine_entries").select(selectFields);

  if (scope === "friends") {
    if (friendIds.length === 0) {
      return NextResponse.json({ entries: [] });
    }

    entriesQuery = entriesQuery
      .in("user_id", friendIds)
      .in("entry_privacy", ["public", "friends"]);
  } else {
    entriesQuery = entriesQuery.eq("entry_privacy", "public").neq("user_id", user.id);
  }

  if (cursor) {
    entriesQuery = entriesQuery.lt("created_at", cursor);
  }

  const { data: entries, error } = await entriesQuery
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pageEntries = entries && entries.length > limit ? entries.slice(0, limit) : (entries ?? []);
  const has_more = (entries?.length ?? 0) > limit;
  const next_cursor = has_more ? pageEntries[pageEntries.length - 1]?.created_at ?? null : null;

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

  let profiles: { id: string; display_name: string | null; email: string | null; avatar_path?: string | null }[] | null = null;
  if (profilesError && (profilesError.message.includes("avatar_path") || profilesError.message.includes("column"))) {
    const { data: fallback } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", userIds);
    profiles = (fallback ?? []).map((p) => ({ ...p, avatar_path: null }));
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

  const { data: labelPhotos } =
    entryIds.length > 0
      ? await supabase
          .from("entry_photos")
          .select("entry_id, path, position, created_at")
          .eq("type", "label")
          .in("entry_id", entryIds)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true })
      : { data: [] };

  const labelMap = new Map<string, string>();
  (labelPhotos ?? []).forEach((photo) => {
    if (!labelMap.has(photo.entry_id)) {
      labelMap.set(photo.entry_id, photo.path);
    }
  });

  // Reactions: counts per entry per emoji, and current user's reactions per entry
  const reactionCountsMap = new Map<string, Record<string, number>>();
  const myReactionsMap = new Map<string, string[]>();
  if (entryIds.length > 0) {
    const { data: reactions } = await supabase
      .from("entry_reactions")
      .select("entry_id, user_id, emoji")
      .in("entry_id", entryIds);
    (reactions ?? []).forEach((r: { entry_id: string; user_id: string; emoji: string }) => {
      const counts = reactionCountsMap.get(r.entry_id) ?? {};
      counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
      reactionCountsMap.set(r.entry_id, counts);
      if (r.user_id === user.id) {
        const mine = myReactionsMap.get(r.entry_id) ?? [];
        if (!mine.includes(r.emoji)) mine.push(r.emoji);
        myReactionsMap.set(r.entry_id, mine);
      }
    });
  }

  // Sign only the URLs that this page actually renders (author avatar + label)
  const pathsToSign = new Set<string>();
  const authorAvatarPathByUserId = new Map<string, string>();
  const labelPathByEntryId = new Map<string, string>();

  pageEntries.forEach((entry) => {
    const authorProfile = profileMap.get(entry.user_id);
    const avatarPath = authorProfile?.avatar_path ?? null;
    if (avatarPath) {
      pathsToSign.add(avatarPath);
      authorAvatarPathByUserId.set(entry.user_id, avatarPath);
    }

    const labelPath = labelMap.get(entry.id) ?? entry.label_image_path ?? null;
    if (labelPath) {
      pathsToSign.add(labelPath);
      labelPathByEntryId.set(entry.id, labelPath);
    }
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
    const labelPath = labelPathByEntryId.get(entry.id) ?? null;

    const tastedWithUsers = (entry.tasted_with_user_ids ?? []).map((id: string) => ({
      id,
      display_name: profileMap.get(id)?.display_name ?? null,
      email: profileMap.get(id)?.email ?? null,
    }));

    const isFriendOfAuthor = friendIdsSet.has(entry.user_id);
    const can_react = isFriendOfAuthor && entry.user_id !== user.id;
    const reaction_counts = reactionCountsMap.get(entry.id) ?? {};
    const my_reactions = myReactionsMap.get(entry.id) ?? [];

    return {
      ...entry,
      author_name: authorProfile?.display_name ?? authorProfile?.email ?? "Unknown",
      author_avatar_url: avatarPath ? signedUrlByPath.get(avatarPath) ?? null : null,
      label_image_url: labelPath ? signedUrlByPath.get(labelPath) ?? null : null,
      // Not used by /feed UI; omit signing work (kept as null for compatibility)
      place_image_url: null,
      pairing_image_url: null,
      tasted_with_users: tastedWithUsers,
      can_react,
      reaction_counts,
      my_reactions,
    };
  });

  return NextResponse.json({ entries: feedEntries, next_cursor, has_more });
}
