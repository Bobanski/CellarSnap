import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  canUserViewEntry,
  getAcceptedFriendIds,
} from "@/lib/access/entryVisibility";

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
  if (error) return null;
  return data.signedUrl;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: userId } = await params;
  if (!userId) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  const { data: entries, error } = await supabase
    .from("wine_entries")
    .select("*")
    .contains("tasted_with_user_ids", [userId])
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let acceptedFriendIds: Set<string>;
  try {
    acceptedFriendIds = await getAcceptedFriendIds(supabase, user.id);
  } catch (friendError) {
    const message =
      friendError instanceof Error
        ? friendError.message
        : "Unable to verify friendship.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const visibleEntries = [];
  for (const entry of entries ?? []) {
    const canView = await canUserViewEntry({
      supabase,
      viewerUserId: user.id,
      ownerUserId: entry.user_id,
      entryPrivacy: entry.entry_privacy,
      acceptedFriendIds,
    });
    if (canView) {
      visibleEntries.push(entry);
    }
  }

  const authorIds = Array.from(
    new Set(visibleEntries.map((entry) => entry.user_id))
  );
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", authorIds);

  const authorMap = new Map(
    (profiles ?? []).map((p) => [
      p.id,
      p.display_name ?? "Unknown",
    ])
  );

  const entryIds = visibleEntries.map((entry) => entry.id);
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

  const result = await Promise.all(
    visibleEntries.map(async (entry) => ({
      ...entry,
      author_name: authorMap.get(entry.user_id) ?? "Unknown",
      label_image_url: await createSignedUrl(
        labelMap.get(entry.id) ?? entry.label_image_path,
        supabase
      ),
      place_image_url: await createSignedUrl(entry.place_image_path, supabase),
    }))
  );

  return NextResponse.json({ entries: result });
}
