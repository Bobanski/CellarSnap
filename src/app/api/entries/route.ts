import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const nullableString = z.preprocess(
  (value) => {
    if (typeof value === "string" && value.trim() === "") {
      return null;
    }
    return value;
  },
  z.string().nullable().optional()
);

const createEntrySchema = z.object({
  wine_name: nullableString,
  producer: nullableString,
  vintage: nullableString,
  region: nullableString,
  rating: z.number().int().min(1).max(10),
  notes: nullableString,
  location_text: nullableString,
  consumed_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

async function createSignedUrl(path: string | null, supabase: ReturnType<typeof createSupabaseServerClient>) {
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
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("wine_entries")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const entries = await Promise.all(
    (data ?? []).map(async (entry) => ({
      ...entry,
      label_image_url: await createSignedUrl(entry.label_image_path, supabase),
      place_image_url: await createSignedUrl(entry.place_image_path, supabase),
    }))
  );

  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = createEntrySchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  const consumedAt =
    payload.data.consumed_at ?? new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("wine_entries")
    .insert({
      user_id: user.id,
      wine_name: payload.data.wine_name ?? null,
      producer: payload.data.producer ?? null,
      vintage: payload.data.vintage ?? null,
      region: payload.data.region ?? null,
      rating: payload.data.rating,
      notes: payload.data.notes ?? null,
      location_text: payload.data.location_text ?? null,
      consumed_at: consumedAt,
      label_image_path: "pending",
      place_image_path: null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entry: data });
}
