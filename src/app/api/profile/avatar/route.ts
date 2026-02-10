import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const AVATAR_PATH_PREFIX = "avatar";
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let file: File;
  try {
    const formData = await request.formData();
    const uploaded = formData.get("file") ?? formData.get("avatar");
    if (!uploaded || !(uploaded instanceof File)) {
      return NextResponse.json(
        { error: "No file provided. Use form field 'file' or 'avatar'." },
        { status: 400 }
      );
    }
    file = uploaded;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Image must be 5 MB or smaller." },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Image must be JPEG, PNG, WebP, or GIF." },
      { status: 400 }
    );
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : "jpg";
  const path = `${user.id}/${AVATAR_PATH_PREFIX}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("wine-photos")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    return NextResponse.json(
      { error: uploadError.message },
      { status: 500 }
    );
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_path: path })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  const { data: urlData } = await supabase.storage
    .from("wine-photos")
    .createSignedUrl(path, 60 * 60);

  return NextResponse.json({
    avatar_url: urlData?.signedUrl ?? null,
    avatar_path: path,
  });
}
