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

  let entriesQuery = supabase.from("wine_entries").select("*");

  if (scope === "friends") {
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

    if (friendIds.length === 0) {
      return NextResponse.json({ entries: [] });
    }

    entriesQuery = entriesQuery
      .in("user_id", friendIds)
      .in("entry_privacy", ["public", "friends"]);
  } else {
    entriesQuery = entriesQuery.eq("entry_privacy", "public").neq("user_id", user.id);
  }

  const { data: entries, error } = await entriesQuery.order("created_at", {
    ascending: false,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = Array.from(
    new Set(
      (entries ?? []).flatMap((entry) => [
        entry.user_id,
        ...(entry.tasted_with_user_ids ?? []),
      ])
    )
  );
  const entryIds = (entries ?? []).map((entry) => entry.id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", userIds);

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      {
        display_name: profile.display_name ?? null,
        email: profile.email ?? null,
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

  const feedEntries = await Promise.all(
    (entries ?? []).map(async (entry) => {
      const tastedWithUsers = (entry.tasted_with_user_ids ?? []).map(
        (id: string) => ({
          id,
          display_name: profileMap.get(id)?.display_name ?? null,
          email: profileMap.get(id)?.email ?? null,
        })
      );

      return {
        ...entry,
        author_name:
          profileMap.get(entry.user_id)?.display_name ??
          profileMap.get(entry.user_id)?.email ??
          "Unknown",
        label_image_url: await createSignedUrl(
          labelMap.get(entry.id) ?? entry.label_image_path,
          supabase
        ),
        place_image_url: await createSignedUrl(entry.place_image_path, supabase),
        tasted_with_users: tastedWithUsers,
      };
    })
  );

  return NextResponse.json({ entries: feedEntries });
}
