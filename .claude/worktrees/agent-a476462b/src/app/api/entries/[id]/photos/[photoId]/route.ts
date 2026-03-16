import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MAX_ENTRY_PHOTOS_PER_TYPE } from "@/lib/photoLimits";

const updateSchema = z.object({
  position: z.number().int().min(0).optional(),
  type: z
    .enum(["label", "place", "people", "pairing", "lineup", "other_bottles"])
    .optional(),
}).superRefine((value, ctx) => {
  if (value.position === undefined && value.type === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide at least one field to update.",
      path: ["position"],
    });
  }
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  const { id, photoId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: entry, error: entryError } = await supabase
    .from("wine_entries")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (entryError || !entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  if (entry.user_id !== user.id) {
    return NextResponse.json(
      { error: "Only the entry owner can edit photos." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = updateSchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json(
      { error: payload.error.flatten() },
      { status: 400 }
    );
  }

  const { data: existingPhoto, error: existingPhotoError } = await supabase
    .from("entry_photos")
    .select("id, type, position")
    .eq("id", photoId)
    .eq("entry_id", id)
    .maybeSingle();

  if (existingPhotoError || !existingPhoto) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  let nextType = existingPhoto.type;
  let nextTypeCount: number | null = null;
  if (payload.data.type) {
    nextType = payload.data.type;
  }

  if (nextType !== existingPhoto.type) {
    const { count, error: countError } = await supabase
      .from("entry_photos")
      .select("id", { count: "exact", head: true })
      .eq("entry_id", id)
      .eq("type", nextType);
    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }
    nextTypeCount = count ?? 0;
    if ((count ?? 0) >= MAX_ENTRY_PHOTOS_PER_TYPE) {
      return NextResponse.json(
        {
          error: `Max ${MAX_ENTRY_PHOTOS_PER_TYPE} photos for ${nextType}.`,
        },
        { status: 400 }
      );
    }
  }

  const nextPosition =
    payload.data.position ??
    (nextType !== existingPhoto.type
      ? (nextTypeCount ?? 0)
      : existingPhoto.position);

  const { data: updated, error } = await supabase
    .from("entry_photos")
    .update({
      position: nextPosition,
      type: nextType,
    })
    .eq("id", photoId)
    .eq("entry_id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  const { id, photoId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: entry, error: entryError } = await supabase
    .from("wine_entries")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (entryError || !entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  if (entry.user_id !== user.id) {
    return NextResponse.json(
      { error: "Only the entry owner can delete photos." },
      { status: 403 }
    );
  }

  const { data: photo, error: fetchError } = await supabase
    .from("entry_photos")
    .select("id, path")
    .eq("id", photoId)
    .eq("entry_id", id)
    .single();

  if (fetchError || !photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  const { error: deleteError } = await supabase
    .from("entry_photos")
    .delete()
    .eq("id", photoId)
    .eq("entry_id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (photo.path && photo.path !== "pending") {
    await supabase.storage.from("wine-photos").remove([photo.path]);
  }

  return NextResponse.json({ success: true });
}
