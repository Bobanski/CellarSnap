import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAcceptedFriendIds } from "@/lib/access/entryVisibility";

const ALLOWED_EMOJIS = ["🍷", "🔥", "❤️", "👀", "🤝"];

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
    .select("id, user_id, entry_privacy")
    .eq("id", entryId)
    .single();

  if (entryError || !entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  if (entry.user_id === user.id) {
    return NextResponse.json(
      { error: "You cannot react to your own entry." },
      { status: 403 }
    );
  }

  if (entry.entry_privacy === "private") {
    return NextResponse.json(
      { error: "Cannot react to a private entry." },
      { status: 403 }
    );
  }

  let friendIds: Set<string>;
  try {
    friendIds = await getAcceptedFriendIds(supabase, user.id);
  } catch (friendError) {
    const message =
      friendError instanceof Error
        ? friendError.message
        : "Unable to verify friendship.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

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
