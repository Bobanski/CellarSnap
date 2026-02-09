import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_PER_TYPE = 3;
const typeSchema = z.enum(["label", "place", "pairing"]);

const createSchema = z.object({
  type: typeSchema,
});

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function createSignedUrl(path: string, supabase: SupabaseClient) {
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

  const { data: entry, error: entryError } = await supabase
    .from("wine_entries")
    .select("id, user_id, entry_privacy")
    .eq("id", id)
    .single();

  if (entryError || !entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  if (entry.user_id !== user.id) {
    if (entry.entry_privacy === "private") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (entry.entry_privacy === "friends") {
      const { data: friendRows } = await supabase
        .from("friend_requests")
        .select("requester_id, recipient_id")
        .eq("status", "accepted")
        .or(
          `requester_id.eq.${user.id},recipient_id.eq.${user.id}`
        );

      const isFriend = (friendRows ?? []).some(
        (row) =>
          (row.requester_id === user.id && row.recipient_id === entry.user_id) ||
          (row.recipient_id === user.id && row.requester_id === entry.user_id)
      );

      if (!isFriend) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    }
  }

  const { data, error } = await supabase
    .from("entry_photos")
    .select("id, entry_id, type, path, position, created_at")
    .eq("entry_id", id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const photos = await Promise.all(
    (data ?? []).map(async (photo) => ({
      ...photo,
      signed_url: await createSignedUrl(photo.path, supabase),
    }))
  );

  return NextResponse.json({ photos });
}

export async function POST(
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

  const payload = createSchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json(
      { error: payload.error.flatten() },
      { status: 400 }
    );
  }

  const { count } = await supabase
    .from("entry_photos")
    .select("id", { count: "exact", head: true })
    .eq("entry_id", id)
    .eq("type", payload.data.type);

  if ((count ?? 0) >= MAX_PER_TYPE) {
    return NextResponse.json(
      { error: `Max ${MAX_PER_TYPE} photos for ${payload.data.type}.` },
      { status: 400 }
    );
  }

  const { data: created, error } = await supabase
    .from("entry_photos")
    .insert({
      entry_id: id,
      type: payload.data.type,
      path: "pending",
      position: count ?? 0,
    })
    .select("id, entry_id, type, position")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? "Create failed" }, { status: 500 });
  }

  const path = `${user.id}/${id}/${created.type}/${created.id}.jpg`;

  const { error: updateError } = await supabase
    .from("entry_photos")
    .update({ path })
    .eq("id", created.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    photo: {
      id: created.id,
      entry_id: id,
      type: created.type,
      path,
      position: created.position,
    },
  });
}
