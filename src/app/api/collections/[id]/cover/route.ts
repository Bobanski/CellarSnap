import { NextResponse } from "next/server";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { updateUserCollectionCover } from "@/server/collections/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireRequestAuth(request);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }

  let file: File;
  try {
    const formData = await request.formData();
    const uploaded = formData.get("file") ?? formData.get("cover");
    if (!uploaded || !(uploaded instanceof File)) {
      return NextResponse.json(
        { error: "No file provided. Use form field 'file' or 'cover'." },
        { status: 400 }
      );
    }
    file = uploaded;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { id } = await params;

  try {
    const collection = await updateUserCollectionCover({
      supabase: auth.supabase,
      userId: auth.user.id,
      collectionId: id,
      file,
    });
    return NextResponse.json({ collection });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to update collection cover.";
    const status =
      message === "Collection not found."
        ? 404
        : message === "Image must be 5 MB or smaller." ||
            message === "Image must be JPEG, PNG, WebP, or GIF."
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
