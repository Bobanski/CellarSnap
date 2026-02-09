import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function createSignedUrl(path: string | null, supabase: SupabaseClient) {
  if (!path || path === "pending") {
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

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Fetch user profile ──
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

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
    const { data: friendEntryRows } = await supabase
      .from("wine_entries")
      .select("*")
      .in("user_id", friendIds)
      .in("entry_privacy", ["public", "friends"])
      .order("created_at", { ascending: false })
      .limit(6);

    friendEntries = friendEntryRows ?? [];
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
          .from("profiles")
          .select("id, display_name, email")
          .in("id", friendUserIds)
      : { data: [] };

  const profileMap = new Map(
    (friendProfiles ?? []).map((p) => [
      p.id,
      { display_name: p.display_name ?? null, email: p.email ?? null },
    ])
  );

  // ── Build response for own entries ──
  const recentEntries = await Promise.all(
    ownEntries.map(async (entry) => ({
      id: entry.id,
      wine_name: entry.wine_name,
      producer: entry.producer,
      vintage: entry.vintage,
      rating: entry.rating,
      consumed_at: entry.consumed_at,
      label_image_url: await createSignedUrl(
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
      consumed_at: entry.consumed_at,
      author_name:
        profileMap.get(entry.user_id)?.display_name ??
        profileMap.get(entry.user_id)?.email ??
        "Unknown",
      label_image_url: await createSignedUrl(
        labelMap.get(entry.id) ?? entry.label_image_path,
        supabase
      ),
    }))
  );

  return NextResponse.json({
    displayName: profile?.display_name ?? null,
    totalEntryCount: totalEntryCount ?? 0,
    friendCount: friendIds.length,
    recentEntries,
    circleEntries: circlEntries,
  });
}
