import { NextResponse } from "next/server";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { signPhotoUrl } from "@/server/storage/signedUrls";

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
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const entries = await Promise.all(
    (data ?? []).map(async (entry) => ({
      ...entry,
      label_image_url: await signPhotoUrl(
        entry.label_image_path,
        supabase
      ),
    }))
  );

  return NextResponse.json({ entries });
}
