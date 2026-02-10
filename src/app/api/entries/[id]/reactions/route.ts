import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_EMOJIS = ["🍷", "🔥", "❤️", "👀", "🤝"];

async function getFriendIds(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string
): Promise<Set<string>> {
  const { data: rows } = await supabase
    .from("friend_requests")
    .select("requester_id, recipient_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`);
  return new Set(
    (rows ?? []).map((r) =>
      r.requester_id === userId ? r.recipient_id : r.requester_id
    )
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: entryId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { emoji?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const emoji = typeof body.emoji === "string" ? body.emoji.trim() : "";
  if (!ALLOWED_EMOJIS.includes(emoji)) {
    return NextResponse.json(
      { error: "Invalid emoji. Use one of: 🍷, 🔥, ❤️, 👀, 🤝" },
      { status: 400 }
    );
  }

  const { data: entry, error: entryError } = await supabase
    .from("wine_entries")
    .select("id, user_id")
    .eq("id", entryId)
    .single();

  if (entryError || !entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  const friendIds = await getFriendIds(supabase, user.id);
  if (!friendIds.has(entry.user_id)) {
    return NextResponse.json(
      { error: "Only mutual friends can react to this entry." },
      { status: 403 }
    );
  }

  const { error: insertError } = await supabase.from("entry_reactions").insert({
    entry_id: entryId,
    user_id: user.id,
    emoji,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "Already reacted with this emoji." }, { status: 409 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, emoji });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: entryId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const emoji = url.searchParams.get("emoji")?.trim() ?? "";
  if (!ALLOWED_EMOJIS.includes(emoji)) {
    return NextResponse.json(
      { error: "Invalid emoji. Use one of: 🍷, 🔥, ❤️, 👀, 🤝" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("entry_reactions")
    .delete()
    .eq("entry_id", entryId)
    .eq("user_id", user.id)
    .eq("emoji", emoji);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
