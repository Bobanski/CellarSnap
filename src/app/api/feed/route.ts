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

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: entries, error } = await supabase
    .from("wine_entries")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = Array.from(new Set((entries ?? []).map((entry) => entry.user_id)));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", userIds);

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      profile.display_name ?? profile.email ?? "Unknown",
    ])
  );

  const feedEntries = await Promise.all(
    (entries ?? []).map(async (entry) => ({
      ...entry,
      author_name: profileMap.get(entry.user_id) ?? "Unknown",
      label_image_url: await createSignedUrl(entry.label_image_path, supabase),
      place_image_url: await createSignedUrl(entry.place_image_path, supabase),
    }))
  );

  return NextResponse.json({ entries: feedEntries });
}
