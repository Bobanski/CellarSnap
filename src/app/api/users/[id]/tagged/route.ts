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

  const authorIds = Array.from(
    new Set((entries ?? []).map((e) => e.user_id))
  );
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", authorIds);

  const authorMap = new Map(
    (profiles ?? []).map((p) => [
      p.id,
      p.display_name ?? p.email ?? "Unknown",
    ])
  );

  const result = await Promise.all(
    (entries ?? []).map(async (entry) => ({
      ...entry,
      author_name: authorMap.get(entry.user_id) ?? "Unknown",
      label_image_url: await createSignedUrl(entry.label_image_path, supabase),
      place_image_url: await createSignedUrl(entry.place_image_path, supabase),
    }))
  );

  return NextResponse.json({ entries: result });
}
