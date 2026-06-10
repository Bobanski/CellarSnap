import { NextResponse } from "next/server";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { signPhotoUrls } from "@/server/storage/signedUrls";

export async function GET(request: Request) {
  let auth;
  try {
    auth = await requireRequestAuth(request);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }

  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from("wine_entries")
    .select(
      "id, wine_name, producer, vintage, country, region, appellation, wine_type, cellar_quantity, bottle_format, label_image_path, created_at"
    )
    .eq("user_id", user.id)
    .eq("entry_status", "cellaring")
    .gt("cellar_quantity", 0)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const signedUrlMap = await signPhotoUrls(
    rows.map((e) => e.label_image_path),
    supabase
  );
  const entries = rows.map((entry) => ({
    ...entry,
    label_image_url: entry.label_image_path
      ? (signedUrlMap.get(entry.label_image_path) ?? null)
      : null,
  }));

  return NextResponse.json({ entries });
}
