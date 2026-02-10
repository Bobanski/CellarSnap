import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ACIDITY_LEVELS,
  ALCOHOL_LEVELS,
  BODY_LEVELS,
  SWEETNESS_LEVELS,
  TANNIN_LEVELS,
  normalizeAdvancedNotes,
} from "@/lib/advancedNotes";

const privacyLevelSchema = z.enum(["public", "friends", "private"]);

const nullableString = z.preprocess(
  (value) => {
    if (typeof value === "string" && value.trim() === "") return null;
    return value;
  },
  z.string().nullable().optional()
);

const nullableEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (value) => (value === "" ? null : value),
    z.enum(values).nullable().optional()
  );

const advancedNotesSchema = z
  .object({
    acidity: nullableEnum(ACIDITY_LEVELS),
    tannin: nullableEnum(TANNIN_LEVELS),
    alcohol: nullableEnum(ALCOHOL_LEVELS),
    sweetness: nullableEnum(SWEETNESS_LEVELS),
    body: nullableEnum(BODY_LEVELS),
  })
  .nullable()
  .optional();

const updateEntrySchema = z.object({
  wine_name: nullableString,
  producer: nullableString,
  vintage: nullableString,
  country: nullableString,
  region: nullableString,
  appellation: nullableString,
  rating: z.number().int().min(1).max(100).optional(),
  notes: nullableString,
  advanced_notes: advancedNotesSchema,
  location_text: nullableString,
  consumed_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  tasted_with_user_ids: z.array(z.string().uuid()).optional(),
  label_image_path: nullableString,
  place_image_path: nullableString,
  pairing_image_path: nullableString,
  entry_privacy: privacyLevelSchema.optional(),
  label_photo_privacy: privacyLevelSchema.nullable().optional(),
  place_photo_privacy: privacyLevelSchema.nullable().optional(),
});

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function createSignedUrl(path: string | null, supabase: SupabaseClient) {
  if (!path || path === "pending") return null;

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
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("wine_entries")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  const tastedWithIds = Array.isArray(data.tasted_with_user_ids)
    ? data.tasted_with_user_ids
    : [];
  let tastedWithUsers: { id: string; display_name: string | null; email: string | null }[] = [];

  if (tastedWithIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", tastedWithIds);

    const nameMap = new Map(
      (profiles ?? []).map((profile) => [
        profile.id,
        {
          display_name: profile.display_name ?? null,
          email: profile.email ?? null,
        },
      ])
    );

    tastedWithUsers = tastedWithIds.map((userId: string) => ({
      id: userId,
      display_name: nameMap.get(userId)?.display_name ?? null,
      email: nameMap.get(userId)?.email ?? null,
    }));
  }

  const entry = {
    ...data,
    label_image_url: await createSignedUrl(data.label_image_path, supabase),
    place_image_url: await createSignedUrl(data.place_image_path, supabase),
    pairing_image_url: await createSignedUrl(data.pairing_image_path, supabase),
    tasted_with_users: tastedWithUsers,
  };

  return NextResponse.json({ entry });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = updateEntrySchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json(
      { error: payload.error.flatten() },
      { status: 400 }
    );
  }

  const normalizedData = {
    ...payload.data,
    advanced_notes:
      payload.data.advanced_notes === undefined
        ? undefined
        : normalizeAdvancedNotes(payload.data.advanced_notes),
  };

  const updates = Object.fromEntries(
    Object.entries(normalizedData).filter(([, value]) => value !== undefined)
  );

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("wine_entries")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error || !data) {
    if (error?.message.includes("advanced_notes")) {
      return NextResponse.json(
        {
          error:
            "Advanced notes are not available yet. Run supabase/sql/013_advanced_notes.sql and try again.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: error?.message ?? "Update failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ entry: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: existing, error: fetchError } = await supabase
    .from("wine_entries")
    .select("label_image_path, place_image_path, pairing_image_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  const { data: photoRows, error: photoFetchError } = await supabase
    .from("entry_photos")
    .select("path")
    .eq("entry_id", id);

  if (photoFetchError) {
    return NextResponse.json({ error: photoFetchError.message }, { status: 500 });
  }

  const paths = Array.from(
    new Set([
      existing.label_image_path,
      existing.place_image_path,
      existing.pairing_image_path,
      ...(photoRows ?? []).map((photo) => photo.path),
    ].filter((p): p is string => Boolean(p && p !== "pending")))
  );

  const { error } = await supabase
    .from("wine_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (paths.length > 0) {
    await supabase.storage.from("wine-photos").remove(paths);
  }

  return NextResponse.json({ success: true });
}
